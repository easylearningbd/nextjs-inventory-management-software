'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

export type ActionResult = { error?: string; success?: boolean };

// ── Product search (warehouse-scoped) ─────────────────────────────────────────
// Returns only products that have stock > 0 in the selected warehouse.
// A return can only use items you actually hold — unlike a purchase which can
// introduce new stock from any supplier.

export type SearchProductForReturn = {
  id:           number;
  name:         string;
  code:         string;
  productUnit:  string;
  price:        number;
  currentStock: number;
};

export async function searchProductsForReturn(
  query:       string,
  warehouseId: number | null,
): Promise<SearchProductForReturn[]> {
  const q = query.trim();
  if (!q || !warehouseId) return [];

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
      ],
      stocks: {
        some: {
          warehouseId,
          quantity: { gt: 0 },
        },
      },
    },
    select: {
      id:          true,
      name:        true,
      code:        true,
      productUnit: true,
      price:       true,
      stocks: {
        where:  { warehouseId },
        select: { quantity: true },
      },
    },
    orderBy: { name: 'asc' },
    take:    10,
  });

  return products.map((p) => ({
    id:           p.id,
    name:         p.name,
    code:         p.code,
    productUnit:  p.productUnit,
    price:        Number(p.price),
    currentStock: p.stocks[0]?.quantity ?? 0,
  }));
}

// ── Shared validation schemas ─────────────────────────────────────────────────

const STATUSES   = ['Received', 'Ordered', 'Pending'] as const;
const DISC_TYPES = ['Fixed', 'Percentage']            as const;
const TAX_TYPES  = ['Inclusive', 'Exclusive']         as const;
const PAY_TYPES  = ['Cash', 'Card', 'Cheque', 'Bank Transfer'] as const;

const itemSchema = z.object({
  productId:    z.number().int().positive(),
  quantity:     z.number().int().min(1, 'Quantity must be at least 1.'),
  netUnitCost:  z.number().min(0, 'Unit cost cannot be negative.'),
  discountType: z.enum(DISC_TYPES),
  discount:     z.number().min(0, 'Discount cannot be negative.'),
  taxType:      z.enum(TAX_TYPES),
  orderTax:     z.number().min(0).max(100, 'Tax rate must be 0–100%.'),
  returnUnit:   z.string().min(1, 'Return unit is required.'),
});


// ── Delete purchase return ────────────────────────────────────────────────────
// Pending / Ordered: soft-delete immediately (no stock was moved).
// Received: ADDS stock back to ProductStock for every line — deleting a
// Received return undoes the outbound movement, so stock must be restored.
// (This is the opposite of deleting a purchase, which subtracts stock.)

export async function deletePurchaseReturn(id: number): Promise<ActionResult> {
  const denied = await can('Manage Purchase Return');
  if (denied) return { error: denied };

  const pr = await db.purchaseReturn.findFirst({
    where:  { id, deletedAt: null },
    select: {
      status:      true,
      reference:   true,
      warehouseId: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!pr) return { error: 'Purchase return not found.' };

  if (pr.status === 'Received') {
    try {
      await db.$transaction(async (tx) => {
        // Deleting a Received return means the returned goods are conceptually
        // going back to the warehouse — so we ADD quantity back.
        for (const item of pr.items) {
          await applyStockAdjustment(tx, item.productId, pr.warehouseId, item.quantity, 'Addition');
        }
        await tx.purchaseReturn.update({
          where: { id },
          data:  { deletedAt: new Date() },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reverse stock.';
      return { error: `Cannot delete: ${msg}` };
    }
  } else {
    await db.purchaseReturn.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
  }

  revalidatePath('/purchases/returns');
  return { success: true };
}

// ── Create purchase return ────────────────────────────────────────────────────

export async function createPurchaseReturn(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Purchase Return');
  if (denied) return { error: denied };

  // 2. Parse header fields
  const dateStr   = (formData.get('date')        as string)?.trim();
  const whIdRaw   = formData.get('warehouseId')  as string;
  const supIdRaw  = formData.get('supplierId')   as string;
  const statusRaw = (formData.get('status')      as string)?.trim();
  const notes     = (formData.get('notes')       as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,  10);
  const supplierId  = parseInt(supIdRaw, 10);

  if (!dateStr)                                   return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0)     return { error: 'Warehouse is required.' };
  if (isNaN(supplierId)  || supplierId  <= 0)     return { error: 'Supplier is required.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number])) {
    return { error: 'Invalid status.' };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  const status = statusRaw as typeof STATUSES[number];

  // 3. Parse order-level numbers
  const orderTaxPct  = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping     = parseFloat(formData.get('shipping')     as string) || 0;

  if (orderTaxPct  < 0 || orderTaxPct  > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                        return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                        return { error: 'Shipping cannot be negative.' };

  // 4. Parse + validate line items
  let rawItems: unknown;
  try {
    rawItems = JSON.parse((formData.get('items') as string) ?? '[]');
  } catch {
    return { error: 'Invalid items payload.' };
  }

  const itemsResult = z
    .array(itemSchema)
    .min(1, 'At least one item is required.')
    .safeParse(rawItems);

  if (!itemsResult.success) {
    return { error: itemsResult.error.issues[0]?.message ?? 'Validation failed.' };
  }
  const items = itemsResult.data;

  // 5. Re-read all IDs server-side (never trust client-supplied values)
  const [warehouse, supplier] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.supplier.findFirst({ where: { id: supplierId,  deletedAt: null }, select: { id: true } }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!supplier)  return { error: 'Selected supplier not found.' };

  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
  const activeProducts   = await db.product.findMany({
    where:  { id: { in: uniqueProductIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // 6. Recompute all totals server-side (never trust client-sent values)
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitCost,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const grand = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });

  // 7. Atomic transaction: header → reference → items → stock
  // A purchase return is stock-OUTBOUND (warehouse → supplier).
  // When status=Received, each line DECREMENTS warehouse stock via Subtraction.
  // applyStockAdjustment throws if stock would go negative — the $transaction
  // rolls back automatically, protecting inventory integrity.
  try {
    await db.$transaction(async (tx) => {
      const ret = await tx.purchaseReturn.create({
        data: {
          reference:   `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          supplierId:  supplier.id,
          warehouseId: warehouse.id,
          date,
          status,
          orderTax:    orderTaxPct.toFixed(2),
          discount:    flatDiscount.toFixed(2),
          shipping:    shipping.toFixed(2),
          grandTotal:  grand.toFixed(2),
          // Supplier owes the full amount back until settled; paid/due updated later.
          paid:        '0.00',
          due:         grand.toFixed(2),
          paymentType: 'Cash',
          notes:       notes ?? undefined,
        },
      });

      // Replace TEMP with race-safe reference using autoincrement id
      const reference = `PR_${String(ret.id).padStart(4, '0')}`;
      await tx.purchaseReturn.update({ where: { id: ret.id }, data: { reference } });

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);

        await tx.purchaseReturnItem.create({
          data: {
            returnId:    ret.id,
            productId:   item.productId,
            netUnitCost: item.netUnitCost.toFixed(2),
            quantity:    item.quantity,
            discountType: item.discountType,
            discount:    item.discount.toFixed(2),
            taxType:     item.taxType,
            orderTax:    item.orderTax.toFixed(2),
            subtotal:    sub.toFixed(2),
            returnUnit:  item.returnUnit,
          },
        });

        if (status === 'Received') {
          await applyStockAdjustment(tx, item.productId, warehouse.id, item.quantity, 'Subtraction');
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save purchase return.';
    return { error: msg };
  }

  // 8. Revalidate affected pages
  revalidatePath('/purchases/returns');
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}

// ── Update purchase return ────────────────────────────────────────────────────
// Stock reconciliation (difference method, same warehouse — warehouse is locked):
//   Old Received items → ADD stock back (undo original Subtraction)
//   New Received items → SUBTRACT stock (apply fresh Subtraction)
// Net per-product delta is applied atomically; negative stock throws → rollback.

export async function updatePurchaseReturn(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Purchase Return');
  if (denied) return { error: denied };

  // 2. Parse return ID
  const returnId = parseInt(formData.get('returnId') as string, 10);
  if (isNaN(returnId) || returnId <= 0) return { error: 'Invalid return ID.' };

  // 3. Parse header fields
  const dateStr   = (formData.get('date')        as string)?.trim();
  const whIdRaw   = formData.get('warehouseId')  as string;
  const supIdRaw  = formData.get('supplierId')   as string;
  const statusRaw = (formData.get('status')      as string)?.trim();
  const notes     = (formData.get('notes')       as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,  10);
  const supplierId  = parseInt(supIdRaw, 10);

  if (!dateStr)                                   return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0)     return { error: 'Warehouse is required.' };
  if (isNaN(supplierId)  || supplierId  <= 0)     return { error: 'Supplier is required.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number])) {
    return { error: 'Invalid status.' };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  const status = statusRaw as typeof STATUSES[number];

  // 4. Parse order-level numbers
  const orderTaxPct  = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping     = parseFloat(formData.get('shipping')     as string) || 0;

  if (orderTaxPct  < 0 || orderTaxPct  > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                        return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                        return { error: 'Shipping cannot be negative.' };

  // 5. Parse + validate line items
  let rawItems: unknown;
  try {
    rawItems = JSON.parse((formData.get('items') as string) ?? '[]');
  } catch {
    return { error: 'Invalid items payload.' };
  }

  const itemsResult = z
    .array(itemSchema)
    .min(1, 'At least one item is required.')
    .safeParse(rawItems);

  if (!itemsResult.success) {
    return { error: itemsResult.error.issues[0]?.message ?? 'Validation failed.' };
  }
  const items = itemsResult.data;

  // 6. Re-read all IDs server-side
  const [warehouse, supplier] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.supplier.findFirst({ where: { id: supplierId,  deletedAt: null }, select: { id: true } }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!supplier)  return { error: 'Selected supplier not found.' };

  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
  const activeProducts   = await db.product.findMany({
    where:  { id: { in: uniqueProductIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // 7. Fetch existing return for stock delta and paid amount
  const existing = await db.purchaseReturn.findFirst({
    where:   { id: returnId, deletedAt: null },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!existing) return { error: 'Purchase return not found.' };

  // 8. Recompute all totals server-side
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitCost,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const grand = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });
  // Preserve existing paid amount; recompute due against new grand total.
  const existingPaid = Number(existing.paid);
  const newDue       = Math.max(0, grand - existingPaid);

  // 9. Atomic transaction: update header + replace items + reconcile stock
  try {
    await db.$transaction(async (tx) => {
      await tx.purchaseReturn.update({
        where: { id: returnId },
        data: {
          supplierId:  supplier.id,
          warehouseId: warehouse.id,
          date,
          status,
          orderTax:   orderTaxPct.toFixed(2),
          discount:   flatDiscount.toFixed(2),
          shipping:   shipping.toFixed(2),
          grandTotal: grand.toFixed(2),
          due:        newDue.toFixed(2),
          notes:      notes ?? undefined,
        },
      });

      // Replace all line items
      await tx.purchaseReturnItem.deleteMany({ where: { returnId } });
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);
        await tx.purchaseReturnItem.create({
          data: {
            returnId,
            productId:    item.productId,
            netUnitCost:  item.netUnitCost.toFixed(2),
            quantity:     item.quantity,
            discountType: item.discountType,
            discount:     item.discount.toFixed(2),
            taxType:      item.taxType,
            orderTax:     item.orderTax.toFixed(2),
            subtotal:     sub.toFixed(2),
            returnUnit:   item.returnUnit,
          },
        });
      }

      // Stock reconciliation — warehouse is locked so all deltas share one warehouse.
      // deltaMap[productId] = net quantity: positive → we owe Addition; negative → Subtraction.
      const deltaMap = new Map<number, number>();
      function addDelta(pid: number, qty: number) {
        deltaMap.set(pid, (deltaMap.get(pid) ?? 0) + qty);
      }

      // Old Received → ADD stock back (undo the original outbound movement)
      if (existing.status === 'Received') {
        for (const oi of existing.items) addDelta(oi.productId, +oi.quantity);
      }
      // New Received → SUBTRACT stock (apply the new outbound movement)
      if (status === 'Received') {
        for (const item of items) addDelta(item.productId, -item.quantity);
      }

      for (const [pid, delta] of deltaMap) {
        if (delta > 0) await applyStockAdjustment(tx, pid, warehouse.id, delta,            'Addition');
        if (delta < 0) await applyStockAdjustment(tx, pid, warehouse.id, Math.abs(delta),  'Subtraction');
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update purchase return.';
    return { error: msg };
  }

  // 10. Revalidate affected pages
  const allProductIds = [
    ...new Set([...existing.items.map((i) => i.productId), ...uniqueProductIds]),
  ];
  revalidatePath('/purchases/returns');
  revalidatePath(`/purchases/returns/${returnId}`);
  revalidatePath('/products');
  for (const id of allProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}

