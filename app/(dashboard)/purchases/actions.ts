'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

export type ActionResult = { error?: string; success?: boolean };


// ── Product search ────────────────────────────────────────────────────────────
// Returns all active products matching the query — NOT filtered by warehouse
// because a purchase adds new stock and the product need not already exist there.
// currentStock is the quantity already in the given warehouse (read-only reference).

export type SearchProductForPurchase = {
  id:           number;
  name:         string;
  code:         string;
  productUnit:  string;
  price:        number;
  currentStock: number;
};

export async function searchProductsForPurchase(
  query:       string,
  warehouseId: number | null,
): Promise<SearchProductForPurchase[]> {
  const q = query.trim();
  if (!q) return [];

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
      ],
    },
    select: {
      id:          true,
      name:        true,
      code:        true,
      productUnit: true,
      price:       true,
      stocks: {
        where:  { warehouseId: warehouseId ?? -1 },
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

// ── Create purchase ───────────────────────────────────────────────────────────

const STATUSES    = ['Received', 'Ordered', 'Pending'] as const;
const DISC_TYPES  = ['Fixed', 'Percentage'] as const;
const TAX_TYPES   = ['Inclusive', 'Exclusive'] as const;

const itemSchema = z.object({
  productId:    z.number().int().positive(),
  quantity:     z.number().int().min(1, 'Quantity must be at least 1.'),
  netUnitCost:  z.number().min(0, 'Unit cost cannot be negative.'),
  discountType: z.enum(DISC_TYPES),
  discount:     z.number().min(0, 'Discount cannot be negative.'),
  taxType:      z.enum(TAX_TYPES),
  orderTax:     z.number().min(0).max(100, 'Tax rate must be 0–100%.'),
  purchaseUnit: z.string().min(1, 'Purchase unit is required.'),
});

export async function createPurchase(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Purchase');
  if (denied) return { error: denied };

  // 2. Parse header fields
  const dateStr    = (formData.get('date')       as string)?.trim();
  const whIdRaw    = formData.get('warehouseId') as string;
  const supIdRaw   = formData.get('supplierId')  as string;
  const statusRaw  = (formData.get('status')     as string)?.trim();
  const notes      = (formData.get('notes')      as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,  10);
  const supplierId  = parseInt(supIdRaw, 10);

  if (!dateStr)                                    return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0)      return { error: 'Warehouse is required.' };
  if (isNaN(supplierId)  || supplierId  <= 0)      return { error: 'Supplier is required.' };
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
  try {
    await db.$transaction(async (tx) => {
      // Create header with collision-safe temp reference; real PU_XXXX needs the id
      const purchase = await tx.purchase.create({
        data: {
          reference:     `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          supplierId:    supplier.id,
          warehouseId:   warehouse.id,
          date,
          status,
          orderTax:      orderTaxPct.toFixed(2),
          discount:      flatDiscount.toFixed(2),
          shipping:      shipping.toFixed(2),
          grandTotal:    grand.toFixed(2),
          paymentType:   'Cash',
          paymentStatus: 'Paid',
          notes:         notes ?? undefined,
        },
      });

      // Replace TEMP with real race-safe reference (autoincrement id is unique)
      const reference = `PU_${String(purchase.id).padStart(4, '0')}`;
      await tx.purchase.update({ where: { id: purchase.id }, data: { reference } });

      // Create line items; increment stock only when Received
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);

        await tx.purchaseItem.create({
          data: {
            purchaseId:   purchase.id,
            productId:    item.productId,
            netUnitCost:  item.netUnitCost.toFixed(2),
            quantity:     item.quantity,
            discountType: item.discountType,
            discount:     item.discount.toFixed(2),
            taxType:      item.taxType,
            orderTax:     item.orderTax.toFixed(2),
            subtotal:     sub.toFixed(2),
            purchaseUnit: item.purchaseUnit,
          },
        });

        if (status === 'Received') {
          await applyStockAdjustment(tx, item.productId, warehouse.id, item.quantity, 'Addition');
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save purchase.';
    return { error: msg };
  }

  // 8. Revalidate affected pages
  revalidatePath('/purchases');
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}

// ── Update purchase ───────────────────────────────────────────────────────────

export async function updatePurchase(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Purchase');
  if (denied) return { error: denied };

  // 2. Parse purchaseId
  const purchaseId = parseInt(formData.get('purchaseId') as string, 10);
  if (isNaN(purchaseId) || purchaseId <= 0) return { error: 'Invalid purchase ID.' };

  // 3. Parse header fields (same as createPurchase)
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

  // 6. Re-read all IDs server-side (never trust client-supplied values)
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

  // 7. Fetch existing purchase for stock delta computation
  const existing = await db.purchase.findFirst({
    where:   { id: purchaseId, deletedAt: null },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!existing) return { error: 'Purchase not found.' };

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

  // 9. Atomic transaction: update header + replace items + reconcile stock
  try {
    await db.$transaction(async (tx) => {
      // Update purchase header
      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          supplierId:  supplier.id,
          warehouseId: warehouse.id,
          date,
          status,
          orderTax:   orderTaxPct.toFixed(2),
          discount:   flatDiscount.toFixed(2),
          shipping:   shipping.toFixed(2),
          grandTotal: grand.toFixed(2),
          notes:      notes ?? undefined,
        },
      });

      // Replace all line items
      await tx.purchaseItem.deleteMany({ where: { purchaseId } });
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);
        await tx.purchaseItem.create({
          data: {
            purchaseId,
            productId:    item.productId,
            netUnitCost:  item.netUnitCost.toFixed(2),
            quantity:     item.quantity,
            discountType: item.discountType,
            discount:     item.discount.toFixed(2),
            taxType:      item.taxType,
            orderTax:     item.orderTax.toFixed(2),
            subtotal:     sub.toFixed(2),
            purchaseUnit: item.purchaseUnit,
          },
        });
      }

      // Stock reconciliation via unified delta map.
      // Using a map<warehouseId, map<productId, netDelta>> so that:
      //   - same warehouse + same product: old negatives and new positives cancel out
      //   - warehouse change: separate entries prevent crossing between warehouses
      const changeMap = new Map<number, Map<number, number>>();

      function addDelta(wid: number, pid: number, qty: number) {
        if (!changeMap.has(wid)) changeMap.set(wid, new Map());
        const m = changeMap.get(wid)!;
        m.set(pid, (m.get(pid) ?? 0) + qty);
      }

      // Subtract old received quantities from the old warehouse
      if (existing.status === 'Received') {
        for (const oi of existing.items) {
          addDelta(existing.warehouseId, oi.productId, -oi.quantity);
        }
      }

      // Add new received quantities to the new warehouse
      if (status === 'Received') {
        for (const item of items) {
          addDelta(warehouse.id, item.productId, item.quantity);
        }
      }

      // Apply net deltas
      for (const [wid, productMap] of changeMap) {
        for (const [pid, delta] of productMap) {
          if (delta > 0) await applyStockAdjustment(tx, pid, wid, delta, 'Addition');
          if (delta < 0) await applyStockAdjustment(tx, pid, wid, Math.abs(delta), 'Subtraction');
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update purchase.';
    return { error: msg };
  }

  // 10. Revalidate affected pages
  const allProductIds = [
    ...new Set([...existing.items.map((i) => i.productId), ...uniqueProductIds]),
  ];
  revalidatePath('/purchases');
  revalidatePath(`/purchases/${purchaseId}`);
  revalidatePath('/products');
  for (const id of allProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}

// ── Delete purchase ───────────────────────────────────────────────────────────
// Pending / Ordered: soft-delete immediately (no stock was moved).
// Received: reverses all line-item stock in the purchase's warehouse inside a
// $transaction, then soft-deletes.  If any reversal would drive stock negative
// (the items were already consumed), the whole transaction rolls back and an
// error is returned instead.

export async function deletePurchase(id: number): Promise<ActionResult> {
  const denied = await can('Manage Purchase');
  if (denied) return { error: denied };

  const purchase = await db.purchase.findFirst({
    where:  { id, deletedAt: null },
    select: {
      status:      true,
      reference:   true,
      warehouseId: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!purchase) return { error: 'Purchase not found.' };

  if (purchase.status === 'Received') {
    try {
      await db.$transaction(async (tx) => {
        for (const item of purchase.items) {
          await applyStockAdjustment(
            tx,
            item.productId,
            purchase.warehouseId,
            item.quantity,
            'Subtraction',
          );
        }
        await tx.purchase.update({
          where: { id },
          data:  { deletedAt: new Date() },
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reverse stock.';
      return { error: `Cannot delete: ${msg}` };
    }
  } else {
    await db.purchase.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
  }

  revalidatePath('/purchases');
  return { success: true };
}
