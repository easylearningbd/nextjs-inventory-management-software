import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import WarehouseForm from '../WarehouseForm';
import { createWarehouse } from '../actions';

export default async function CreateWarehousePage() {
  const session = await auth();
  if (!session) redirect('/');

  return <WarehouseForm action={createWarehouse} mode="create" />;
}
