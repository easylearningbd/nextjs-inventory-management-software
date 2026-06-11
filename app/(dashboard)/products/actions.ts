'use server';

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';

// ─── Shared helpers ───────────────────────────────────────────────────────────
function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return []; }
}

// ─── Permission helper ────────────────────────────────────────────────────────
const PRODUCT_ROLES = ['admin', 'manager'] as const;

async function requireProductPermission() {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.' as const;
  if (!PRODUCT_ROLES.includes(session.user.role as typeof PRODUCT_ROLES[number])) {
    return 'You do not have permission to manage products.' as const;
  }
  return null;
}

// ─── Image upload helper ──────────────────────────────────────────────────────
async function saveProductImages(files: File[], productId: number): Promise<string[]> {
  const dir = path.join(process.cwd(), 'public', 'uploads', 'products');
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (const file of files) {
    if (!file || file.size === 0) continue;
    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const filename = `product-${productId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
    paths.push(`/uploads/products/${filename}`);
  }
  return paths;
}

// ─── Shared state type ────────────────────────────────────────────────────────
export type ProductFormState = {
  error?:   string;
  success?: boolean;
};

// ─── Enum constants (as const → readonly tuple, required by Zod v4) ───────────
const TAX_TYPES    = ['Exclusive', 'Inclusive'] as const;
const STOCK_STATUSES = ['Received', 'Pending', 'Ordered'] as const;

// ─── Product field schema (shared between create and update) ──────────────────
const productFieldSchema = z.object({
  name:  z.string().min(1, 'Name is required.'),
  code:  z.string().min(1, 'Code is required.'),
  price: z
    .string()
    .min(1, 'Price is required.')
    .refine(
      (v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0,
      'Price must be a valid positive number.',
    ),
  categoryId:   z.string().min(1, 'Category is required.').transform((v) => parseInt(v, 10)),
  brandId:      z.string().min(1, 'Brand is required.').transform((v) => parseInt(v, 10)),
  productUnit:  z.string().min(1, 'Product unit is required.'),
  taxType:      z.enum(TAX_TYPES, { message: 'Tax type is required.' }),
  stockAlert: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }),
  orderTax: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }),
  quantityLimitation: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }),
  notes: z.string().optional().transform((v) => v?.trim() || null),
});

// ─── Stock field schema (create only — edit never re-runs stock creation) ─────
const stockFieldSchema = z.object({
  warehouseId: z.string().min(1, 'Warehouse is required.').transform((v) => parseInt(v, 10)),
  supplierId: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }),
  quantity: z
    .string()
    .min(1, 'Quantity is required.')
    .refine(
      (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) >= 0,
      'Quantity must be a non-negative whole number.',
    )
    .transform((v) => parseInt(v, 10)),
  status: z.enum(STOCK_STATUSES, { message: 'Status is required.' }),
});

const createProductSchema = productFieldSchema.and(stockFieldSchema);

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createProduct(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const denied = await requireProductPermission();
  if (denied) return { error: denied };

  const parsed = createProductSchema.safeParse({
    name:               formData.get('name'),
    code:               formData.get('code'),
    price:              formData.get('price'),
    categoryId:         formData.get('categoryId'),
    brandId:            formData.get('brandId'),
    productUnit:        formData.get('productUnit'),
    taxType:            formData.get('taxType'),
    stockAlert:         formData.get('stockAlert'),
    orderTax:           formData.get('orderTax'),
    quantityLimitation: formData.get('quantityLimitation'),
    notes:              formData.get('notes'),
    warehouseId:        formData.get('warehouseId'),
    supplierId:         formData.get('supplierId'),
    quantity:           formData.get('quantity'),
    status:             formData.get('status'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const d = parsed.data;

  // Duplicate-code guard (only among active products — soft-deleted excluded).
  const dup = await db.product.findFirst({ where: { code: d.code, deletedAt: null } });
  if (dup) return { error: `A product with code "${d.code}" already exists.` };

  // Wrap product + initial stock in a single transaction — neither record
  // should exist without the other.
  const product = await db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name:               d.name,
        code:               d.code,
        price:              d.price,
        categoryId:         d.categoryId,
        brandId:            d.brandId,
        productUnit:        d.productUnit,
        stockAlert:         d.stockAlert,
        orderTax:           d.orderTax,
        taxType:            d.taxType,
        quantityLimitation: d.quantityLimitation,
        notes:              d.notes,
      },
    });

    await tx.productStock.create({
      data: {
        productId:   p.id,
        warehouseId: d.warehouseId,
        supplierId:  d.supplierId,
        quantity:    d.quantity,
        status:      d.status,
      },
    });

    return p;
  });

  // Save uploaded images after the transaction — file I/O cannot run inside a
  // Prisma interactive transaction.  If saving fails the product still exists
  // but without images; the user can re-upload via Edit.
  const imageFiles = formData.getAll('images') as File[];
  const imagePaths = await saveProductImages(imageFiles, product.id);
  if (imagePaths.length > 0) {
    await db.product.update({
      where: { id: product.id },
      data:  { images: JSON.stringify(imagePaths) },
    });
  }

  revalidatePath('/products');
  return { success: true };
}

// ─── Update ─── (completed in Step 4 — Edit) ─────────────────────────────────
// Stock is intentionally NOT re-created on update.  Editing a product must
// never silently inflate the per-warehouse quantity.  Stock changes are handled
// as explicit adjustments through a separate flow (Step 4).
export async function updateProduct(
  id: number,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const denied = await requireProductPermission();
  if (denied) return { error: denied };

  // Re-read server-side — never trust the client for which record to mutate.
  const existing = await db.product.findFirst({
    where:  { id, deletedAt: null },
    select: { code: true, images: true },
  });
  if (!existing) return { error: 'Product not found.' };

  const parsed = productFieldSchema.safeParse({
    name:               formData.get('name'),
    code:               formData.get('code'),
    price:              formData.get('price'),
    categoryId:         formData.get('categoryId'),
    brandId:            formData.get('brandId'),
    productUnit:        formData.get('productUnit'),
    taxType:            formData.get('taxType'),
    stockAlert:         formData.get('stockAlert'),
    orderTax:           formData.get('orderTax'),
    quantityLimitation: formData.get('quantityLimitation'),
    notes:              formData.get('notes'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const d = parsed.data;

  // Duplicate-code guard — skip if code is unchanged.
  if (d.code !== existing.code) {
    const dup = await db.product.findFirst({ where: { code: d.code, deletedAt: null } });
    if (dup) return { error: `A product with code "${d.code}" already exists.` };
  }

  // The form sends `existingImages` — a JSON array of paths the user chose to
  // keep (any path the user removed via × is absent from this list).
  // Cross-check against the actual DB record to block path-injection attacks.
  const serverImages = parseImages(existing.images);
  const keptJson     = formData.get('existingImages') as string | null;
  let   keptImages: string[] = [];
  try {
    const arr = JSON.parse(keptJson ?? '[]');
    if (Array.isArray(arr)) {
      // Only allow paths that actually exist in the server record.
      keptImages = arr.filter(
        (v): v is string => typeof v === 'string' && serverImages.includes(v),
      );
    }
  } catch { /* leave keptImages empty */ }

  const newImageFiles = formData.getAll('images') as File[];
  const newPaths      = await saveProductImages(newImageFiles, id);
  // Merge: kept existing + newly uploaded.  "[]" is a valid empty state.
  const images        = JSON.stringify([...keptImages, ...newPaths]);

  await db.product.update({
    where: { id },
    data: {
      name:               d.name,
      code:               d.code,
      price:              d.price,
      categoryId:         d.categoryId,
      brandId:            d.brandId,
      productUnit:        d.productUnit,
      stockAlert:         d.stockAlert,
      orderTax:           d.orderTax,
      taxType:            d.taxType,
      quantityLimitation: d.quantityLimitation,
      notes:              d.notes,
      images,
    },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  revalidatePath(`/products/${id}/edit`);
  return { success: true };
}

// ─── Delete ─── (completed in Step 6) ────────────────────────────────────────
export async function deleteProduct(id: number): Promise<ProductFormState> {
  const denied = await requireProductPermission();
  if (denied) return { error: denied };

  const existing = await db.product.findFirst({
    where:  { id, deletedAt: null },
    select: { name: true },
  });
  if (!existing) return { error: 'Product not found.' };

  // ── In-use guard ──────────────────────────────────────────────────────────────
  // Prevent deleting products referenced by purchases / sales / transfers.
  // Uncomment each block when the corresponding model is added to schema.prisma:
  //
  // const purchaseCount = await db.purchaseItem.count({ where: { productId: id } });
  // if (purchaseCount > 0) {
  //   return { error: `"${existing.name}" is referenced by ${purchaseCount} purchase(s). Remove those first.` };
  // }
  //
  // const saleCount = await db.saleItem.count({ where: { productId: id } });
  // if (saleCount > 0) {
  //   return { error: `"${existing.name}" is referenced by ${saleCount} sale(s). Remove those first.` };
  // }

  await db.product.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/products');
  return { success: true };
}
