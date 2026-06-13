'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';

export type ActionResult = { error?: string; success?: boolean };

// ── Permission guard ──────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage purchase returns.';
  }
  return null;
}

export { requirePermission };

// ── Delete purchase return ────────────────────────────────────────────────────
// Pending / Ordered: soft-delete immediately (no stock was moved).
// Received: ADDS stock back to ProductStock for every line — deleting a
// Received return undoes the outbound movement, so stock must be restored.
// (This is the opposite of deleting a purchase, which subtracts stock.)

export async function deletePurchaseReturn(id: number): Promise<ActionResult> {
  const denied = await requirePermission();
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
