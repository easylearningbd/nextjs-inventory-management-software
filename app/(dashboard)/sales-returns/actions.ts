'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export type ActionResult = { error?: string; success?: boolean; id?: number };

// ── Permission guard ──────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage sale returns.';
  }
  return null;
}

// ── Create sale return ────────────────────────────────────────────────────────
// Implemented in Step 3.

export async function createSaleReturn(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Not yet implemented — coming in Step 3.' };
}

// ── Update sale return ────────────────────────────────────────────────────────
// Implemented in Step 5.

export async function updateSaleReturn(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Not yet implemented — coming in Step 5.' };
}

// ── Delete sale return ────────────────────────────────────────────────────────
// Implemented in Step 6.

export async function deleteSaleReturn(id: number): Promise<ActionResult> {
  const denied = await requirePermission();
  if (denied) return { error: denied };

  const ret = await db.saleReturn.findFirst({
    where:  { id, deletedAt: null },
    select: { id: true, reference: true },
  });
  if (!ret) return { error: 'Sale return not found.' };

  // Full stock-reversal logic added in Step 6.
  await db.saleReturn.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/sales-returns');
  return { success: true };
}
