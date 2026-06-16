'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

export type ActionResult = { error?: string; success?: boolean; id?: number };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES   = ['Pending', 'Received', 'Completed'] as const;
const DISC_TYPES = ['Fixed', 'Percentage']              as const;
const TAX_TYPES  = ['Inclusive', 'Exclusive']           as const;

const itemSchema = z.object({
  productId:    z.number().int().positive(),
  quantity:     z.number().int().min(1, 'Quantity must be at least 1.'),
  netUnitPrice: z.number().min(0, 'Unit price cannot be negative.'),
  discountType: z.enum(DISC_TYPES),
  discount:     z.number().min(0, 'Discount cannot be negative.'),
  taxType:      z.enum(TAX_TYPES),
  orderTax:     z.number().min(0).max(100, 'Tax rate must be 0–100%.'),
  returnUnit:   z.string().min(1, 'Return unit is required.'),
});


// ── Payment status derivation ─────────────────────────────────────────────────

function derivePaymentStatus(paid: number, grandTotal: number): string {
  if (paid <= 0)          return 'Unpaid';
  if (paid >= grandTotal) return 'Paid';
  return 'Partial';
}

// ── Create sale return ────────────────────────────────────────────────────────
// Stock direction: customer → warehouse → Addition per line (when Received).
// Qty cap: no returned line may exceed the original sale line's quantity.

export async function createSaleReturn(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Sale Return');
  if (denied) return { error: denied };

  // 2. Parse header fields
  const dateStr   = (formData.get('date')        as string)?.trim();
  const whIdRaw   = formData.get('warehouseId')  as string;
  const cusIdRaw  = formData.get('customerId')   as string;
  const saleIdRaw = formData.get('saleId')       as string;
  const statusRaw = (formData.get('status')      as string)?.trim();
  const notes     = (formData.get('notes')       as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,  10);
  const customerId  = parseInt(cusIdRaw, 10);
  const saleId      = saleIdRaw ? parseInt(saleIdRaw, 10) : null;

  if (!dateStr)                                return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0)  return { error: 'Warehouse is required.' };
  if (isNaN(customerId)  || customerId  <= 0)  return { error: 'Customer is required.' };
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

  if (orderTaxPct  < 0 || orderTaxPct > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                       return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                       return { error: 'Shipping cannot be negative.' };

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
  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];

  const [warehouse, customer, activeProducts] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.customer.findFirst({ where:  { id: customerId,  deletedAt: null }, select: { id: true } }),
    db.product.findMany({
      where:  { id: { in: uniqueProductIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!customer)  return { error: 'Selected customer not found.' };
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more products could not be found or have been deleted.' };
  }

  // 6. Qty cap: no returned qty may exceed the original sale line's qty
  if (saleId) {
    const originalSale = await db.sale.findFirst({
      where:  { id: saleId, deletedAt: null },
      select: {
        items: {
          select: { productId: true, quantity: true },
        },
      },
    });
    if (!originalSale) return { error: 'Original sale not found.' };

    const saleQtyMap = new Map(originalSale.items.map((i) => [i.productId, i.quantity]));
    const productNameMap = new Map(activeProducts.map((p) => [p.id, p.name]));

    for (const item of items) {
      const maxQty = saleQtyMap.get(item.productId);
      if (maxQty === undefined) {
        return { error: `Product "${productNameMap.get(item.productId) ?? item.productId}" was not on the original sale.` };
      }
      if (item.quantity > maxQty) {
        return {
          error: `Cannot return more than sold: "${productNameMap.get(item.productId)}" — sold ${maxQty}, returning ${item.quantity}.`,
        };
      }
    }
  }

  // 7. Recompute all totals server-side (never trust client-sent values)
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitPrice,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const grand = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });

  // 8. Atomic transaction: header → reference → items → stock
  // A sale return is stock-INBOUND (customer → warehouse).
  // When status=Received, each line INCREMENTS warehouse stock via Addition.
  let newId: number;
  try {
    await db.$transaction(async (tx) => {
      const ret = await tx.saleReturn.create({
        data: {
          reference:     `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          customerId:    customer.id,
          warehouseId:   warehouse.id,
          saleId:        saleId ?? undefined,
          date,
          status,
          orderTax:      orderTaxPct.toFixed(2),
          discount:      flatDiscount.toFixed(2),
          shipping:      shipping.toFixed(2),
          grandTotal:    grand.toFixed(2),
          paid:          '0.00',
          due:           grand.toFixed(2),
          paymentStatus: 'Unpaid',
          notes:         notes ?? undefined,
        },
      });

      // Replace TEMP with race-safe reference using autoincrement id
      const reference = `SR_${String(ret.id).padStart(4, '0')}`;
      await tx.saleReturn.update({ where: { id: ret.id }, data: { reference } });
      newId = ret.id;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);

        await tx.saleReturnItem.create({
          data: {
            returnId:     ret.id,
            productId:    item.productId,
            netUnitPrice: item.netUnitPrice.toFixed(2),
            quantity:     item.quantity,
            discountType: item.discountType,
            discount:     item.discount.toFixed(2),
            taxType:      item.taxType,
            orderTax:     item.orderTax.toFixed(2),
            subtotal:     sub.toFixed(2),
            returnUnit:   item.returnUnit,
          },
        });

        if (status === 'Received') {
          await applyStockAdjustment(tx, item.productId, warehouse.id, item.quantity, 'Addition');
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save sale return.';
    return { error: msg };
  }

  // 9. Revalidate affected pages
  revalidatePath('/sales-returns');
  if (saleId) revalidatePath(`/sales/${saleId}`);
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true, id: newId! };
}

// ── Update sale return ────────────────────────────────────────────────────────
// Stock reconciliation (difference method):
//   Old Received items → SUBTRACT stock back (undo the Addition)
//   New Received items → ADD stock (apply fresh Addition)
// Qty cap still enforced against the original sale's quantities.
// Implemented in Step 5.

export async function updateSaleReturn(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission check
  const denied = await can('Manage Sale Return');
  if (denied) return { error: denied };

  // 2. Parse return ID
  const returnId = parseInt(formData.get('returnId') as string, 10);
  if (isNaN(returnId) || returnId <= 0) return { error: 'Invalid return ID.' };

  // 3. Parse header fields
  const dateStr   = (formData.get('date')       as string)?.trim();
  const whIdRaw   = formData.get('warehouseId') as string;
  const cusIdRaw  = formData.get('customerId')  as string;
  const saleIdRaw = formData.get('saleId')      as string;
  const statusRaw = (formData.get('status')     as string)?.trim();
  const notes     = (formData.get('notes')      as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,  10);
  const customerId  = parseInt(cusIdRaw, 10);
  const saleId      = saleIdRaw ? parseInt(saleIdRaw, 10) : null;

  if (!dateStr)                               return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0) return { error: 'Warehouse is required.' };
  if (isNaN(customerId)  || customerId  <= 0) return { error: 'Customer is required.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number])) {
    return { error: 'Invalid status.' };
  }

  const date   = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };
  const status = statusRaw as typeof STATUSES[number];

  // 4. Parse order-level numbers
  const orderTaxPct  = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping     = parseFloat(formData.get('shipping')     as string) || 0;

  if (orderTaxPct  < 0 || orderTaxPct > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                       return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                       return { error: 'Shipping cannot be negative.' };

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
  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];

  const [warehouse, customer, activeProducts] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.customer.findFirst({ where:  { id: customerId,  deletedAt: null }, select: { id: true } }),
    db.product.findMany({
      where:  { id: { in: uniqueProductIds }, deletedAt: null },
      select: { id: true, name: true },
    }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!customer)  return { error: 'Selected customer not found.' };
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more products could not be found or have been deleted.' };
  }

  // 7. Qty cap: still enforced against original sale quantities
  if (saleId) {
    const originalSale = await db.sale.findFirst({
      where:  { id: saleId, deletedAt: null },
      select: { items: { select: { productId: true, quantity: true } } },
    });
    if (!originalSale) return { error: 'Original sale not found.' };

    const saleQtyMap    = new Map(originalSale.items.map((i) => [i.productId, i.quantity]));
    const productNameMap = new Map(activeProducts.map((p) => [p.id, p.name]));

    for (const item of items) {
      const maxQty = saleQtyMap.get(item.productId);
      if (maxQty === undefined) {
        return { error: `Product "${productNameMap.get(item.productId) ?? item.productId}" was not on the original sale.` };
      }
      if (item.quantity > maxQty) {
        return {
          error: `Cannot return more than sold: "${productNameMap.get(item.productId)}" — sold ${maxQty}, returning ${item.quantity}.`,
        };
      }
    }
  }

  // 8. Fetch existing return for stock delta and current paid amount
  const existing = await db.saleReturn.findFirst({
    where:   { id: returnId, deletedAt: null },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!existing) return { error: 'Sale return not found.' };

  // 9. Recompute all totals server-side
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitPrice,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const grand        = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });
  const existingPaid = Number(existing.paid);
  const newDue       = Math.max(0, grand - existingPaid);
  const paymentStatus = derivePaymentStatus(existingPaid, grand);

  // 10. Atomic transaction: update header + replace items + reconcile stock
  try {
    await db.$transaction(async (tx) => {
      await tx.saleReturn.update({
        where: { id: returnId },
        data: {
          customerId:    customer.id,
          warehouseId:   warehouse.id,
          saleId:        saleId ?? undefined,
          date,
          status,
          orderTax:      orderTaxPct.toFixed(2),
          discount:      flatDiscount.toFixed(2),
          shipping:      shipping.toFixed(2),
          grandTotal:    grand.toFixed(2),
          due:           newDue.toFixed(2),
          paymentStatus,
          notes:         notes ?? undefined,
        },
      });

      // Replace all line items
      await tx.saleReturnItem.deleteMany({ where: { returnId } });
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);
        await tx.saleReturnItem.create({
          data: {
            returnId,
            productId:    item.productId,
            netUnitPrice: item.netUnitPrice.toFixed(2),
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

      // Stock reconciliation — warehouse is locked.
      // deltaMap[productId]: positive → net Addition; negative → net Subtraction.
      const deltaMap = new Map<number, number>();
      function addDelta(pid: number, qty: number) {
        deltaMap.set(pid, (deltaMap.get(pid) ?? 0) + qty);
      }

      // Old Received → SUBTRACT stock (undo the original Addition)
      if (existing.status === 'Received') {
        for (const oi of existing.items) addDelta(oi.productId, -oi.quantity);
      }
      // New Received → ADD stock (apply fresh Addition)
      if (status === 'Received') {
        for (const item of items) addDelta(item.productId, +item.quantity);
      }

      for (const [pid, delta] of deltaMap) {
        if (delta > 0) await applyStockAdjustment(tx, pid, warehouse.id, delta,           'Addition');
        if (delta < 0) await applyStockAdjustment(tx, pid, warehouse.id, Math.abs(delta), 'Subtraction');
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update sale return.';
    return { error: msg };
  }

  // 11. Revalidate affected pages
  const allProductIds = [
    ...new Set([...existing.items.map((i) => i.productId), ...uniqueProductIds]),
  ];
  revalidatePath('/sales-returns');
  revalidatePath(`/sales-returns/${returnId}`);
  if (saleId) revalidatePath(`/sales/${saleId}`);
  revalidatePath('/products');
  for (const id of allProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}

// ── Delete sale return ────────────────────────────────────────────────────────
// Pending / Completed: soft-delete only (stock was never moved).
// Received: $transaction → Subtraction per item (removes the stock the return
//   added back), then soft-delete.

export async function deleteSaleReturn(id: number): Promise<ActionResult> {
  const denied = await can('Manage Sale Return');
  if (denied) return { error: denied };

  const ret = await db.saleReturn.findFirst({
    where:  { id, deletedAt: null },
    select: {
      status:      true,
      reference:   true,
      warehouseId: true,
      saleId:      true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!ret) return { error: 'Sale return not found.' };

  if (ret.status === 'Received') {
    try {
      await db.$transaction(async (tx) => {
        for (const item of ret.items) {
          await applyStockAdjustment(tx, item.productId, ret.warehouseId, item.quantity, 'Subtraction');
        }
        await tx.saleReturn.update({ where: { id }, data: { deletedAt: new Date() } });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reverse stock.';
      return { error: `Cannot delete: ${msg}` };
    }
  } else {
    await db.saleReturn.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  revalidatePath('/sales-returns');
  if (ret.saleId) revalidatePath(`/sales/${ret.saleId}`);
  return { success: true };
}
