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
  const filename = `brand-${id}-${Date.now()}.${ext}`;
  const dir      = path.join(process.cwd(), 'public', 'uploads', 'brands');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  return `/uploads/brands/${filename}`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const brandSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
});

// ─── Shared state type ────────────────────────────────────────────────────────
export type BrandState = {
  error?:   string;
  success?: boolean;
};

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createBrand(
  _prev: BrandState,
  formData: FormData,
): Promise<BrandState> {
  const denied = await can('Manage Brands');
  if (denied) return { error: denied };

  const parsed = brandSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  // Create the row first to get the id for the filename.
  const brand = await db.brand.create({ data: { name: parsed.data.name } });

  const imageFile = formData.get('logo') as File | null;
  const logoPath  = imageFile ? await saveLogo(imageFile, brand.id) : undefined;
  if (logoPath) {
    await db.brand.update({ where: { id: brand.id }, data: { logo: logoPath } });
  }

  revalidatePath('/brands');
  return { success: true };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateBrand(
  id: number,
  _prev: BrandState,
  formData: FormData,
): Promise<BrandState> {
  const denied = await can('Manage Brands');
  if (denied) return { error: denied };

  // Re-read server-side — never trust the client for which record to mutate.
  const existing = await db.brand.findFirst({
    where:  { id, deletedAt: null },
    select: { logo: true },
  });
  if (!existing) return { error: 'Brand not found.' };

  const parsed = brandSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const imageFile = formData.get('logo') as File | null;
  const logoPath  = imageFile ? await saveLogo(imageFile, id) : undefined;

  await db.brand.update({
    where: { id },
    data: {
      name: parsed.data.name,
      // Keep the existing logo if no new file was uploaded.
      ...(logoPath ? { logo: logoPath } : {}),
    },
  });

  revalidatePath('/brands');
  return { success: true };
}

// ─── Delete (wired in Step 4) ─────────────────────────────────────────────────
export async function deleteBrand(id: number): Promise<BrandState> {
  const denied = await can('Manage Brands');
  if (denied) return { error: denied };

  const existing = await db.brand.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Brand not found.' };

  // ── In-use guard ─────────────────────────────────────────────────────────────
  // Prevent orphaning products that reference this brand.
  // Uncomment when the Product model is added to schema.prisma:
  //
  // const productCount = await db.product.count({ where: { brandId: id } });
  // if (productCount > 0) {
  //   return {
  //     error: `"${existing.name}" cannot be deleted — referenced by ` +
  //            `${productCount} product(s). Remove those references first.`,
  //   };
  // }

  await db.brand.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/brands');
  return { success: true };
}
