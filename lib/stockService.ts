import type { Prisma } from '@prisma/client';

// Applies a single-line stock adjustment to the canonical (productId, warehouseId)
// row in ProductStock.
//
// Must be called INSIDE a prisma.$transaction — the caller owns the transaction
// so that a multi-item adjustment is fully atomic.
//
// Throws a plain Error (message is user-facing) if:
//   - A Subtraction would drive quantity below zero.
//   - A Subtraction is requested but no stock row exists for the warehouse.
export async function applyStockAdjustment(
  tx:          Prisma.TransactionClient,
  productId:   number,
  warehouseId: number,
  qty:         number,
  type:        'Addition' | 'Subtraction',
): Promise<void> {
  const stock = await tx.productStock.findUnique({
    where:  { productId_warehouseId: { productId, warehouseId } },
    select: { quantity: true },
  });

  const current = stock?.quantity ?? 0;
  const newQty  = type === 'Addition' ? current + qty : current - qty;

  if (newQty < 0) {
    throw new Error(
      `Insufficient stock: current qty is ${current}, cannot subtract ${qty}.`,
    );
  }

  await tx.productStock.upsert({
    where:  { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, quantity: newQty, status: 'Received' },
    update: { quantity: newQty },
  });
}
