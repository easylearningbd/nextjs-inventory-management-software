import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Warehouse } from 'lucide-react';
import { db } from '@/lib/db';
import PrintTrigger from './PrintTrigger';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function lineDiscountAmt(cost: number, qty: number, discountType: string, discount: number) {
  const gross = cost * qty;
  return discountType === 'Percentage' ? gross * discount / 100 : discount;
}

function lineTaxAmt(
  cost: number, qty: number,
  discountType: string, discount: number,
  taxType: string, orderTax: number,
) {
  if (taxType !== 'Exclusive') return 0;
  const disc = lineDiscountAmt(cost, qty, discountType, discount);
  return (cost * qty - disc) * orderTax / 100;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Completed: 'gg-badge gg-badge--success',
    Sent:      'gg-badge gg-badge--info',
    Pending:   'gg-badge gg-badge--warning',
  };
  return <span className={map[status] ?? 'gg-badge'}>{status}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function TransferPDFPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const transfer = await db.transfer.findFirst({
    where: { id, deletedAt: null },
    include: {
      fromWarehouse: { select: { name: true } },
      toWarehouse:   { select: { name: true } },
      items: {
        include: { product: { select: { name: true, code: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!transfer) notFound();

  const orderTaxPct  = Number(transfer.orderTax);
  const subtotalsSum = transfer.items.reduce((s, i) => s + Number(i.subtotal), 0);
  const orderTaxAmt  = Math.round(subtotalsSum * orderTaxPct) / 100;
  const flatDiscount = Number(transfer.discount);
  const shipping     = Number(transfer.shipping);
  const grandTotal   = Number(transfer.grandTotal);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)', padding: 'var(--sp-6)' }}>
      <PrintTrigger />

      {/* Toolbar — hidden when printing */}
      <div className="page-head pur-noprint" style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 className="gg-page-title">Transfer PDF</h1>
        <Link href={`/transfers/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── Centred document title ────────────────────────────────────────── */}
        <div className="pur-pd-title">
          Transfer Details&nbsp;:&nbsp;
          <span className="gg-chip-code gg-num">{transfer.reference}</span>
        </div>

        {/* ── 3-column info grid ────────────────────────────────────────────── */}
        <div className="pur-info-grid">

          <div className="pur-info-panel">
            <div className="pur-band">From Warehouse</div>
            <div className="pur-info-body">
              <div className="pur-info-row">
                <Warehouse size={17} />
                <span style={{ fontWeight: 600 }}>{transfer.fromWarehouse.name}</span>
              </div>
            </div>
          </div>

          <div className="pur-info-panel">
            <div className="pur-band">To Warehouse</div>
            <div className="pur-info-body">
              <div className="pur-info-row">
                <Warehouse size={17} />
                <span style={{ fontWeight: 600 }}>{transfer.toWarehouse.name}</span>
              </div>
            </div>
          </div>

          <div className="pur-info-panel">
            <div className="pur-band">Transfer Info</div>
            <div className="pur-info-body">
              <div className="pur-info-line">
                <span className="k">Reference :</span>
                <span className="v gg-num">{transfer.reference}</span>
              </div>
              <div className="pur-info-line" style={{ alignItems: 'center' }}>
                <span className="k">Status :</span>
                <StatusBadge status={transfer.status} />
              </div>
              <div className="pur-info-line">
                <span className="k">Date :</span>
                <span className="v gg-num">{fmtDate(transfer.date)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Order Summary ──────────────────────────────────────────────────── */}
        <div className="pur-band" style={{ marginBottom: 'var(--sp-5)' }}>Order Summary</div>

        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Net Unit Cost</th>
                <th>Quantity</th>
                <th>Discount</th>
                <th>Tax</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((item) => {
                const cost = Number(item.netUnitCost);
                const disc = lineDiscountAmt(cost, item.quantity, item.discountType, Number(item.discount));
                const tax  = lineTaxAmt(cost, item.quantity, item.discountType, Number(item.discount), item.taxType, Number(item.orderTax));
                return (
                  <tr key={item.id}>
                    <td className="gg-td-strong">
                      {item.product.code} ({item.product.name})
                    </td>
                    <td className="gg-num">{fmt(cost)}</td>
                    <td className="gg-num">{item.quantity}&nbsp;{item.productUnit}</td>
                    <td className="gg-num">{fmt(disc)}</td>
                    <td className="gg-num">{fmt(tax)}</td>
                    <td className="gg-num gg-td-strong" style={{ textAlign: 'right' }}>
                      {fmt(Number(item.subtotal))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals box ────────────────────────────────────────────────────── */}
        <div className="pur-totals-box">
          <div className="pur-totals-row">
            <span className="ptr-lbl">Order Tax</span>
            <span className="ptr-val gg-num">
              {fmt(orderTaxAmt)}&nbsp;({orderTaxPct.toFixed(2)}%)
            </span>
          </div>
          <div className="pur-totals-row">
            <span className="ptr-lbl">Discount</span>
            <span className="ptr-val gg-num">{fmt(flatDiscount)}</span>
          </div>
          <div className="pur-totals-row">
            <span className="ptr-lbl">Shipping</span>
            <span className="ptr-val gg-num">{fmt(shipping)}</span>
          </div>
          <div className="pur-totals-row ptr-grand">
            <span className="ptr-lbl">Grand Total</span>
            <span className="ptr-val gg-num">{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────────── */}
        {transfer.notes && (
          <div style={{
            marginTop: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)',
            background: 'var(--gray-50)', borderRadius: 'var(--r-md)',
            border: '1px solid var(--gray-200)',
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>Notes</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>{transfer.notes}</p>
          </div>
        )}

      </div>
    </div>
  );
}
