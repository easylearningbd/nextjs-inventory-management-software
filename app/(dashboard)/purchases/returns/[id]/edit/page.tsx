import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import ReturnForm from '../../ReturnForm';

export default async function EditPurchaseReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const [ret, warehouses, suppliers, units] = await Promise.all([
    db.purchaseReturn.findFirst({
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

  if (!ret) notFound();

  // Current stock for each product in the return's warehouse (display reference only)
  const productIds = ret.items.map((i) => i.productId);
  const stocks = productIds.length > 0
    ? await db.productStock.findMany({
        where:  { productId: { in: productIds }, warehouseId: ret.warehouseId },
        select: { productId: true, quantity: true },
      })
    : [];
  const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

  const initial = {
    id:           ret.id,
    date:         ret.date.toISOString().slice(0, 10),
    warehouseId:  ret.warehouseId,
    supplierId:   ret.supplierId,
    status:       ret.status as 'Received' | 'Ordered' | 'Pending',
    orderTaxPct:  Number(ret.orderTax),
    flatDiscount: Number(ret.discount),
    shipping:     Number(ret.shipping),
    notes:        ret.notes ?? '',
    items: ret.items.map((item) => ({
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
      returnUnit:   item.returnUnit,
    })),
  };

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Edit Purchase Return</h1>
        <Link href={`/purchases/returns/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <ReturnForm
        warehouses={warehouses}
        suppliers={suppliers}
        units={units}
        initial={initial}
      />
    </>
  );
}
