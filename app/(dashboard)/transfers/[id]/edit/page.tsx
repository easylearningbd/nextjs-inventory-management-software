import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import TransferForm from '../../TransferForm';
import type { InitialValues } from '../../TransferForm';

export default async function EditTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const transfer = await db.transfer.findFirst({
    where: { id, deletedAt: null },
    include: {
      items: {
        include: { product: { select: { name: true, code: true, productUnit: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!transfer) notFound();

  const productIds = transfer.items.map((i) => i.productId);

  const [stockRows, warehouses, units] = await Promise.all([
    productIds.length > 0
      ? db.productStock.findMany({
          where:  { productId: { in: productIds }, warehouseId: transfer.fromWarehouseId },
          select: { productId: true, quantity: true },
        })
      : Promise.resolve([]),
    db.warehouse.findMany({
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

  const stockMap = new Map(stockRows.map((s) => [s.productId, s.quantity]));

  const initial: InitialValues = {
    id:              transfer.id,
    date:            transfer.date.toISOString().slice(0, 10),
    fromWarehouseId: transfer.fromWarehouseId,
    toWarehouseId:   transfer.toWarehouseId,
    status:          transfer.status as 'Pending' | 'Sent' | 'Completed',
    orderTaxPct:     Number(transfer.orderTax),
    flatDiscount:    Number(transfer.discount),
    shipping:        Number(transfer.shipping),
    notes:           transfer.notes ?? '',
    items: transfer.items.map((item) => ({
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
      transferUnit: item.productUnit,
    })),
  };

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Edit Transfer</h1>
        <Link href={`/transfers/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <TransferForm warehouses={warehouses} units={units} initial={initial} />
    </>
  );
}
