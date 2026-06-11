import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import ProductForm, { type ProductData } from '../../ProductForm';
import { updateProduct, type ProductFormState } from '../../actions';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  // Fetch product + every dropdown list in one round-trip.
  // Dropdowns are included so the form renders the same selects in edit mode.
  const [product, categories, brands, warehouses, suppliers, units] = await Promise.all([
    db.product.findFirst({
      where:  { id, deletedAt: null },
      select: {
        name:               true,
        code:               true,
        price:              true,
        categoryId:         true,
        brandId:            true,
        productUnit:        true,
        stockAlert:         true,
        orderTax:           true,
        taxType:            true,
        quantityLimitation: true,
        notes:              true,
        images:             true,
      },
    }),
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

  if (!product) notFound();

  // Prisma returns Decimal objects for price / orderTax.
  // Serialise them to strings so they cross the server → client boundary safely
  // and populate the number inputs via defaultValue.
  const productData: ProductData = {
    name:               product.name,
    code:               product.code,
    price:              product.price.toString(),
    categoryId:         product.categoryId,
    brandId:            product.brandId,
    productUnit:        product.productUnit,
    stockAlert:         product.stockAlert,
    orderTax:           product.orderTax?.toString() ?? null,
    taxType:            product.taxType,
    quantityLimitation: product.quantityLimitation,
    notes:              product.notes,
    images:             product.images,
  };

  // Bind the product id server-side so the client cannot change which record
  // is mutated.  The resulting bound signature matches ProductAction exactly.
  const action = updateProduct.bind(null, id) as (
    prev: ProductFormState,
    formData: FormData,
  ) => Promise<ProductFormState>;

  return (
    <ProductForm
      action={action}
      mode="edit"
      product={productData}
      categories={categories}
      brands={brands}
      warehouses={warehouses}
      suppliers={suppliers}
      units={units}
    />
  );
}
