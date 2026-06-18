import { db } from '@/lib/db';
import PosScreen from './PosScreen';

export type PosProduct = {
  id:          number;
  name:        string;
  code:        string;
  price:       number;
  stock:       number;
  categoryId:  number;
  brandId:     number;
  productUnit: string;
  image:       string | null;
};

function parseFirstImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { const a = JSON.parse(raw); return Array.isArray(a) && a[0] ? a[0] : null; }
  catch { return null; }
}

export type PosCategory  = { id: number; name: string };
export type PosBrand     = { id: number; name: string };
export type PosWarehouse = { id: number; name: string };
export type PosCustomer  = { id: number; name: string; isDefault: boolean };

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ wh?: string }>;
}) {
  const sp = await searchParams;

  const warehouses = await db.warehouse.findMany({
    where:   { deletedAt: null },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const whIdRaw     = parseInt(sp.wh ?? '', 10);
  const selectedWhId =
    !Number.isNaN(whIdRaw) && warehouses.some((w) => w.id === whIdRaw)
      ? whIdRaw
      : (warehouses[0]?.id ?? null);

  const customers = await db.customer.findMany({
    where:   { deletedAt: null },
    select:  { id: true, name: true, isDefault: true },
    orderBy: { name: 'asc' },
  });

  if (selectedWhId === null) {
    return (
      <PosScreen
        warehouses={warehouses}
        customers={customers}
        categories={[]}
        brands={[]}
        products={[]}
        selectedWarehouseId={null}
      />
    );
  }

  const stockRows = await db.productStock.findMany({
    where: {
      warehouseId: selectedWhId,
      product:     { deletedAt: null },
    },
    select: {
      quantity: true,
      product: {
        select: {
          id:          true,
          name:        true,
          code:        true,
          price:       true,
          productUnit: true,
          categoryId:  true,
          brandId:     true,
          images:      true,
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
  });

  const products: PosProduct[] = stockRows
    .filter((s) => s.quantity > 0)
    .map((s) => ({
      id:          s.product.id,
      name:        s.product.name,
      code:        s.product.code,
      price:       Number(s.product.price),
      stock:       s.quantity,
      categoryId:  s.product.categoryId,
      brandId:     s.product.brandId,
      productUnit: s.product.productUnit,
      image:       parseFirstImage(s.product.images),
    }));

  const catIds   = [...new Set(products.map((p) => p.categoryId))];
  const brandIds = [...new Set(products.map((p) => p.brandId))];

  const [categories, brands] = await Promise.all([
    db.category.findMany({
      where:   { id: { in: catIds }, deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.brand.findMany({
      where:   { id: { in: brandIds }, deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <PosScreen
      warehouses={warehouses}
      customers={customers}
      categories={categories}
      brands={brands}
      products={products}
      selectedWarehouseId={selectedWhId}
    />
  );
}
