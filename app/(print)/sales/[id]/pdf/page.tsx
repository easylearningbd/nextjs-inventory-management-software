import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Mail, Smartphone, MapPin } from 'lucide-react';
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

function lineDiscountAmt(netUnitPrice: number, qty: number, discountType: string, discount: number) {
  const gross = netUnitPrice * qty;
  return discountType === 'Percentage' ? gross * discount / 100 : discount;
}

function lineTaxAmt(netUnitPrice: number, qty: number, discountType: string, discount: number, taxType: string, orderTax: number) {
  if (taxType !== 'Exclusive') return 0;
  const disc = lineDiscountAmt(netUnitPrice, qty, discountType, discount);
  return (netUnitPrice * qty - disc) * orderTax / 100;
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, { bg: string; fg: string }> = {
    Received: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    Ordered:  { bg: 'var(--info-bg)',    fg: 'var(--info)' },
    Pending:  { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
  };
  const c = colours[status] ?? { bg: 'var(--gray-100)', fg: 'var(--gray-600)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 22, padding: '0 10px',
      borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const colours: Record<string, { bg: string; fg: string }> = {
    Paid:    { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    Partial: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
    Unpaid:  { bg: 'var(--danger-bg)',  fg: 'var(--danger)' },
  };
  const c = colours[status] ?? { bg: 'var(--gray-100)', fg: 'var(--gray-600)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 22, padding: '0 10px',
      borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SalePDFPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const sale = await db.sale.findFirst({
    where: { id, deletedAt: null },
    include: {
      customer: {
        select: { name: true, email: true, phoneNumber: true, country: true, city: true, address: true },
      },
      warehouse: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, code: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!sale) notFound();

  const orderTaxPct  = Number(sale.orderTax);
  const subtotalsSum = sale.items.reduce((s, i) => s + Number(i.subtotal), 0);
  const orderTaxAmt  = Math.round(subtotalsSum * orderTaxPct) / 100;
  const flatDiscount = Number(sale.discount);
  const shipping     = Number(sale.shipping);
  const grandTotal   = Number(sale.grandTotal);
  const paid         = Number(sale.paid);
  const due          = Number(sale.due);

  const cust        = sale.customer;
  const custAddress = [cust.address, cust.city, cust.country].filter(Boolean).join(', ') || '—';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--canvas)', padding: 'var(--sp-6)' }}>
      <PrintTrigger />

      {/* Toolbar — hidden when printing */}
      <div className="page-head pur-noprint" style={{ marginBottom: 'var(--sp-6)' }}>
        <h1 className="gg-page-title">Sale PDF</h1>
        <Link href={`/sales/${id}`} className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── Centred document title ─────────────────────────────────────── */}
        <div className="pur-pd-title">
          Sale Details&nbsp;:&nbsp;
          <span className="gg-chip-code gg-num">{sale.reference}</span>
        </div>

        {/* ── 3-column info grid ─────────────────────────────────────────── */}
        <div className="pur-info-grid">

          <div className="pur-info-panel">
            <div className="pur-band">Customer Info</div>
            <div className="pur-info-body">
              <div className="pur-info-row"><User size={17} /><span>{cust.name}</span></div>
              {cust.email && (
                <div className="pur-info-row"><Mail size={17} /><span>{cust.email}</span></div>
              )}
              {cust.phoneNumber && (
                <div className="pur-info-row">
                  <Smartphone size={17} />
                  <span className="gg-num">{cust.phoneNumber}</span>
                </div>
              )}
              <div className="pur-info-row"><MapPin size={17} /><span>{custAddress}</span></div>
            </div>
          </div>

          <div className="pur-info-panel">
            <div className="pur-band">Company Info</div>
            <div className="pur-info-body">
              <div className="pur-info-row"><User size={17} /><span>GildedGlow</span></div>
              <div className="pur-info-row"><Mail size={17} /><span>support@gildedglow.com</span></div>
              <div className="pur-info-row"><Smartphone size={17} /><span className="gg-num">+1 800 000 0000</span></div>
              <div className="pur-info-row"><MapPin size={17} /><span>123 Main Street, New York, NY 10001</span></div>
            </div>
          </div>

          <div className="pur-info-panel">
            <div className="pur-band">Invoice Info</div>
            <div className="pur-info-body">
              <div className="pur-info-line">
                <span className="k">Reference :</span>
                <span className="v gg-num">{sale.reference}</span>
              </div>
              <div className="pur-info-line" style={{ alignItems: 'center' }}>
                <span className="k">Status :</span>
                <StatusBadge status={sale.status} />
              </div>
              <div className="pur-info-line">
                <span className="k">Warehouse :</span>
                <span className="v">{sale.warehouse.name}</span>
              </div>
              <div className="pur-info-line" style={{ alignItems: 'center' }}>
                <span className="k">Payment Status :</span>
                <PaymentStatusBadge status={sale.paymentStatus} />
              </div>
              <div className="pur-info-line">
                <span className="k">Date :</span>
                <span className="v gg-num">{fmtDate(sale.date)}</span>
              </div>
              <div className="pur-info-line">
                <span className="k">Payment :</span>
                <span className="v">{sale.paymentType}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Order Summary ──────────────────────────────────────────────── */}
        <div className="pur-band" style={{ marginBottom: 'var(--sp-5)' }}>Order Summary</div>

        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Net Unit Price</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Discount</th>
                <th>Tax</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const disc = lineDiscountAmt(
                  Number(item.netUnitPrice), item.quantity,
                  item.discountType, Number(item.discount),
                );
                const tax = lineTaxAmt(
                  Number(item.netUnitPrice), item.quantity,
                  item.discountType, Number(item.discount),
                  item.taxType, Number(item.orderTax),
                );
                return (
                  <tr key={item.id}>
                    <td className="gg-td-strong">
                      {item.product.code} ({item.product.name})
                    </td>
                    <td className="gg-num">{fmt(Number(item.netUnitPrice))}</td>
                    <td className="gg-num">{item.quantity}</td>
                    <td className="gg-num">{fmt(Number(item.netUnitPrice))}</td>
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

        {/* ── Totals box ────────────────────────────────────────────────── */}
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
          <div className="pur-totals-row">
            <span className="ptr-lbl">Paid</span>
            <span className="ptr-val gg-num" style={{ color: 'var(--success-fg)' }}>
              {fmt(paid)}
            </span>
          </div>
          <div className="pur-totals-row">
            <span className="ptr-lbl">Due</span>
            <span className="ptr-val gg-num" style={{ color: due > 0 ? 'var(--danger)' : 'inherit' }}>
              {fmt(due)}
            </span>
          </div>
        </div>

        {sale.notes && (
          <div style={{
            marginTop: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)',
            background: 'var(--gray-50)', borderRadius: 'var(--r-md)',
            border: '1px solid var(--gray-200)',
          }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 4 }}>Notes</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>{sale.notes}</p>
          </div>
        )}

      </div>
    </div>
  );
}
