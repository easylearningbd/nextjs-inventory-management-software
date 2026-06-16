'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { roleSchema, type RoleState } from './schema';

export type { RoleState };

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

  // Guard (b): at least one active role must always retain 'Manage Roles'.
  if (!permissions.includes('Manage Roles')) {
    const currentHasIt = await db.rolePermission.findUnique({
      where: { roleId_permission: { roleId: id, permission: 'Manage Roles' } },
    });
    if (currentHasIt) {
      const othersWithIt = await db.rolePermission.count({
        where: { permission: 'Manage Roles', roleId: { not: id }, role: { deletedAt: null } },
      });
      if (othersWithIt === 0) {
        return { error: 'Cannot remove "Manage Roles" — no other active role has this permission. Assign it elsewhere first.' };
      }
    }
  }

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

  // Guard (a): block if any users are still assigned to this role.
  const assignedCount = await db.user.count({
    where: { roleId: id, deletedAt: null },
  });
  if (assignedCount > 0) {
    return {
      error: `Cannot delete "${existing.name}" — ${assignedCount} user${assignedCount === 1 ? ' is' : 's are'} assigned to this role. Reassign them first.`,
    };
  }

  // Guard (b): block if this is the only active role with 'Manage Roles'.
  const hasManageRoles = await db.rolePermission.findUnique({
    where: { roleId_permission: { roleId: id, permission: 'Manage Roles' } },
  });
  if (hasManageRoles) {
    const othersWithIt = await db.rolePermission.count({
      where: { permission: 'Manage Roles', roleId: { not: id }, role: { deletedAt: null } },
    });
    if (othersWithIt === 0) {
      return { error: `Cannot delete "${existing.name}" — it is the only role with "Manage Roles". Assign that permission to another role first.` };
    }
  }

  await db.role.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/roles');
  return { success: true };
}
