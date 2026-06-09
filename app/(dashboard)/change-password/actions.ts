'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { db } from '@/lib/db';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword:     z.string().min(8, 'New password must be at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Please confirm your new password.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path:    ['confirmPassword'],
  });

export type ChangePasswordState = {
  error?:   string;
  success?: boolean;
};

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  // Always re-read the session server-side — never trust an id from the client.
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated.' };

  const userId = parseInt(session.user.id, 10);

  const parsed = schema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword:     formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { currentPassword, newPassword } = parsed.data;

  // Fetch only the password hash — nothing else is needed here.
  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { password: true },
  });
  if (!user) return { error: 'User not found.' };

  // Reject if the current password is wrong before doing anything else.
  const currentValid = await bcrypt.compare(currentPassword, user.password);
  if (!currentValid) return { error: 'Current password is incorrect.' };

  // Reject if the new password is the same as the current one.
  const isSame = await bcrypt.compare(newPassword, user.password);
  if (isSame) return { error: 'New password must be different from the current one.' };

  // Hash and persist. Never log, return, or expose any password value.
  const hashed = await bcrypt.hash(newPassword, 12);
  await db.user.update({
    where: { id: userId },
    data:  { password: hashed },
  });

  // Optional enhancement: sign the user out after a password change so they
  // must re-authenticate with the new credential. This is a security best
  // practice (invalidates any stolen sessions) but is not implemented here to
  // avoid disrupting active work. To enable:
  //   import { signOut } from '@/auth'
  //   await signOut()

  return { success: true };
}
