'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export type ActionResult = { error?: string; success?: boolean; id?: number };

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage transfers.';
  }
  return null;
}

// ── Create transfer — implemented in Step 3 ───────────────────────────────────
export async function createTransfer(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Not yet implemented — coming in Step 3.' };
}

// ── Update transfer — implemented in Step 5 ───────────────────────────────────
export async function updateTransfer(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Not yet implemented — coming in Step 5.' };
}

// ── Delete transfer — implemented in Step 6 ───────────────────────────────────
// Completed transfers: reverse the stock move (Add to From, Subtract from To).
// Pending/Sent: soft-delete only (no stock was moved).
export async function deleteTransfer(id: number): Promise<ActionResult> {
  const denied = await requirePermission();
  if (denied) return { error: denied };

  const transfer = await db.transfer.findFirst({
    where:  { id, deletedAt: null },
    select: { id: true, reference: true },
  });
  if (!transfer) return { error: 'Transfer not found.' };

  // Full stock-reversal logic added in Step 6.
  await db.transfer.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/transfers');
  return { success: true };
}
