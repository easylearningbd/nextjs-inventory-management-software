import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import RoleForm from '../RoleForm';
import { createRole } from '../actions';

export default async function CreateRolePage() {
  const session = await auth();
  if (!session) redirect('/');

  return <RoleForm action={createRole} mode="create" />;
}
