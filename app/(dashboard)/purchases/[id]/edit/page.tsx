import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import PurchaseForm from '../../PurchaseForm';

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const [purchase, warehouses, suppliers, units] = await Promise.all([
    db.purchase.findFirst({
      where:   { id, deletedAt: null },
      include: {
        items: {
          include: { product: { select: { name: true, code: true, productUnit: true } } },
          orderBy: { id: 'asc' },
        },
      },
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

  if (!purchase) notFound();

  // Current stock for each product in the purchase's warehouse (display reference only)
  const productIds = purchase.items.map((i) => i.productId);
  const stocks = productIds.length > 0
    ? await db.productStock.findMany({
        where:  { productId: { in: productIds }, warehouseId: purchase.warehouseId },
        select: { productId: true, quantity: true },
      })
    : [];
  const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

  const initial = {
    id:           purchase.id,
    date:         purchase.date.toISOString().slice(0, 10),
    warehouseId:  purchase.warehouseId,
    supplierId:   purchase.supplierId,
    status:       purchase.status as 'Received' | 'Ordered' | 'Pending',
    orderTaxPct:  Number(purchase.orderTax),
    flatDiscount: Number(purchase.discount),
    shipping:     Number(purchase.shipping),
    notes:        purchase.notes ?? '',
    items: purchase.items.map((item) => ({
      productId:    item.productId,
      name:         item.product.name,
      code:         item.product.code,
      productUnit:  item.product.productUnit,
      currentStock: stockMap.get(item.productId) ?? 0,
      netUnitCost:  Number(item.netUnitCost),
      quantity:     item.quantity,
      discountType: item.discountType as 'Fixed' | 'Percentage',
      discount:     Number(item.discount),
      taxType:      item.taxType as 'Inclusive' | 'Exclusive',
      orderTax:     Number(item.orderTax),
      purchaseUnit: item.purchaseUnit,
    })),
  };

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Edit Purchase</h1>
        <Link href={`/purchases/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <PurchaseForm
        warehouses={warehouses}
        suppliers={suppliers}
        units={units}
        initial={initial}
      />
    </>
  );
}
