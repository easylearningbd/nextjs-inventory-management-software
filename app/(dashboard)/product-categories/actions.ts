'use server';

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';

// ─── Logo upload helper ───────────────────────────────────────────────────────
async function saveLogo(file: File, id: number | string): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined;
  const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `category-${id}-${Date.now()}.${ext}`;
  const dir      = path.join(process.cwd(), 'public', 'uploads', 'categories');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/categories/${filename}`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const categorySchema = z.object({
  name: z.string().min(1, 'Name is required.'),
});

// ─── Shared state type ────────────────────────────────────────────────────────
export type CategoryState = {
  error?:   string;
  success?: boolean;
};

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createCategory(
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const denied = await can('Manage Product Categories');
  if (denied) return { error: denied };

  const parsed = categorySchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  // Create the row first to get the id for the filename.
  const category = await db.category.create({ data: { name: parsed.data.name } });

  const imageFile = formData.get('logo') as File | null;
  const logoPath  = imageFile ? await saveLogo(imageFile, category.id) : undefined;
  if (logoPath) {
    await db.category.update({ where: { id: category.id }, data: { logo: logoPath } });
  }

  revalidatePath('/product-categories');
  return { success: true };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateCategory(
  id: number,
  _prev: CategoryState,
  formData: FormData,
): Promise<CategoryState> {
  const denied = await can('Manage Product Categories');
  if (denied) return { error: denied };

  // Re-read server-side — never trust the client for which record to mutate.
  const existing = await db.category.findFirst({
    where:  { id, deletedAt: null },
    select: { logo: true },
  });
  if (!existing) return { error: 'Category not found.' };

  const parsed = categorySchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const imageFile = formData.get('logo') as File | null;
  const logoPath  = imageFile ? await saveLogo(imageFile, id) : undefined;

  await db.category.update({
    where: { id },
    data: {
      name: parsed.data.name,
      // Keep the existing logo if no new file was uploaded.
      ...(logoPath ? { logo: logoPath } : {}),
    },
  });

  revalidatePath('/product-categories');
  return { success: true };
}

// ─── Delete (wired in Step 4) ─────────────────────────────────────────────────
export async function deleteCategory(id: number): Promise<CategoryState> {
  const denied = await can('Manage Product Categories');
  if (denied) return { error: denied };

  const existing = await db.category.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Category not found.' };

  // ── In-use guard ──────────────────────────────────────────────────────────────
  // Prevent orphaning products that belong to this category.
  // Uncomment when the Product model is added to schema.prisma:
  //
  // const productCount = await db.product.count({ where: { categoryId: id } });
  // if (productCount > 0) {
  //   return {
  //     error: `"${existing.name}" cannot be deleted — referenced by ` +
  //            `${productCount} product(s). Remove those references first.`,
  //   };
  // }

  await db.category.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/product-categories');
  return { success: true };
}
