import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SupplierForm from '../SupplierForm';
import { createSupplier } from '../actions';

export default async function CreateSupplierPage() {
  const session = await auth();
  if (!session) redirect('/');

  return <SupplierForm action={createSupplier} mode="create" />;
}
