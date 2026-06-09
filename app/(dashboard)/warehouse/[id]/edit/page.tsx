import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import WarehouseForm from '../../WarehouseForm';
import { updateWarehouse, type WarehouseState } from '../../actions';

export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id } = await params;
  const warehouseId = parseInt(id, 10);
  if (isNaN(warehouseId)) notFound();

  const warehouse = await db.warehouse.findFirst({
    where:  { id: warehouseId, deletedAt: null },
    select: {
      name:        true,
      email:       true,
      phoneNumber: true,
      country:     true,
      city:        true,
      zipCode:     true,
    },
  });

  if (!warehouse) notFound();

  // Bind the id server-side so the client can never change which record is
  // mutated. The bound function signature matches WarehouseAction exactly.
  const action = updateWarehouse.bind(null, warehouseId) as (
    prev: WarehouseState,
    formData: FormData,
  ) => Promise<WarehouseState>;

  return <WarehouseForm action={action} warehouse={warehouse} mode="edit" />;
}
