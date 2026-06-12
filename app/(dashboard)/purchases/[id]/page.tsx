import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, FileDown, Pencil,
  User, Mail, Smartphone, MapPin,
} from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function fmtDateTime(d: Date) {
  return (
    d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  );
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ViewPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const purchase = await db.purchase.findFirst({
    where: { id, deletedAt: null },
    include: {
      supplier:  {
        select: { name: true, email: true, phoneNumber: true, country: true, city: true, address: true },
      },
      warehouse: { select: { name: true } },
      items: {
        include: { product: { select: { name: true, code: true } } },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!purchase) notFound();

  // ── Derived totals ────────────────────────────────────────────────────────
  const subtotalsSum = purchase.items.reduce((s, i) => s + Number(i.subtotal), 0);
  const orderTaxPct  = Number(purchase.orderTax);
  const orderTaxAmt  = Math.round(subtotalsSum * orderTaxPct) / 100;
  const flatDiscount = Number(purchase.discount);
  const shipping     = Number(purchase.shipping);
  const grandTotal   = Number(purchase.grandTotal);

  // ── Per-line amounts ──────────────────────────────────────────────────────
  function lineDiscount(
    netUnitCost: number, quantity: number,
    discountType: string, discount: number,
  ) {
    const gross = netUnitCost * quantity;
    return discountType === 'Percentage' ? gross * discount / 100 : discount;
  }
  function lineTax(
    netUnitCost: number, quantity: number,
    discountType: string, discount: number,
    taxType: string, orderTax: number,
  ) {
    const disc = lineDiscount(netUnitCost, quantity, discountType, discount);
    return taxType === 'Exclusive'
      ? (netUnitCost * quantity - disc) * orderTax / 100
      : 0;
  }

  // ── Supplier address string ───────────────────────────────────────────────
  const sup = purchase.supplier;
  const supAddress = [sup.address, sup.city, sup.country].filter(Boolean).join(', ') || '—';

  return (
    <>
      {/* ── Page head ──────────────────────────────────────────────────────── */}
      <div className="page-head pur-noprint">
        <h1 className="gg-page-title">Purchase Details</h1>
        <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
          <Link
            href={`/purchases/${id}/pdf`}
            className="gg-btn gg-btn--secondary gg-btn--sm"
          >
            <FileDown size={16} /> Download PDF
          </Link>
          <Link
            href={`/purchases/${id}/edit`}
            className="gg-btn gg-btn--secondary gg-btn--sm"
          >
            <Pencil size={15} /> Edit
          </Link>
          <Link href="/purchases" className="gg-btn gg-btn--secondary gg-btn--sm">
            <ArrowLeft size={16} /> Back
          </Link>
        </div>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── Centred document title ─────────────────────────────────────── */}
        <div className="pur-pd-title">
          Purchase Details&nbsp;:&nbsp;
          <span className="gg-chip-code gg-num">{purchase.reference}</span>
        </div>

        {/* ── 3-column info grid ─────────────────────────────────────────── */}
        <div className="pur-info-grid">

          {/* Supplier Info */}
          <div className="pur-info-panel">
            <div className="pur-band">Supplier Info</div>
            <div className="pur-info-body">
              <div className="pur-info-row">
                <User size={17} />
                <span>{sup.name}</span>
              </div>
              {sup.email && (
                <div className="pur-info-row">
                  <Mail size={17} />
                  <span>{sup.email}</span>
                </div>
              )}
              {sup.phoneNumber && (
                <div className="pur-info-row">
                  <Smartphone size={17} />
                  <span className="gg-num">{sup.phoneNumber}</span>
                </div>
              )}
              <div className="pur-info-row">
                <MapPin size={17} />
                <span>{supAddress}</span>
              </div>
            </div>
          </div>

          {/* Company Info (static placeholder) */}
          <div className="pur-info-panel">
            <div className="pur-band">Company Info</div>
            <div className="pur-info-body">
              <div className="pur-info-row">
                <User size={17} />
                <span>GildedGlow</span>
              </div>
              <div className="pur-info-row">
                <Mail size={17} />
                <span>support@gildedglow.com</span>
              </div>
              <div className="pur-info-row">
                <Smartphone size={17} />
                <span className="gg-num">+1 800 000 0000</span>
              </div>
              <div className="pur-info-row">
                <MapPin size={17} />
                <span>123 Main Street, New York, NY 10001</span>
              </div>
            </div>
          </div>

          {/* Purchase Info */}
          <div className="pur-info-panel">
            <div className="pur-band">Purchase Info</div>
            <div className="pur-info-body">
              <div className="pur-info-line">
                <span className="k">Reference :</span>
                <span className="v gg-num">{purchase.reference}</span>
              </div>
              <div className="pur-info-line">
                <span className="k">Status :</span>
                <span className="v"><StatusBadge status={purchase.status} /></span>
              </div>
              <div className="pur-info-line">
                <span className="k">Warehouse :</span>
                <span className="v">{purchase.warehouse.name}</span>
              </div>
              <div className="pur-info-line">
                <span className="k">Date :</span>
                <span className="v gg-num">{fmtDate(purchase.date)}</span>
              </div>
              <div className="pur-info-line">
                <span className="k">Payment :</span>
                <span className="v">{purchase.paymentType}</span>
              </div>
              <div className="pur-info-line">
                <span className="k">Created :</span>
                <span className="v gg-num" style={{ fontSize: 12 }}>{fmtDateTime(purchase.createdAt)}</span>
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
                <th>Net Unit Cost</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Discount</th>
                <th>Tax</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item) => {
                const disc = lineDiscount(
                  Number(item.netUnitCost), item.quantity,
                  item.discountType, Number(item.discount),
                );
                const tax  = lineTax(
                  Number(item.netUnitCost), item.quantity,
                  item.discountType, Number(item.discount),
                  item.taxType, Number(item.orderTax),
                );
                return (
                  <tr key={item.id}>
                    <td className="gg-td-strong">
                      {item.product.code} ({item.product.name})
                    </td>
                    <td className="gg-num">{fmt(Number(item.netUnitCost))}</td>
                    <td className="gg-num">{item.quantity}</td>
                    <td className="gg-num">{fmt(Number(item.netUnitCost))}</td>
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
        </div>

        {/* Notes */}
        {purchase.notes && (
          <div style={{ marginTop: 'var(--sp-6)', padding: 'var(--sp-4) var(--sp-5)', background: 'var(--gray-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--gray-200)' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)', fontWeight: 600, marginBottom: 4 }}>Notes</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>{purchase.notes}</p>
          </div>
        )}

      </div>
    </>
  );
}
