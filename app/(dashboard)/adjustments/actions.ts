'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';

// ── Shared types (imported by client components for type-safety) ───────────────
export type SearchProduct = {
  id:           number;
  name:         string;
  code:         string;
  productUnit:  string;
  currentStock: number;
};

export type AdjustmentState = { error?: string; success?: boolean };


// ── Delete (soft) ─────────────────────────────────────────────────────────────
// Marks the adjustment as deleted.  Stock changes already applied are NOT
// reversed — a counter-adjustment must be created manually if needed.
export async function deleteAdjustment(id: number): Promise<AdjustmentState> {
  const denied = await can('Manage Adjustments');
  if (denied) return { error: denied };

  const existing = await db.adjustment.findFirst({
    where:  { id, deletedAt: null },
    select: { reference: true },
  });
  if (!existing) return { error: 'Adjustment not found.' };

  await db.adjustment.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/adjustments');
  return { success: true };
}

// ── Product search (called from the client form) ───────────────────────────────
// Returns up to 8 products matching the query, each with their current stock
// quantity for the specified warehouse (0 if no stock row exists yet).
export async function searchProductsForAdjustment(
  query:       string,
  warehouseId: number,
): Promise<SearchProduct[]> {
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
      stocks: {
        where:  { warehouseId },
        select: { quantity: true },
      },
    },
    orderBy: { name: 'asc' },
    take:    8,
  });

  return products.map((p) => ({
    id:           p.id,
    name:         p.name,
    code:         p.code,
    productUnit:  p.productUnit,
    currentStock: p.stocks[0]?.quantity ?? 0,
  }));
}

// ── Create ────────────────────────────────────────────────────────────────────
const ADJ_TYPES = ['Addition', 'Subtraction'] as const;

const itemSchema = z.object({
  productId: z.number().int().positive(),
  quantity:  z.number().int().min(1, 'Quantity must be at least 1.'),
  type:      z.enum(ADJ_TYPES),
});

export async function createAdjustment(
  _prev:    AdjustmentState,
  formData: FormData,
): Promise<AdjustmentState> {
  const denied = await can('Manage Adjustments');
  if (denied) return { error: denied };

  // ── 1. Parse header fields ──────────────────────────────────────────────────
  const warehouseId = parseInt(formData.get('warehouseId') as string, 10);
  if (isNaN(warehouseId)) return { error: 'Warehouse is required.' };

  const dateStr = (formData.get('date') as string)?.trim();
  if (!dateStr) return { error: 'Date is required.' };
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  // ── 2. Parse + validate line items ─────────────────────────────────────────
  let rawItems: unknown;
  try {
    rawItems = JSON.parse((formData.get('items') as string) ?? '[]');
  } catch {
    return { error: 'Invalid items data.' };
  }

  const itemsResult = z
    .array(itemSchema)
    .min(1, 'At least one item is required.')
    .safeParse(rawItems);

  if (!itemsResult.success) {
    return { error: itemsResult.error.issues[0]?.message ?? 'Validation failed.' };
  }
  const items = itemsResult.data;

  // ── 3. Re-read IDs server-side (never trust client-supplied values) ─────────
  const warehouse = await db.warehouse.findFirst({
    where:  { id: warehouseId, deletedAt: null },
    select: { id: true },
  });
  if (!warehouse) return { error: 'Selected warehouse not found.' };

  const productIds    = items.map((i) => i.productId);
  const activeProducts = await db.product.findMany({
    where:  { id: { in: productIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== productIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // ── 4. Atomic transaction: header + items + stock changes ───────────────────
  // If any subtraction would drive stock below zero, applyStockAdjustment throws
  // a plain Error with a user-facing message, which rolls back the whole tx.
  try {
    await db.$transaction(async (tx) => {
      // Create the header with a collision-safe temporary reference; we need
      // the auto-increment id before we can build the real ADJ_XXXX string.
      const adj = await tx.adjustment.create({
        data: {
          reference:   `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          warehouseId: warehouse.id,
          date,
        },
      });

      // Replace TEMP with the real reference — id is unique so ADJ_<id> is too.
      const reference = `ADJ_${String(adj.id).padStart(4, '0')}`;
      await tx.adjustment.update({ where: { id: adj.id }, data: { reference } });

      for (const item of items) {
        await tx.adjustmentItem.create({
          data: {
            adjustmentId: adj.id,
            productId:    item.productId,
            quantity:     item.quantity,
            type:         item.type,
          },
        });

        await applyStockAdjustment(
          tx,
          item.productId,
          warehouse.id,
          item.quantity,
          item.type,
        );
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save adjustment.';
    return { error: msg };
  }

  // ── 5. Revalidate everywhere stock is visible ───────────────────────────────
  revalidatePath('/adjustments');
  revalidatePath('/products');
  for (const id of productIds) {
    revalidatePath(`/products/${id}`);
    revalidatePath(`/products/${id}/edit`);
  }

  return { success: true };
}
