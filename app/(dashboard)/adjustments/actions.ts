'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export type AdjustmentState = { error?: string; success?: boolean };

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage adjustments.';
  }
  return null;
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────
// Marks the adjustment as deleted.  Stock changes already applied are NOT
// reversed — a counter-adjustment must be created manually if needed.
export async function deleteAdjustment(id: number): Promise<AdjustmentState> {
  const denied = await requirePermission();
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
