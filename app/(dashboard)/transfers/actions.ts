'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

// ── Product search ────────────────────────────────────────────────────────────

export type SearchProductForTransfer = {
  id:           number;
  name:         string;
  code:         string;
  productUnit:  string;
  cost:         number;
  currentStock: number;
};

export async function searchProductsForTransfer(
  query:           string,
  fromWarehouseId: number | null,
): Promise<SearchProductForTransfer[]> {
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
        where:  { warehouseId: fromWarehouseId ?? -1 },
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
    cost:         Number(p.price),
    currentStock: p.stocks[0]?.quantity ?? 0,
  }));
}

// ── Shared constants ──────────────────────────────────────────────────────────

export type ActionResult = { error?: string; success?: boolean; id?: number };

const STATUSES   = ['Pending', 'Sent', 'Completed'] as const;
const DISC_TYPES = ['Fixed', 'Percentage'] as const;
const TAX_TYPES  = ['Inclusive', 'Exclusive'] as const;

const itemSchema = z.object({
  productId:    z.number().int().positive(),
  quantity:     z.number().int().min(1, 'Quantity must be at least 1.'),
  netUnitCost:  z.number().min(0, 'Unit cost cannot be negative.'),
  discountType: z.enum(DISC_TYPES),
  discount:     z.number().min(0, 'Discount cannot be negative.'),
  taxType:      z.enum(TAX_TYPES),
  orderTax:     z.number().min(0).max(100, 'Tax rate must be 0–100%.'),
  transferUnit: z.string().min(1, 'Transfer unit is required.'),
});

// ── Permission guard ──────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage transfers.';
  }
  return null;
}

// ── Shared header-field parser ────────────────────────────────────────────────

function parseHeader(formData: FormData) {
  const dateStr       = (formData.get('date')            as string)?.trim();
  const fromWhRaw     =  formData.get('fromWarehouseId') as string;
  const toWhRaw       =  formData.get('toWarehouseId')   as string;
  const statusRaw     = (formData.get('status')          as string)?.trim();
  const notes         = (formData.get('notes')           as string)?.trim() || null;
  const orderTaxPct   = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount  = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping      = parseFloat(formData.get('shipping')     as string) || 0;

  const fromWarehouseId = parseInt(fromWhRaw, 10);
  const toWarehouseId   = parseInt(toWhRaw,   10);

  if (!dateStr)                                       return { error: 'Date is required.' };
  if (isNaN(fromWarehouseId) || fromWarehouseId <= 0) return { error: 'Source warehouse is required.' };
  if (isNaN(toWarehouseId)   || toWarehouseId   <= 0) return { error: 'Destination warehouse is required.' };
  if (fromWarehouseId === toWarehouseId)               return { error: 'Source and destination must be different warehouses.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number])) return { error: 'Invalid status.' };
  if (orderTaxPct  < 0 || orderTaxPct  > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                        return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                        return { error: 'Shipping cannot be negative.' };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  return {
    date,
    fromWarehouseId,
    toWarehouseId,
    status: statusRaw as typeof STATUSES[number],
    notes,
    orderTaxPct,
    flatDiscount,
    shipping,
  };
}

// ── Create transfer ───────────────────────────────────────────────────────────

export async function createTransfer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission
  const denied = await requirePermission();
  if (denied) return { error: denied };

  // 2. Parse + validate header
  const header = parseHeader(formData);
  if ('error' in header) return { error: header.error };
  const { date, fromWarehouseId, toWarehouseId, status, notes, orderTaxPct, flatDiscount, shipping } = header;

  // 3. Parse + Zod-validate line items
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

  // 4. Re-read IDs server-side — never trust client-supplied values
  const [fromWarehouse, toWarehouse] = await Promise.all([
    db.warehouse.findFirst({ where: { id: fromWarehouseId, deletedAt: null }, select: { id: true } }),
    db.warehouse.findFirst({ where: { id: toWarehouseId,   deletedAt: null }, select: { id: true } }),
  ]);
  if (!fromWarehouse) return { error: 'Source warehouse not found.' };
  if (!toWarehouse)   return { error: 'Destination warehouse not found.' };

  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
  const activeProducts   = await db.product.findMany({
    where:  { id: { in: uniqueProductIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // 5. Recompute totals server-side — never trust client-sent grandTotal
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitCost,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));
  const grand = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });

  // 6. Atomic transaction
  let newId: number;
  try {
    newId = await db.$transaction(async (tx) => {
      // Create header with collision-safe temp reference (TR_XXXX needs the autoincrement id)
      const transfer = await tx.transfer.create({
        data: {
          reference:      `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId:   toWarehouse.id,
          date,
          status,
          orderTax:   orderTaxPct.toFixed(2),
          discount:   flatDiscount.toFixed(2),
          shipping:   shipping.toFixed(2),
          grandTotal: grand.toFixed(2),
          notes:      notes ?? undefined,
        },
      });

      // Promote TEMP → TR_XXXX (race-safe: autoincrement id is unique)
      const reference = `TR_${String(transfer.id).padStart(4, '0')}`;
      await tx.transfer.update({ where: { id: transfer.id }, data: { reference } });

      // Create line items + apply stock when Completed
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);

        await tx.transferItem.create({
          data: {
            transferId:  transfer.id,
            productId:   item.productId,
            netUnitCost: item.netUnitCost.toFixed(2),
            quantity:    item.quantity,
            discountType: item.discountType,
            discount:    item.discount.toFixed(2),
            taxType:     item.taxType,
            orderTax:    item.orderTax.toFixed(2),
            subtotal:    sub.toFixed(2),
            productUnit: item.transferUnit,
          },
        });

        if (status === 'Completed') {
          // Subtract from source — throws if stock goes below zero
          await applyStockAdjustment(tx, item.productId, fromWarehouse.id, item.quantity, 'Subtraction');
          // Add to destination
          await applyStockAdjustment(tx, item.productId, toWarehouse.id,   item.quantity, 'Addition');
        }
      }

      return transfer.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save transfer.';
    return { error: msg };
  }

  // 7. Revalidate
  revalidatePath('/transfers');
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true, id: newId };
}

// ── Update transfer ───────────────────────────────────────────────────────────

export async function updateTransfer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission
  const denied = await requirePermission();
  if (denied) return { error: denied };

  // 2. Parse transferId
  const transferId = parseInt(formData.get('transferId') as string, 10);
  if (isNaN(transferId) || transferId <= 0) return { error: 'Invalid transfer ID.' };

  // 3. Parse + validate header fields
  const header = parseHeader(formData);
  if ('error' in header) return { error: header.error };
  const { date, fromWarehouseId, toWarehouseId, status, notes, orderTaxPct, flatDiscount, shipping } = header;

  // 4. Parse + Zod-validate line items
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

  // 5. Re-read IDs server-side
  const [fromWarehouse, toWarehouse] = await Promise.all([
    db.warehouse.findFirst({ where: { id: fromWarehouseId, deletedAt: null }, select: { id: true } }),
    db.warehouse.findFirst({ where: { id: toWarehouseId,   deletedAt: null }, select: { id: true } }),
  ]);
  if (!fromWarehouse) return { error: 'Source warehouse not found.' };
  if (!toWarehouse)   return { error: 'Destination warehouse not found.' };

  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
  const activeProducts   = await db.product.findMany({
    where:  { id: { in: uniqueProductIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // 6. Fetch existing transfer — needed for stock delta computation
  const existing = await db.transfer.findFirst({
    where:   { id: transferId, deletedAt: null },
    include: { items: { select: { productId: true, quantity: true } } },
  });
  if (!existing) return { error: 'Transfer not found.' };

  // 7. Recompute totals server-side
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitCost,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));
  const grand = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });

  // 8. Atomic transaction
  try {
    await db.$transaction(async (tx) => {
      // Update header
      await tx.transfer.update({
        where: { id: transferId },
        data: {
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId:   toWarehouse.id,
          date,
          status,
          orderTax:   orderTaxPct.toFixed(2),
          discount:   flatDiscount.toFixed(2),
          shipping:   shipping.toFixed(2),
          grandTotal: grand.toFixed(2),
          notes:      notes ?? undefined,
        },
      });

      // Replace line items
      await tx.transferItem.deleteMany({ where: { transferId } });
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);
        await tx.transferItem.create({
          data: {
            transferId,
            productId:   item.productId,
            netUnitCost: item.netUnitCost.toFixed(2),
            quantity:    item.quantity,
            discountType: item.discountType,
            discount:    item.discount.toFixed(2),
            taxType:     item.taxType,
            orderTax:    item.orderTax.toFixed(2),
            subtotal:    sub.toFixed(2),
            productUnit: item.transferUnit,
          },
        });
      }

      // ── Difference-method stock reconciliation ─────────────────────────────
      // deltaMap[warehouseId][productId] = net quantity change (positive = add, negative = subtract)
      // Handles warehouse changes, product changes, and qty changes in a single pass.
      const deltaMap = new Map<number, Map<number, number>>();

      function addDelta(warehouseId: number, productId: number, qty: number) {
        if (!deltaMap.has(warehouseId)) deltaMap.set(warehouseId, new Map());
        const m = deltaMap.get(warehouseId)!;
        m.set(productId, (m.get(productId) ?? 0) + qty);
      }

      // Undo old Completed move: add back to old From, subtract from old To
      if (existing.status === 'Completed') {
        for (const oi of existing.items) {
          addDelta(existing.fromWarehouseId, oi.productId, +oi.quantity);
          addDelta(existing.toWarehouseId,   oi.productId, -oi.quantity);
        }
      }

      // Apply new Completed move: subtract from new From, add to new To
      if (status === 'Completed') {
        for (const item of items) {
          addDelta(fromWarehouse.id, item.productId, -item.quantity);
          addDelta(toWarehouse.id,   item.productId, +item.quantity);
        }
      }

      // Flush net deltas — applyStockAdjustment throws if stock goes negative
      for (const [wid, productMap] of deltaMap) {
        for (const [pid, delta] of productMap) {
          if (delta > 0) await applyStockAdjustment(tx, pid, wid, delta,              'Addition');
          if (delta < 0) await applyStockAdjustment(tx, pid, wid, Math.abs(delta),    'Subtraction');
        }
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update transfer.';
    return { error: msg };
  }

  // 9. Revalidate
  revalidatePath('/transfers');
  revalidatePath(`/transfers/${transferId}`);
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true, id: transferId };
}

// ── Delete transfer ───────────────────────────────────────────────────────────
// Soft-deletes the transfer. If it was Completed, reverses the stock move first:
// add back to From warehouse, subtract from To warehouse — all inside one transaction
// so a negative-stock failure rolls back the soft-delete too.
export async function deleteTransfer(id: number): Promise<ActionResult> {
  const denied = await requirePermission();
  if (denied) return { error: denied };

  const transfer = await db.transfer.findFirst({
    where:   { id, deletedAt: null },
    select: {
      id:              true,
      status:          true,
      fromWarehouseId: true,
      toWarehouseId:   true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!transfer) return { error: 'Transfer not found.' };

  try {
    await db.$transaction(async (tx) => {
      // Reverse stock only for Completed transfers (Pending/Sent never moved stock)
      if (transfer.status === 'Completed') {
        for (const item of transfer.items) {
          // Add back to source warehouse
          await applyStockAdjustment(tx, item.productId, transfer.fromWarehouseId, item.quantity, 'Addition');
          // Subtract from destination warehouse — throws if stock went below zero
          await applyStockAdjustment(tx, item.productId, transfer.toWarehouseId,   item.quantity, 'Subtraction');
        }
      }

      await tx.transfer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete transfer.';
    return { error: msg };
  }

  const affectedProductIds = [...new Set(transfer.items.map((i) => i.productId))];
  revalidatePath('/transfers');
  revalidatePath('/products');
  for (const pid of affectedProductIds) {
    revalidatePath(`/products/${pid}`);
    revalidatePath(`/products/${pid}/edit`);
  }
  return { success: true };
}
