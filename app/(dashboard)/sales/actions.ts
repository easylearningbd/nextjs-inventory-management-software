'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

export type ActionResult = { error?: string; success?: boolean; id?: number };

// ── Permission guard ──────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['admin', 'manager'] as const;

async function requirePermission(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return 'Not authenticated.';
  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return 'You do not have permission to manage sales.';
  }
  return null;
}

// ── Product search (warehouse-scoped) ─────────────────────────────────────────
// Returns only products that have stock > 0 in the selected warehouse.
// A sale can only ship products already in stock.

export type SearchProductForSale = {
  id:           number;
  name:         string;
  code:         string;
  productUnit:  string;
  price:        number;
  currentStock: number;
};

export async function searchProductsForSale(
  query:       string,
  warehouseId: number | null,
): Promise<SearchProductForSale[]> {
  const q = query.trim();
  if (!q || !warehouseId) return [];

  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
      ],
      stocks: {
        some: {
          warehouseId,
          quantity: { gt: 0 },
        },
      },
    },
    select: {
      id:          true,
      name:        true,
      code:        true,
      productUnit: true,
      price:       true,
      stocks: {
        where:  { warehouseId },
        select: { quantity: true },
      },
    },
    orderBy: { name: 'asc' },
    take:    10,
  });

  return products.map((p) => ({
    id:           p.id,
    name:         p.name,
    code:         p.code,
    productUnit:  p.productUnit,
    price:        Number(p.price),
    currentStock: p.stocks[0]?.quantity ?? 0,
  }));
}

// ── Shared validation schemas ─────────────────────────────────────────────────

const STATUSES         = ['Received', 'Ordered', 'Pending'] as const;
const PAYMENT_STATUSES = ['Paid', 'Unpaid', 'Partial']      as const;
const PAY_TYPES        = ['Cash', 'Card', 'Cheque', 'Bank Transfer'] as const;
const DISC_TYPES       = ['Fixed', 'Percentage']             as const;
const TAX_TYPES        = ['Inclusive', 'Exclusive']          as const;

const itemSchema = z.object({
  productId:    z.number().int().positive(),
  quantity:     z.number().int().min(1, 'Quantity must be at least 1.'),
  netUnitPrice: z.number().min(0, 'Unit price cannot be negative.'),
  discountType: z.enum(DISC_TYPES),
  discount:     z.number().min(0, 'Discount cannot be negative.'),
  taxType:      z.enum(TAX_TYPES),
  orderTax:     z.number().min(0).max(100, 'Tax rate must be 0–100%.'),
  saleUnit:     z.string().min(1, 'Sale unit is required.'),
});

// ── Derive payment status from paid vs grand total ────────────────────────────

function derivePaymentStatus(paid: number, grandTotal: number): string {
  if (paid <= 0)              return 'Unpaid';
  if (paid >= grandTotal)     return 'Paid';
  return 'Partial';
}

// ── Create sale ───────────────────────────────────────────────────────────────

export async function createSale(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission
  const denied = await requirePermission();
  if (denied) return { error: denied };

  // 2. Parse header fields
  const dateStr      = (formData.get('date')          as string)?.trim();
  const whIdRaw      = formData.get('warehouseId')    as string;
  const custIdRaw    = formData.get('customerId')     as string;
  const statusRaw    = (formData.get('status')        as string)?.trim();
  const payTypeRaw   = (formData.get('paymentType')   as string)?.trim();
  const notes        = (formData.get('notes')         as string)?.trim() || null;

  const warehouseId = parseInt(whIdRaw,   10);
  const customerId  = parseInt(custIdRaw, 10);

  if (!dateStr)                                    return { error: 'Date is required.' };
  if (isNaN(warehouseId) || warehouseId <= 0)      return { error: 'Warehouse is required.' };
  if (isNaN(customerId)  || customerId  <= 0)      return { error: 'Customer is required.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number])) {
    return { error: 'Invalid status.' };
  }
  if (!PAY_TYPES.includes(payTypeRaw as typeof PAY_TYPES[number])) {
    return { error: 'Invalid payment type.' };
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  const status      = statusRaw  as typeof STATUSES[number];
  const paymentType = payTypeRaw as typeof PAY_TYPES[number];

  // 3. Order-level numbers
  const orderTaxPct  = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping     = parseFloat(formData.get('shipping')     as string) || 0;
  const paidInput    = parseFloat(formData.get('paidAmount')   as string) || 0;

  if (orderTaxPct  < 0 || orderTaxPct  > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                        return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                        return { error: 'Shipping cannot be negative.' };
  if (paidInput    < 0)                        return { error: 'Paid amount cannot be negative.' };

  // 4. Parse + validate line items
  let rawItems: unknown;
  try {
    rawItems = JSON.parse((formData.get('items') as string) ?? '[]');
  } catch {
    return { error: 'Invalid items payload.' };
  }

  const itemsResult = z
    .array(itemSchema)
    .min(1, 'At least one item is required.')
    .safeParse(rawItems);

  if (!itemsResult.success) {
    return { error: itemsResult.error.issues[0]?.message ?? 'Validation failed.' };
  }
  const items = itemsResult.data;

  // 5. Re-read all IDs server-side
  const [warehouse, customer] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.customer.findFirst({ where: { id: customerId,  deletedAt: null }, select: { id: true } }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!customer)  return { error: 'Selected customer not found.' };

  const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
  const activeProducts   = await db.product.findMany({
    where:  { id: { in: uniqueProductIds }, deletedAt: null },
    select: { id: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }

  // 6. Recompute totals server-side — never trust client values
  const lineInputs = items.map((item) => ({
    netUnitCost:  item.netUnitPrice,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const grand         = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });
  const paid          = Math.min(paidInput, grand);
  const due           = Math.max(0, grand - paid);
  const paymentStatus = derivePaymentStatus(paid, grand);

  // 7. Atomic transaction: create sale + items + stock + optional payment
  // A sale is stock-OUTBOUND. When status=Received each line DECREMENTS
  // warehouse stock. applyStockAdjustment throws on insufficient stock —
  // the $transaction rolls back automatically (no partial state).
  let newId: number;
  try {
    await db.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          reference:     `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          customerId:    customer.id,
          warehouseId:   warehouse.id,
          date,
          status,
          orderTax:      orderTaxPct.toFixed(2),
          discount:      flatDiscount.toFixed(2),
          shipping:      shipping.toFixed(2),
          grandTotal:    grand.toFixed(2),
          paid:          paid.toFixed(2),
          due:           due.toFixed(2),
          paymentStatus,
          paymentType,
          notes:         notes ?? undefined,
        },
      });

      // Replace TEMP with race-safe reference
      const reference = `SA_${String(sale.id).padStart(4, '0')}`;
      await tx.sale.update({ where: { id: sale.id }, data: { reference } });

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const sub  = lineSubtotal(lineInputs[idx]);

        await tx.saleItem.create({
          data: {
            saleId:       sale.id,
            productId:    item.productId,
            netUnitPrice: item.netUnitPrice.toFixed(2),
            quantity:     item.quantity,
            discountType: item.discountType,
            discount:     item.discount.toFixed(2),
            taxType:      item.taxType,
            orderTax:     item.orderTax.toFixed(2),
            subtotal:     sub.toFixed(2),
            saleUnit:     item.saleUnit,
          },
        });

        if (status === 'Received') {
          await applyStockAdjustment(tx, item.productId, warehouse.id, item.quantity, 'Subtraction');
        }
      }

      // Create initial payment row if user entered a paid amount
      if (paid > 0) {
        await tx.salePayment.create({
          data: {
            saleId:      sale.id,
            amount:      paid.toFixed(2),
            paymentType,
            date,
            notes:       null,
          },
        });
      }

      newId = sale.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save sale.';
    return { error: msg };
  }

  revalidatePath('/sales');
  revalidatePath('/products');
  for (const id of uniqueProductIds) {
    revalidatePath(`/products/${id}`);
  }

  return { success: true, id: newId! };
}

// ── Update sale ───────────────────────────────────────────────────────────────
// Implemented in Step 6.

export async function updateSale(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Update not yet implemented — coming in Step 6.' };
}

// ── Add payment ───────────────────────────────────────────────────────────────
// Implemented in Step 4.

export async function addSalePayment(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  return { error: 'Payments not yet implemented — coming in Step 4.' };
}

// ── Delete sale ───────────────────────────────────────────────────────────────
// A sale is stock-OUTBOUND: deleting it returns goods to the warehouse.
// Received sales: ADD stock back per line (undoes the original Subtraction).
// Pending/Ordered: soft-delete only (no stock was moved).

export async function deleteSale(id: number): Promise<ActionResult> {
  const denied = await requirePermission();
  if (denied) return { error: denied };

  const sale = await db.sale.findFirst({
    where:  { id, deletedAt: null },
    select: {
      status:      true,
      reference:   true,
      warehouseId: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!sale) return { error: 'Sale not found.' };

  if (sale.status === 'Received') {
    try {
      await db.$transaction(async (tx) => {
        // Deleting a Received sale means sold goods return to inventory.
        for (const item of sale.items) {
          await applyStockAdjustment(tx, item.productId, sale.warehouseId, item.quantity, 'Addition');
        }
        await tx.sale.update({ where: { id }, data: { deletedAt: new Date() } });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reverse stock.';
      return { error: `Cannot delete: ${msg}` };
    }
  } else {
    await db.sale.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  revalidatePath('/sales');
  return { success: true };
}
