import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import CustomerForm from '../../CustomerForm';
import { updateCustomer, type CustomerState } from '../../actions';

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id } = await params;
  const customerId = parseInt(id, 10);
  if (isNaN(customerId)) notFound();

  const customer = await db.customer.findFirst({
    where:  { id: customerId, deletedAt: null },
    select: {
      name:        true,
      email:       true,
      phoneNumber: true,
      dateOfBirth: true,
      country:     true,
      city:        true,
      address:     true,
    },
  });

  if (!customer) notFound();

  // Bind the id server-side so the client can never change which record is mutated.
  const action = updateCustomer.bind(null, customerId) as (
    prev: CustomerState,
    formData: FormData,
  ) => Promise<CustomerState>;

  return <CustomerForm action={action} customer={customer} mode="edit" />;
}
