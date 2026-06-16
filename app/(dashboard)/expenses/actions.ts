'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { can } from '@/lib/can';
import { db } from '@/lib/db';

// ── Schema ────────────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  date:               z.string().min(1, 'Date is required.'),
  title:              z.string().min(1, 'Title is required.').max(255, 'Title is too long.'),
  warehouseId:        z.coerce.number().int().positive('Warehouse is required.'),
  expenseCategoryId:  z.coerce.number().int().positive('Expense category is required.'),
  amount:             z.string()
    .min(1, 'Amount is required.')
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()) && parseFloat(v.trim()) > 0, {
      message: 'Amount must be a positive number.',
    }),
  details: z.string().optional(),
});

export type ExpenseState = { error?: string; success?: boolean };

// ── Create ────────────────────────────────────────────────────────────────────

export async function createExpense(
  _prev: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const denied = await can('Manage Expenses');
  if (denied) return { error: denied };

  const raw = {
    date:              formData.get('date'),
    title:             (formData.get('title') as string)?.trim(),
    warehouseId:       formData.get('warehouseId'),
    expenseCategoryId: formData.get('expenseCategoryId'),
    amount:            (formData.get('amount') as string)?.trim(),
    details:           (formData.get('details') as string)?.trim() || undefined,
  };

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { date, title, warehouseId, expenseCategoryId, amount, details } = parsed.data;

  // Re-read ids server-side
  const [warehouse, category] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.expenseCategory.findFirst({ where: { id: expenseCategoryId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!category)  return { error: 'Selected expense category not found.' };

  // Race-safe reference: create with TEMP, then update to EX_xxxx
  const expense = await db.$transaction(async (tx) => {
    const temp = `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const created = await tx.expense.create({
      data: {
        reference:         temp,
        date:              new Date(date),
        title,
        warehouseId:       warehouse.id,
        expenseCategoryId: category.id,
        amount,
        details:           details || null,
      },
    });
    const ref = `EX_${String(created.id).padStart(4, '0')}`;
    return tx.expense.update({
      where: { id: created.id },
      data:  { reference: ref },
    });
  });

  revalidatePath('/expenses');
  redirect(`/expenses`);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateExpense(
  id: number,
  _prev: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const denied = await can('Manage Expenses');
  if (denied) return { error: denied };

  const existing = await db.expense.findFirst({
    where:  { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { error: 'Expense not found.' };

  const raw = {
    date:              formData.get('date'),
    title:             (formData.get('title') as string)?.trim(),
    warehouseId:       formData.get('warehouseId'),
    expenseCategoryId: formData.get('expenseCategoryId'),
    amount:            (formData.get('amount') as string)?.trim(),
    details:           (formData.get('details') as string)?.trim() || undefined,
  };

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation failed.' };
  }

  const { date, title, warehouseId, expenseCategoryId, amount, details } = parsed.data;

  // Re-read ids server-side
  const [warehouse, category] = await Promise.all([
    db.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true } }),
    db.expenseCategory.findFirst({ where: { id: expenseCategoryId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!warehouse) return { error: 'Selected warehouse not found.' };
  if (!category)  return { error: 'Selected expense category not found.' };

  await db.expense.update({
    where: { id },
    data: {
      date:              new Date(date),
      title,
      warehouseId:       warehouse.id,
      expenseCategoryId: category.id,
      amount,
      details:           details || null,
    },
  });

  revalidatePath('/expenses');
  redirect('/expenses');
}

// ── Delete (soft) ─────────────────────────────────────────────────────────────

export async function deleteExpense(id: number): Promise<ExpenseState> {
  const denied = await can('Manage Expenses');
  if (denied) return { error: denied };

  const existing = await db.expense.findFirst({
    where:  { id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { error: 'Expense not found.' };

  await db.expense.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath('/expenses');
  return { success: true };
}
