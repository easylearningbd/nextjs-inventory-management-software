'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';

// ─── Shared schema ────────────────────────────────────────────────────────────
const customerSchema = z.object({
  name:        z.string().min(1, 'Name is required.'),
  email:       z.string().email('Invalid email address.').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  // DOB arrives as "YYYY-MM-DD" from <input type="date">; coerce to Date | null.
  dateOfBirth: z.string().optional().transform((val): Date | null => {
    if (!val || val.trim() === '') return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }),
  country:     z.string().optional(),
  city:        z.string().optional(),
  address:     z.string().optional(),
});

// ─── Shared state type ────────────────────────────────────────────────────────
export type CustomerState = {
  error?:   string;
  success?: boolean;
};

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createCustomer(
  _prev: CustomerState,
  formData: FormData,
): Promise<CustomerState> {
  const denied = await can('Manage Customers');
  if (denied) return { error: denied };

  const parsed = customerSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    dateOfBirth: formData.get('dateOfBirth') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    address:     formData.get('address') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, dateOfBirth, country, city, address } = parsed.data;

  // isDefault is intentionally never set here — it is only set by the seed.
  await db.customer.create({
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      dateOfBirth: dateOfBirth ?? null,
      country:     country     || null,
      city:        city        || null,
      address:     address     || null,
    },
  });

  revalidatePath('/customers');
  return { success: true };
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateCustomer(
  id: number,
  _prev: CustomerState,
  formData: FormData,
): Promise<CustomerState> {
  const denied = await can('Manage Customers');
  if (denied) return { error: denied };

  // Re-fetch server-side — never trust the client for which record to mutate.
  const existing = await db.customer.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) return { error: 'Customer not found.' };

  const parsed = customerSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    dateOfBirth: formData.get('dateOfBirth') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    address:     formData.get('address') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, dateOfBirth, country, city, address } = parsed.data;

  // isDefault is intentionally excluded — users must not change the default flag.
  await db.customer.update({
    where: { id },
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      dateOfBirth: dateOfBirth ?? null,
      country:     country     || null,
      city:        city        || null,
      address:     address     || null,
    },
  });

  revalidatePath('/customers');
  return { success: true };
}

// ─── Delete (wired in Step 5) ─────────────────────────────────────────────────
export async function deleteCustomer(id: number): Promise<CustomerState> {
  const denied = await can('Manage Customers');
  if (denied) return { error: denied };

  const existing = await db.customer.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true, isDefault: true },
  });
  if (!existing) return { error: 'Customer not found.' };

  // The default walk-in customer must never be deleted.
  // It is the POS fallback and is referenced by the seed + any walk-in sales.
  if (existing.isDefault) {
    return { error: `"${existing.name}" is the default walk-in customer and cannot be deleted.` };
  }

  // ── In-use guard ──────────────────────────────────────────────────────────────
  // Uncomment each block when the corresponding model is added to schema.prisma:
  //
  // const [saleCount, quotationCount] = await Promise.all([
  //   db.sale.count({ where: { customerId: id } }),
  //   db.quotation.count({ where: { customerId: id } }),
  // ]);
  // const totalRefs = saleCount + quotationCount;
  // if (totalRefs > 0) {
  //   return {
  //     error: `"${existing.name}" cannot be deleted — referenced by ` +
  //            `${totalRefs} record(s). Remove those records first.`,
  //   };
  // }

  await db.customer.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });

  revalidatePath('/customers');
  return { success: true };
}
