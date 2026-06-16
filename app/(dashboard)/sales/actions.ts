'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/can';
import { db } from '@/lib/db';
import { applyStockAdjustment } from '@/lib/stockService';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

export type ActionResult = { error?: string; success?: boolean; id?: number };


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

const STATUSES  = ['Received', 'Ordered', 'Pending']          as const;
const PAY_TYPES = ['Cash', 'Card', 'Cheque', 'Bank Transfer'] as const;
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
  const denied = await can('Manage Sale');
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
    select: { id: true, name: true },
  });
  if (activeProducts.length !== uniqueProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }
  const productNameMap = new Map(activeProducts.map((p) => [p.id, p.name]));

  // 6. Pre-validate warehouse stock before entering the transaction so the
  // user gets a product-specific error message (not a raw DB error string).
  // The $transaction still guards against race conditions, but this gives
  // a clear, named toast when the cart obviously cannot be fulfilled.
  if (status === 'Received') {
    const stockRows = await db.productStock.findMany({
      where:  { warehouseId: warehouse.id, productId: { in: uniqueProductIds } },
      select: { productId: true, quantity: true },
    });
    const stockMap = new Map(stockRows.map((s) => [s.productId, s.quantity]));

    for (const item of items) {
      const available = stockMap.get(item.productId) ?? 0;
      if (item.quantity > available) {
        const name = productNameMap.get(item.productId) ?? `Product #${item.productId}`;
        return {
          error: `Insufficient stock for "${name}": ${available} in warehouse, ${item.quantity} requested.`,
        };
      }
    }
  }

  // 7. Recompute totals server-side — never trust client values
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

export async function updateSale(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission
  const denied = await can('Manage Sale');
  if (denied) return { error: denied };

  // 2. Parse header fields
  const saleIdRaw  = formData.get('saleId')      as string;
  const dateStr    = (formData.get('date')        as string)?.trim();
  const custIdRaw  = formData.get('customerId')   as string;
  const statusRaw  = (formData.get('status')      as string)?.trim();
  const payTypeRaw = (formData.get('paymentType') as string)?.trim();
  const notes      = (formData.get('notes')       as string)?.trim() || null;

  const saleId     = parseInt(saleIdRaw, 10);
  const customerId = parseInt(custIdRaw, 10);

  if (isNaN(saleId) || saleId <= 0)                                  return { error: 'Invalid sale.' };
  if (!dateStr)                                                        return { error: 'Date is required.' };
  if (isNaN(customerId) || customerId <= 0)                           return { error: 'Customer is required.' };
  if (!STATUSES.includes(statusRaw as typeof STATUSES[number]))      return { error: 'Invalid status.' };
  if (!PAY_TYPES.includes(payTypeRaw as typeof PAY_TYPES[number]))   return { error: 'Invalid payment type.' };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  const newStatus   = statusRaw  as typeof STATUSES[number];
  const paymentType = payTypeRaw as typeof PAY_TYPES[number];

  // 3. Order-level numbers
  const orderTaxPct  = parseFloat(formData.get('orderTaxPct')  as string) || 0;
  const flatDiscount = parseFloat(formData.get('flatDiscount') as string) || 0;
  const shipping     = parseFloat(formData.get('shipping')     as string) || 0;

  if (orderTaxPct  < 0 || orderTaxPct  > 100) return { error: 'Order tax must be 0–100%.' };
  if (flatDiscount < 0)                        return { error: 'Discount cannot be negative.' };
  if (shipping     < 0)                        return { error: 'Shipping cannot be negative.' };

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
  const newItems = itemsResult.data;

  // 5. Re-read sale + customer + products server-side
  const [sale, customer] = await Promise.all([
    db.sale.findFirst({
      where:  { id: saleId, deletedAt: null },
      select: {
        id:          true,
        warehouseId: true,
        status:      true,
        items:       { select: { productId: true, quantity: true } },
      },
    }),
    db.customer.findFirst({
      where:  { id: customerId, deletedAt: null },
      select: { id: true },
    }),
  ]);

  if (!sale)     return { error: 'Sale not found.' };
  if (!customer) return { error: 'Selected customer not found.' };

  const { warehouseId, status: oldStatus, items: oldItems } = sale;

  const uniqueNewProductIds = [...new Set(newItems.map((i) => i.productId))];
  const activeProducts      = await db.product.findMany({
    where:  { id: { in: uniqueNewProductIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  if (activeProducts.length !== uniqueNewProductIds.length) {
    return { error: 'One or more selected products could not be found or have been deleted.' };
  }
  const productNameMap = new Map(activeProducts.map((p) => [p.id, p.name]));

  // 6. Pre-validate stock using the net delta per product.
  // Old qty restores stock; new qty consumes stock. Net delta = newQty - oldQty
  // (counting only when that status moves stock).
  const oldMap = new Map(oldItems.map((i) => [i.productId, i.quantity]));
  const newMap = new Map(newItems.map((i) => [i.productId, i.quantity]));

  const needsCheck: Array<{ productId: number; delta: number }> = [];

  const allProductIds = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const productId of allProductIds) {
    const oldQty = oldStatus === 'Received' ? (oldMap.get(productId) ?? 0) : 0;
    const newQty = newStatus === 'Received' ? (newMap.get(productId) ?? 0) : 0;
    const delta  = newQty - oldQty;
    if (delta > 0) needsCheck.push({ productId, delta });
  }

  if (needsCheck.length > 0) {
    const stockRows = await db.productStock.findMany({
      where:  { warehouseId, productId: { in: needsCheck.map((c) => c.productId) } },
      select: { productId: true, quantity: true },
    });
    const stockMap = new Map(stockRows.map((s) => [s.productId, s.quantity]));

    for (const { productId, delta } of needsCheck) {
      const available = stockMap.get(productId) ?? 0;
      if (delta > available) {
        const name = productNameMap.get(productId) ?? `Product #${productId}`;
        return {
          error: `Insufficient stock for "${name}": ${available} in warehouse, ${delta} additional units needed.`,
        };
      }
    }
  }

  // 7. Recompute totals server-side
  const lineInputs = newItems.map((item) => ({
    netUnitCost:  item.netUnitPrice,
    quantity:     item.quantity,
    discountType: item.discountType,
    discount:     item.discount,
    taxType:      item.taxType,
    orderTax:     item.orderTax,
  }));

  const newGrandTotal = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });

  // 8. Read existing paid from SalePayment records — form's paidAmount is ignored
  // in edit mode because payments are managed through /sales/:id/payments.
  const paymentAgg = await db.salePayment.aggregate({
    where: { saleId },
    _sum:  { amount: true },
  });
  const existingPaid  = Math.min(Number(paymentAgg._sum.amount ?? 0), newGrandTotal);
  const newDue        = Math.max(0, newGrandTotal - existingPaid);
  const paymentStatus = derivePaymentStatus(existingPaid, newGrandTotal);

  // 9. Atomic transaction: stock reconciliation → replace items → update header
  const allAffectedProductIds = new Set([
    ...oldItems.map((i) => i.productId),
    ...uniqueNewProductIds,
  ]);

  try {
    await db.$transaction(async (tx) => {
      // ── Stock reconciliation (difference method) ──────────────────────────
      if (oldStatus === 'Received' && newStatus === 'Received') {
        for (const productId of allProductIds) {
          const oldQty = oldMap.get(productId) ?? 0;
          const newQty = newMap.get(productId) ?? 0;
          const delta  = newQty - oldQty;
          if (delta > 0) {
            await applyStockAdjustment(tx, productId, warehouseId, delta, 'Subtraction');
          } else if (delta < 0) {
            await applyStockAdjustment(tx, productId, warehouseId, -delta, 'Addition');
          }
        }
      } else if (oldStatus === 'Received') {
        // Transitioning away from Received: return all old stock
        for (const item of oldItems) {
          await applyStockAdjustment(tx, item.productId, warehouseId, item.quantity, 'Addition');
        }
      } else if (newStatus === 'Received') {
        // Transitioning into Received: consume all new stock
        for (const item of newItems) {
          await applyStockAdjustment(tx, item.productId, warehouseId, item.quantity, 'Subtraction');
        }
      }

      // ── Replace line items ────────────────────────────────────────────────
      await tx.saleItem.deleteMany({ where: { saleId } });

      for (let idx = 0; idx < newItems.length; idx++) {
        const item = newItems[idx];
        const sub  = lineSubtotal(lineInputs[idx]);
        await tx.saleItem.create({
          data: {
            saleId,
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
      }

      // ── Update sale header ────────────────────────────────────────────────
      await tx.sale.update({
        where: { id: saleId },
        data: {
          customerId,
          date,
          status:        newStatus,
          orderTax:      orderTaxPct.toFixed(2),
          discount:      flatDiscount.toFixed(2),
          shipping:      shipping.toFixed(2),
          grandTotal:    newGrandTotal.toFixed(2),
          paid:          existingPaid.toFixed(2),
          due:           newDue.toFixed(2),
          paymentStatus,
          paymentType,
          notes:         notes ?? undefined,
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update sale.';
    return { error: msg };
  }

  revalidatePath('/sales');
  revalidatePath(`/sales/${saleId}`);
  revalidatePath('/products');
  for (const id of allAffectedProductIds) {
    revalidatePath(`/products/${id}`);
  }

  return { success: true, id: saleId };
}

// ── Add payment ───────────────────────────────────────────────────────────────

export async function addSalePayment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Permission
  const denied = await can('Manage Sale');
  if (denied) return { error: denied };

  // 2. Parse
  const saleIdRaw  = formData.get('saleId')      as string;
  const dateStr    = (formData.get('date')        as string)?.trim();
  const amountRaw  = formData.get('amount')       as string;
  const payTypeRaw = (formData.get('paymentType') as string)?.trim();
  const notes      = (formData.get('notes')       as string)?.trim() || null;

  const saleId = parseInt(saleIdRaw, 10);
  const amount = parseFloat(amountRaw);

  if (isNaN(saleId) || saleId <= 0)                                  return { error: 'Invalid sale.' };
  if (!dateStr)                                                        return { error: 'Date is required.' };
  if (isNaN(amount) || amount <= 0)                                   return { error: 'Amount must be greater than zero.' };
  if (!PAY_TYPES.includes(payTypeRaw as typeof PAY_TYPES[number]))   return { error: 'Invalid payment type.' };

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { error: 'Invalid date.' };

  // 3. Re-read sale server-side
  const sale = await db.sale.findFirst({
    where:  { id: saleId, deletedAt: null },
    select: { id: true, grandTotal: true },
  });
  if (!sale) return { error: 'Sale not found.' };

  const grandTotal = Number(sale.grandTotal);

  // 4. Transaction: insert payment → aggregate new total → update Sale header
  try {
    await db.$transaction(async (tx) => {
      await tx.salePayment.create({
        data: {
          saleId,
          amount:      amount.toFixed(2),
          paymentType: payTypeRaw as typeof PAY_TYPES[number],
          date,
          notes,
        },
      });

      const agg = await tx.salePayment.aggregate({
        where: { saleId },
        _sum:  { amount: true },
      });

      const paid          = Math.min(Number(agg._sum.amount ?? 0), grandTotal);
      const due           = Math.max(0, grandTotal - paid);
      const paymentStatus = derivePaymentStatus(paid, grandTotal);

      await tx.sale.update({
        where: { id: saleId },
        data:  { paid: paid.toFixed(2), due: due.toFixed(2), paymentStatus },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save payment.';
    return { error: msg };
  }

  revalidatePath(`/sales/${saleId}/payments`);
  revalidatePath('/sales');
  return { success: true };
}

// ── Delete sale ───────────────────────────────────────────────────────────────
// A sale is stock-OUTBOUND: deleting it returns goods to the warehouse.
// Received sales: ADD stock back per line (undoes the original Subtraction).
// Pending/Ordered: soft-delete only (no stock was moved).

export async function deleteSale(id: number): Promise<ActionResult> {
  const denied = await can('Manage Sale');
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
