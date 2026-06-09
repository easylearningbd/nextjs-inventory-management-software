'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

// ─── Permission helper ────────────────────────────────────────────────────────
// Checks that the caller has the "Manage Warehouses" permission.
// Currently implemented as a role check (admin | manager).
// Replace with a granular permission lookup when the full RBAC system is built.
const WAREHOUSE_ROLES = ['admin', 'manager'] as const;

async function requireWarehousePermission() {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.' as const;
  if (!WAREHOUSE_ROLES.includes(session.user.role as typeof WAREHOUSE_ROLES[number])) {
    return 'You do not have permission to manage warehouses.' as const;
  }
  return null;
}

// ─── Shared schema ────────────────────────────────────────────────────────────
const warehouseSchema = z.object({
  name:        z.string().min(1, 'Name is required.'),
  email:       z.string().email('Invalid email address.').optional().or(z.literal('')),
  phoneNumber: z.string().optional(),
  country:     z.string().optional(),
  city:        z.string().optional(),
  zipCode:     z.string().optional(),
});

// ─── Shared state type (used by both create + edit) ───────────────────────────
export type WarehouseState = {
  error?:   string;
  success?: boolean;
};

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createWarehouse(
  _prev: WarehouseState,
  formData: FormData,
): Promise<WarehouseState> {
  const denied = await requireWarehousePermission();
  if (denied) return { error: denied };

  const parsed = warehouseSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    zipCode:     formData.get('zipCode') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, country, city, zipCode } = parsed.data;

  await db.warehouse.create({
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      country:     country     || null,
      city:        city        || null,
      zipCode:     zipCode     || null,
    },
  });

  revalidatePath('/warehouse');
  return { success: true };
}

// ─── Update (added in Step 4) ─────────────────────────────────────────────────
export async function updateWarehouse(
  id: number,
  _prev: WarehouseState,
  formData: FormData,
): Promise<WarehouseState> {
  const denied = await requireWarehousePermission();
  if (denied) return { error: denied };

  // Re-read the warehouse from the DB so the id comes from the server,
  // not from a client-supplied hidden field.
  const existing = await db.warehouse.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) return { error: 'Warehouse not found.' };

  const parsed = warehouseSchema.safeParse({
    name:        formData.get('name'),
    email:       formData.get('email') || undefined,
    phoneNumber: formData.get('phoneNumber') || undefined,
    country:     formData.get('country') || undefined,
    city:        formData.get('city') || undefined,
    zipCode:     formData.get('zipCode') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { name, email, phoneNumber, country, city, zipCode } = parsed.data;

  await db.warehouse.update({
    where: { id },
    data: {
      name,
      email:       email       || null,
      phoneNumber: phoneNumber || null,
      country:     country     || null,
      city:        city        || null,
      zipCode:     zipCode     || null,
    },
  });

  revalidatePath('/warehouse');
  return { success: true };
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteWarehouse(id: number): Promise<WarehouseState> {
  const denied = await requireWarehousePermission();
  if (denied) return { error: denied };

  const existing = await db.warehouse.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Warehouse not found.' };

  // ── In-use guard ────────────────────────────────────────────────────────────
  // Hard-deleting a warehouse would orphan stock, sales, purchases and
  // transfers. We soft-delete instead, but we still block if records actively
  // reference this warehouse so the UI stays consistent.
  //
  // Uncomment each block as the corresponding model is added to schema.prisma:
  //
  // const [stockCount, saleCount, purchaseCount, transferCount] = await Promise.all([
  //   db.stockItem.count({ where: { warehouseId: id } }),
  //   db.sale.count({ where: { warehouseId: id } }),
  //   db.purchase.count({ where: { warehouseId: id } }),
  //   db.transfer.count({
  //     where: { OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] },
  //   }),
  // ]);
  // const totalRefs = stockCount + saleCount + purchaseCount + transferCount;
  // if (totalRefs > 0) {
  //   return {
  //     error: `"${existing.name}" cannot be deleted — it is referenced by ` +
  //            `${totalRefs} record(s). Remove those references first.`,
  //   };
  // }

  await db.warehouse.update({
    where: { id },
    data:  { deletedAt: new Date() },
  });

  revalidatePath('/warehouse');
  return { success: true };
}
