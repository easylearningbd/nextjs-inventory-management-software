'use server';

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { can } from '@/lib/can';
import { db } from '@/lib/db';


// ─── Shared image-upload helper ───────────────────────────────────────────────
async function saveAvatar(file: File, userId: number | string): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined;
  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `avatar-${userId}-${Date.now()}.${ext}`;
  const dir      = path.join(process.cwd(), 'public', 'uploads', 'avatars');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/avatars/${filename}`;
}

// ─── Shared state type ────────────────────────────────────────────────────────
export type UserFormState = {
  error?:   string;
  success?: boolean;
};

// ─── Schemas ─────────────────────────────────────────────────────────────────
const baseFields = {
  firstName:   z.string().min(1, 'First name is required.'),
  lastName:    z.string().min(1, 'Last name is required.'),
  email:       z.string().email('Invalid email address.'),
  phoneNumber: z.string().optional(),
  roleId:      z.coerce.number().int().positive('Role is required.'),
};

const createUserSchema = z
  .object({
    ...baseFields,
    password:        z.string().min(8, 'Password must be at least 8 characters.'),
    confirmPassword: z.string().min(1, 'Please confirm the password.'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path:    ['confirmPassword'],
  });

const updateUserSchema = z
  .object({
    ...baseFields,
    password:        z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (d) => {
      if (!d.password) return true;              // blank = keep existing
      if (d.password.length < 8) return false;  // must be long enough
      return d.password === d.confirmPassword;  // must match
    },
    {
      message: 'New password must be at least 8 characters and match the confirmation.',
      path:    ['password'],
    },
  );

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createUser(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const denied = await can('Manage Users');
  if (denied) return { error: denied };

  const parsed = createUserSchema.safeParse({
    firstName:       formData.get('firstName'),
    lastName:        formData.get('lastName'),
    email:           formData.get('email'),
    phoneNumber:     formData.get('phoneNumber') || undefined,
    password:        formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    roleId:          formData.get('roleId'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { firstName, lastName, email, phoneNumber, password, roleId } = parsed.data;

  // Re-read role server-side — never trust client-submitted id.
  const roleRecord = await db.role.findFirst({ where: { id: roleId, deletedAt: null } });
  if (!roleRecord) return { error: 'Invalid role selected.' };

  // Email uniqueness check (excluding soft-deleted accounts).
  const conflict = await db.user.findFirst({ where: { email, deletedAt: null } });
  if (conflict) return { error: 'A user with this email already exists.' };

  // Hash password — never store the plain value.
  const hashed = await bcrypt.hash(password, 12);

  const newUser = await db.user.create({
    data: {
      firstName, lastName, email,
      phoneNumber: phoneNumber ?? null,
      password:    hashed,
      role:        roleRecord.name,
      roleId:      roleRecord.id,
    },
  });

  // Handle optional avatar upload after we have the user id.
  const imageFile = formData.get('image') as File | null;
  const imagePath = imageFile ? await saveAvatar(imageFile, newUser.id) : undefined;
  if (imagePath) {
    await db.user.update({ where: { id: newUser.id }, data: { image: imagePath } });
  }

  revalidatePath('/users');
  return { success: true };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateUser(
  id: number,
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const denied = await can('Manage Users');
  if (denied) return { error: denied };

  // Re-fetch server-side — never trust client for which record to mutate.
  const existing = await db.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return { error: 'User not found.' };

  const parsed = updateUserSchema.safeParse({
    firstName:       formData.get('firstName'),
    lastName:        formData.get('lastName'),
    email:           formData.get('email'),
    phoneNumber:     formData.get('phoneNumber') || undefined,
    password:        formData.get('password') || undefined,
    confirmPassword: formData.get('confirmPassword') || undefined,
    roleId:          formData.get('roleId'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { firstName, lastName, email, phoneNumber, password, roleId } = parsed.data;

  // Re-read role server-side — never trust client-submitted id.
  const roleRecord = await db.role.findFirst({ where: { id: roleId, deletedAt: null } });
  if (!roleRecord) return { error: 'Invalid role selected.' };

  // Email uniqueness — allow the same email for this user, block if taken by another.
  const conflict = await db.user.findFirst({
    where: { email, deletedAt: null, NOT: { id } },
  });
  if (conflict) return { error: 'A user with this email already exists.' };

  // Only hash a new password if one was provided; otherwise keep the existing hash.
  const hashedPassword = password
    ? await bcrypt.hash(password, 12)
    : existing.password;

  // Handle optional avatar upload.
  const imageFile = formData.get('image') as File | null;
  const imagePath = imageFile ? await saveAvatar(imageFile, id) : undefined;

  await db.user.update({
    where: { id },
    data: {
      firstName,
      lastName,
      email,
      phoneNumber:  phoneNumber ?? null,
      password:     hashedPassword,
      role:         roleRecord.name,
      roleId:       roleRecord.id,
      ...(imagePath ? { image: imagePath } : {}),
    },
  });

  revalidatePath('/users');
  return { success: true };
}

// ─── Delete (wired in Step 4) ─────────────────────────────────────────────────
export async function deleteUser(id: number): Promise<UserFormState> {
  const denied = await can('Manage Users');
  if (denied) return { error: denied };

  const session = await auth();
  const callerId = session?.user?.id ? parseInt(session.user.id, 10) : -1;

  // A user must not delete their own account.
  if (id === callerId) {
    return { error: 'You cannot delete your own account.' };
  }

  const existing = await db.user.findFirst({
    where:  { id, deletedAt: null },
    select: { firstName: true, lastName: true, role: true },
  });
  if (!existing) return { error: 'User not found.' };

  // Block deletion of the last admin — the system must always have at least one.
  if (existing.role === 'admin') {
    const adminCount = await db.user.count({
      where: { role: 'admin', deletedAt: null },
    });
    if (adminCount <= 1) {
      return {
        error: `Cannot delete "${existing.firstName} ${existing.lastName}" — they are the last admin. Promote another user to admin first.`,
      };
    }
  }

  await db.user.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/users');
  return { success: true };
}
