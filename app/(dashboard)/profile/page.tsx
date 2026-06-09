import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import ProfileForm from './ProfileForm';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const user = await db.user.findUnique({
    where: { id: parseInt(session.user.id, 10) },
    select: {
      firstName:   true,
      lastName:    true,
      email:       true,
      phoneNumber: true,
      image:       true,
      role:        true,
      // password is deliberately excluded
    },
  });

  if (!user) notFound();

  return <ProfileForm user={user} />;
}
