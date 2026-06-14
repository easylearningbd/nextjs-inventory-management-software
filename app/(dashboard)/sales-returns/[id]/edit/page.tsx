import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import SaleReturnForm from '../../SaleReturnForm';
import type { InitialValues } from '../../SaleReturnForm';

export default async function EditSaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const ret = await db.saleReturn.findFirst({
    where: { id, deletedAt: null },
    include: {
      sale:  { select: { id: true, reference: true } },
      items: {
        include: { product: { select: { name: true, code: true, productUnit: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!ret) notFound();

  const productIds = ret.items.map((i) => i.productId);

  const [stockRows, units] = await Promise.all([
    productIds.length > 0
      ? db.productStock.findMany({
          where:  { productId: { in: productIds }, warehouseId: ret.warehouseId },
          select: { productId: true, quantity: true },
        })
      : Promise.resolve([]),
    db.unit.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const stockMap = new Map(stockRows.map((s) => [s.productId, s.quantity]));

  // Load original sale's qty caps — qty cap still applies on edit
  let saleQtyMap = new Map<number, number>();
  if (ret.saleId) {
    const originalSale = await db.sale.findFirst({
      where:  { id: ret.saleId, deletedAt: null },
      select: { items: { select: { productId: true, quantity: true } } },
    });
    if (originalSale) {
      saleQtyMap = new Map(originalSale.items.map((i) => [i.productId, i.quantity]));
    }
  }

  const initial: InitialValues = {
    id:            ret.id,
    date:          ret.date.toISOString().slice(0, 10),
    warehouseId:   ret.warehouseId,
    customerId:    ret.customerId,
    saleId:        ret.saleId,
    saleReference: ret.sale?.reference ?? '',
    status:        ret.status as 'Pending' | 'Received' | 'Completed',
    orderTaxPct:   Number(ret.orderTax),
    flatDiscount:  Number(ret.discount),
    shipping:      Number(ret.shipping),
    notes:         ret.notes ?? '',
    items: ret.items.map((item) => ({
      productId:    item.productId,
      name:         item.product.name,
      code:         item.product.code,
      productUnit:  item.product.productUnit,
      currentStock: stockMap.get(item.productId) ?? 0,
      // Cap by original sale qty if available; otherwise the existing return qty is the ceiling
      maxQty:       saleQtyMap.get(item.productId) ?? item.quantity,
      netUnitPrice: Number(item.netUnitPrice),
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
        <h1 className="gg-page-title">Edit Sale Return</h1>
        <Link href={`/sales-returns/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <SaleReturnForm units={units} initial={initial} />
    </>
  );
}
