import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import SaleForm from '../../SaleForm';

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const [sale, warehouses, customers, units] = await Promise.all([
    db.sale.findFirst({
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
    db.customer.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    db.unit.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!sale) notFound();

  // Current warehouse stock for each product in the sale (for the stock chip display)
  const productIds = sale.items.map((i) => i.productId);
  const stocks = productIds.length > 0
    ? await db.productStock.findMany({
        where:  { productId: { in: productIds }, warehouseId: sale.warehouseId },
        select: { productId: true, quantity: true },
      })
    : [];
  const stockMap = new Map(stocks.map((s) => [s.productId, s.quantity]));

  const initial = {
    id:           sale.id,
    date:         sale.date.toISOString().slice(0, 10),
    warehouseId:  sale.warehouseId,
    customerId:   sale.customerId,
    status:       sale.status as 'Received' | 'Ordered' | 'Pending',
    orderTaxPct:  Number(sale.orderTax),
    flatDiscount: Number(sale.discount),
    shipping:     Number(sale.shipping),
    paymentType:  sale.paymentType,
    paidAmount:   Number(sale.paid),
    notes:        sale.notes ?? '',
    items: sale.items.map((item) => ({
      productId:    item.productId,
      name:         item.product.name,
      code:         item.product.code,
      productUnit:  item.product.productUnit,
      currentStock: stockMap.get(item.productId) ?? 0,
      netUnitPrice: Number(item.netUnitPrice),
      quantity:     item.quantity,
      discountType: item.discountType as 'Fixed' | 'Percentage',
      discount:     Number(item.discount),
      taxType:      item.taxType as 'Inclusive' | 'Exclusive',
      orderTax:     Number(item.orderTax),
      saleUnit:     item.saleUnit,
    })),
  };

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Edit Sale</h1>
        <Link href={`/sales/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <SaleForm
        warehouses={warehouses}
        customers={customers}
        units={units}
        defaultCustomerId={sale.customerId}
        initial={initial}
      />
    </>
  );
}
