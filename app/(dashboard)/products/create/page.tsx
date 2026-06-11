import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import ProductForm from '../ProductForm';
import { createProduct } from '../actions';

export default async function CreateProductPage() {
  const session = await auth();
  if (!session) redirect('/');
  const [categories, brands, warehouses, suppliers, units] = await Promise.all([
    db.category.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.brand.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.warehouse.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.supplier.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.unit.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <ProductForm
      action={createProduct}
      mode="create"
      categories={categories}
      brands={brands}
      warehouses={warehouses}
      suppliers={suppliers}
      units={units}
    />
  );
}
