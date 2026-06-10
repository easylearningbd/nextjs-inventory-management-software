import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import CustomerForm from '../CustomerForm';
import { createCustomer } from '../actions';

export default async function CreateCustomerPage() {
  const session = await auth();
  if (!session) redirect('/');

  return <CustomerForm action={createCustomer} mode="create" />;
}
