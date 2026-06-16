import { auth } from '@/auth';
import { db } from '@/lib/db';
import type { Permission } from '@/lib/permissions';

export async function can(permission: Permission): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';

  let roleId: number | null = session.user.roleId ? parseInt(session.user.roleId, 10) : null;
  if (!roleId) {
    const user = await db.user.findFirst({
      where:  { id: parseInt(session.user.id, 10), deletedAt: null },
      select: { roleId: true },
    });
    roleId = user?.roleId ?? null;
  }

  if (!roleId) return 'No role assigned. Please contact an administrator.';

  const perm = await db.rolePermission.findUnique({
    where:  { roleId_permission: { roleId, permission } },
    select: { permission: true },
  });

  if (!perm) return `You do not have the "${permission}" permission.`;
  return null;
}
