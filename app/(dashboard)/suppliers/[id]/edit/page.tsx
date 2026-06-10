import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import SupplierForm from '../../SupplierForm';
import { updateSupplier, type SupplierState } from '../../actions';

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id } = await params;
  const supplierId = parseInt(id, 10);
  if (isNaN(supplierId)) notFound();

  const supplier = await db.supplier.findFirst({
    where:  { id: supplierId, deletedAt: null },
    select: {
      name:        true,
      email:       true,
      phoneNumber: true,
      country:     true,
      city:        true,
      address:     true,
    },
  });

  if (!supplier) notFound();

  // Bind the id server-side so the client can never change which record is mutated.
  const action = updateSupplier.bind(null, supplierId) as (
    prev: SupplierState,
    formData: FormData,
  ) => Promise<SupplierState>;

  return <SupplierForm action={action} supplier={supplier} mode="edit" />;
}
