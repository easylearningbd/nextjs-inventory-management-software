import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import CategoriesClient from './CategoriesClient';

const PER_OPTIONS = [10, 25, 50];

export default async function ProductCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.CategoryWhereInput = {
    deletedAt: null,
    ...(q && { name: { contains: q } }),
  };

  const [total, categories] = await Promise.all([
    db.category.count({ where }),
    db.category.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, name: true, logo: true, createdAt: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from       = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to         = Math.min(page * perPage, total);

  return (
    <CategoriesClient
      categories={categories}
      total={total}
      page={page}
      perPage={perPage}
      totalPages={totalPages}
      from={from}
      to={to}
      q={q}
    />
  );
}
