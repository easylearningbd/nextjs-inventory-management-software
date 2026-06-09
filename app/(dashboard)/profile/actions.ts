'use server';

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { auth, updateSession } from '@/auth';
import { db } from '@/lib/db';

const profileSchema = z.object({
  firstName:   z.string().min(1, 'First name is required'),
  lastName:    z.string().min(1, 'Last name is required'),
  email:       z.string().email('Invalid email address'),
  phoneNumber: z.string().optional(),
});

export type ProfileState = {
  error?:   string;
  success?: boolean;
};

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  // Always re-read the session server-side — never trust an id from the client.
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated.' };

  const userId = parseInt(session.user.id, 10);

  const parsed = profileSchema.safeParse({
    firstName:   formData.get('firstName'),
    lastName:    formData.get('lastName'),
    email:       formData.get('email'),
    phoneNumber: formData.get('phoneNumber') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { firstName, lastName, email, phoneNumber } = parsed.data;

  // Reject if the new email is already used by a different user.
  const conflict = await db.user.findFirst({
    where: { email, NOT: { id: userId } },
  });
  if (conflict) return { error: 'That email is already used by another account.' };

  // Handle optional image upload.
  let imagePath: string | undefined;
  const imageFile = formData.get('image') as File | null;
  if (imageFile && imageFile.size > 0) {
    const ext      = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filename = `avatar-${userId}-${Date.now()}.${ext}`;
    const dir      = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await imageFile.arrayBuffer()));
    imagePath = `/uploads/avatars/${filename}`;
  }

  // Role is intentionally excluded here.
  // A user must not be able to escalate their own role (e.g. to admin).
  // Role changes are handled by admins on the dedicated Users management page.
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      firstName,
      lastName,
      email,
      phoneNumber: phoneNumber ?? null,
      ...(imagePath ? { image: imagePath } : {}),
    },
  });

  // Refresh the JWT so the topbar picks up the new name/avatar immediately
  // after router.refresh() on the client side.
  await updateSession({
    user: {
      name:  `${updated.firstName} ${updated.lastName}`,
      image: updated.image,
    },
  });

  return { success: true };
}
