'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { PERMISSIONS, PERMISSION_SET } from '@/lib/permissions';


// ── Schema ────────────────────────────────────────────────────────────────────

export const roleSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.'),
  permissions: z
    .array(z.string())
    .refine((arr) => arr.every((p) => PERMISSION_SET.has(p)), {
      message: 'One or more permissions are invalid.',
    }),
});

export type RoleState = { error?: string; success?: boolean };

// ── Create ────────────────────────────────────────────────────────────────────

export async function createRole(
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const denied = await can('Manage Roles');
  if (denied) return { error: denied };

  const parsed = roleSchema.safeParse({
    name:        (formData.get('name') as string)?.trim(),
    permissions: formData.getAll('permissions') as string[],
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };

  const { name, permissions } = parsed.data;

  const existing = await db.role.findFirst({ where: { name, deletedAt: null } });
  if (existing) return { error: `A role named "${name}" already exists.` };

  await db.role.create({
    data: {
      name,
      permissions: { create: permissions.map((permission) => ({ permission })) },
    },
  });

  revalidatePath('/roles');
  redirect('/roles');
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateRole(
  id: number,
  _prev: RoleState,
  formData: FormData,
): Promise<RoleState> {
  const denied = await can('Manage Roles');
  if (denied) return { error: denied };

  const existing = await db.role.findFirst({
    where:  { id, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) return { error: 'Role not found.' };

  const parsed = roleSchema.safeParse({
    name:        (formData.get('name') as string)?.trim(),
    permissions: formData.getAll('permissions') as string[],
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };

  const { name, permissions } = parsed.data;

  // Check uniqueness (excluding self)
  const nameConflict = await db.role.findFirst({
    where: { name, deletedAt: null, id: { not: id } },
  });
  if (nameConflict) return { error: `A role named "${name}" already exists.` };

  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId: id } }),
    db.role.update({
      where: { id },
      data: {
        name,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
    }),
  ]);

  revalidatePath('/roles');
  redirect('/roles');
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function deleteRole(id: number): Promise<RoleState> {
  const denied = await can('Manage Roles');
  if (denied) return { error: denied };

  const existing = await db.role.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Role not found.' };

  await db.role.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/roles');
  return { success: true };
}
