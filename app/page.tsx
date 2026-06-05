import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SignInForm from '@/components/auth/SignInForm';

export default async function RootPage() {
  const session = await auth();
  if (session) redirect('/dashboard');

  return <SignInForm />;
}
