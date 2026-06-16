import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import UserForm from '../../UserForm';
import { updateUser, type UserFormState } from '../../actions';

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) notFound();

  // Fetch user and roles in parallel.
  // Password is deliberately excluded from the select — it must never be
  // pre-filled or sent to the client.
  const [user, roleRows] = await Promise.all([
    db.user.findFirst({
      where:  { id: userId, deletedAt: null },
      select: {
        firstName:   true,
        lastName:    true,
        email:       true,
        phoneNumber: true,
        image:       true,
        roleId:      true,
        // password: intentionally omitted
      },
    }),
    db.role.findMany({
      where:   { deletedAt: null },
      orderBy: { name: 'asc' },
      select:  { id: true, name: true },
    }),
  ]);

  if (!user) notFound();

  // Bind the id server-side so the client can never change which record is mutated.
  const action = updateUser.bind(null, userId) as (
    prev: UserFormState,
    formData: FormData,
  ) => Promise<UserFormState>;

  return (
    <UserForm
      action={action}
      roles={roleRows}
      user={user}
      mode="edit"
    />
  );
}
