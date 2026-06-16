import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import RoleForm from '../../RoleForm';
import { updateRole, type RoleState } from '../../actions';

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id } = await params;
  const roleId = parseInt(id, 10);
  if (isNaN(roleId)) notFound();

  const role = await db.role.findFirst({
    where:  { id: roleId, deletedAt: null },
    select: {
      name:        true,
      permissions: { select: { permission: true } },
    },
  });
  if (!role) notFound();

  // Bind id server-side — client never controls which record is mutated.
  const action = updateRole.bind(null, roleId) as (
    prev:     RoleState,
    formData: FormData,
  ) => Promise<RoleState>;

  return (
    <RoleForm
      action={action}
      mode="edit"
      initial={{
        name:        role.name,
        permissions: role.permissions.map((p) => p.permission),
      }}
    />
  );
}
