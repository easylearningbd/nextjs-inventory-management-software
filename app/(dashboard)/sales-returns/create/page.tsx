import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import SaleReturnForm from '../SaleReturnForm';
import type { InitialValues } from '../SaleReturnForm';

export default async function CreateSaleReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ saleId?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const sp        = await searchParams;
  const saleIdNum = parseInt(sp.saleId ?? '', 10);

  // No saleId — show a picker prompt instead of silently redirecting
  if (!saleIdNum) {
    return (
      <>
        <div className="page-head">
          <h1 className="gg-page-title">Create Sale Return</h1>
          <Link href="/sales-returns" className="gg-btn gg-btn--secondary gg-btn--sm">
            <ArrowLeft size={16} /> Back
          </Link>
        </div>

        <div className="gg-card gg-card-pad" style={{ textAlign: 'center', padding: 'var(--sp-12) var(--sp-6)' }}>
          <ShoppingCart size={48} style={{ color: 'var(--gray-300)', marginBottom: 'var(--sp-4)' }} />
          <h2 style={{ margin: '0 0 var(--sp-2)', fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
            Select a Sale First
          </h2>
          <p style={{ margin: '0 0 var(--sp-6)', color: 'var(--gray-500)', fontSize: 14, maxWidth: 380, marginInline: 'auto' }}>
            A sale return must be linked to an existing sale. Go to the Sales list,
            open the row menu for the sale you want to return, and choose
            &ldquo;Create Sale Return&rdquo;.
          </p>
          <Link href="/sales" className="gg-btn gg-btn--primary">
            <ShoppingCart size={16} /> Go to Sales
          </Link>
        </div>
      </>
    );
  }

  const sale = await db.sale.findFirst({
    where: { id: saleIdNum, deletedAt: null },
    select: {
      id:          true,
      reference:   true,
      warehouseId: true,
      customerId:  true,
      orderTax:    true,
      discount:    true,
      shipping:    true,
      items: {
        select: {
          productId:    true,
          netUnitPrice: true,
          quantity:     true,
          discountType: true,
          discount:     true,
          taxType:      true,
          orderTax:     true,
          saleUnit:     true,
          product: {
            select: { name: true, code: true, productUnit: true },
          },
        },
      },
    },
  });

  if (!sale || sale.items.length === 0) redirect('/sales');

  const productIds = sale.items.map((i) => i.productId);

  const [stockRows, units] = await Promise.all([
    db.productStock.findMany({
      where:  { productId: { in: productIds }, warehouseId: sale.warehouseId },
      select: { productId: true, quantity: true },
    }),
    db.unit.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const stockMap = new Map(stockRows.map((s) => [s.productId, s.quantity]));
  const today    = new Date().toISOString().slice(0, 10);

  const initial: InitialValues = {
    id:            0,
    date:          today,
    warehouseId:   sale.warehouseId,
    customerId:    sale.customerId,
    saleId:        sale.id,
    saleReference: sale.reference,
    status:        'Pending',
    orderTaxPct:   Number(sale.orderTax),
    flatDiscount:  Number(sale.discount),
    shipping:      Number(sale.shipping),
    notes:         '',
    items: sale.items.map((item) => ({
      productId:    item.productId,
      name:         item.product.name,
      code:         item.product.code,
      productUnit:  item.product.productUnit,
      currentStock: stockMap.get(item.productId) ?? 0,
      maxQty:       item.quantity,
      netUnitPrice: Number(item.netUnitPrice),
      quantity:     item.quantity,
      discountType: item.discountType as 'Fixed' | 'Percentage',
      discount:     Number(item.discount),
      taxType:      item.taxType as 'Inclusive' | 'Exclusive',
      orderTax:     Number(item.orderTax),
      returnUnit:   item.saleUnit,
    })),
  };

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Create Sale Return</h1>
        <Link href={`/sales/${sale.id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back to Sale
        </Link>
      </div>

      <SaleReturnForm units={units} initial={initial} />
    </>
  );
}
