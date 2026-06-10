import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import UserForm from '../UserForm';
import { createUser } from '../actions';

export default async function CreateUserPage() {
  const session = await auth();
  if (!session) redirect('/');

  const roles = await db.role.findMany({
    orderBy: { name: 'asc' },
    select:  { name: true },
  });

  return (
    <UserForm
      action={createUser}
      roles={roles.map((r) => r.name)}
      mode="create"
    />
  );
}
