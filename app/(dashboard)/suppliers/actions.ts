'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

// ─── Permission helper ────────────────────────────────────────────────────────
// Checks "Manage Suppliers" permission — currently a role check.
// Replace with a granular RBAC lookup when that system is built.
const SUPPLIER_ROLES = ['admin', 'manager'] as const;

async function requireSupplierPermission() {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.' as const;
  if (!SUPPLIER_ROLES.includes(session.user.role as typeof SUPPLIER_ROLES[number])) {
    return 'You do not have permission to manage suppliers.' as const;
  }
  return null;
}

// ─── Shared schema ────────────────────────────────────────────────────────────
const supplierSchema = z.object({
  name:        z.string().min(1, 'Name is required.'),
  email:       z.string().email('Invalid email address.').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  country:     z.string().optional(),
  city:        z.string().optional(),
  address:     z.string().optional(),
});

// ─── Shared state type ────────────────────────────────────────────────────────
export type SupplierState = {
  error?:   string;
  success?: boolean;
};

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createSupplier(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const denied = await requireSupplierPermission();
  if (denied) return { error: denied };

  const parsed = supplierSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    address:     formData.get('address') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, country, city, address } = parsed.data;

  await db.supplier.create({
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      country:     country     || null,
      city:        city        || null,
      address:     address     || null,
    },
  });

  revalidatePath('/suppliers');
  return { success: true };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateSupplier(
  id: number,
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const denied = await requireSupplierPermission();
  if (denied) return { error: denied };

  // Re-fetch by id server-side — never trust the client for which record to mutate.
  const existing = await db.supplier.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) return { error: 'Supplier not found.' };

  const parsed = supplierSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    address:     formData.get('address') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, country, city, address } = parsed.data;

  await db.supplier.update({
    where: { id },
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      country:     country     || null,
      city:        city        || null,
      address:     address     || null,
    },
  });

  revalidatePath('/suppliers');
  return { success: true };
}

// ─── Delete (wired in Step 4) ─────────────────────────────────────────────────
export async function deleteSupplier(id: number): Promise<SupplierState> {
  const denied = await requireSupplierPermission();
  if (denied) return { error: denied };

  const existing = await db.supplier.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Supplier not found.' };

  // ── In-use guard ─────────────────────────────────────────────────────────────
  // Block deletion if the supplier is referenced by purchase records so we
  // don't orphan purchase data. Uncomment when the Purchase model is added:
  //
  // const purchaseCount = await db.purchase.count({ where: { supplierId: id } });
  // if (purchaseCount > 0) {
  //   return {
  //     error: `"${existing.name}" cannot be deleted — it is referenced by ` +
  //            `${purchaseCount} purchase(s). Remove those records first.`,
  //   };
  // }

  await db.supplier.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });

  revalidatePath('/suppliers');
  return { success: true };
}
