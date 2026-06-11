import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Warehouse, Calendar, Clock, Hash } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

function fmtDateTime(d: Date): string {
  return (
    d.toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC',
    }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  );
}

export default async function ViewAdjustmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const adj = await db.adjustment.findFirst({
    where: { id, deletedAt: null },
    include: {
      warehouse: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true, code: true, productUnit: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!adj) notFound();

  const totalAdded      = adj.items
    .filter((i) => i.type === 'Addition')
    .reduce((s, i) => s + i.quantity, 0);
  const totalSubtracted = adj.items
    .filter((i) => i.type === 'Subtraction')
    .reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      {/* ── Page head ─────────────────────────────────────────────────────── */}
      <div className="page-head">
        <h1 className="gg-page-title">Adjustment Details</h1>
        <Link href="/adjustments" className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── Centred document title ─────────────────────────────────────── */}
        <div className="adj-doc-title">
          Adjustment Details :&nbsp;
          <span className="gg-chip-code gg-num">{adj.reference}</span>
        </div>

        {/* ── 2-column info panels ──────────────────────────────────────── */}
        <div className="adj-view-meta">

          {/* Adjustment Info */}
          <div className="gg-card">
            <div className="gg-card-head">
              <span className="gg-card-title">Adjustment Info</span>
            </div>
            <div className="gg-card-pad" style={{ paddingTop: 0 }}>

              <div className="prod-view-row">
                <span className="prod-view-label">
                  <Hash size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Reference
                </span>
                <span className="prod-view-val">
                  <span className="gg-chip-code gg-num">{adj.reference}</span>
                </span>
              </div>

              <div className="prod-view-row">
                <span className="prod-view-label">
                  <Warehouse size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Warehouse
                </span>
                <span className="prod-view-val">{adj.warehouse.name}</span>
              </div>

              <div className="prod-view-row">
                <span className="prod-view-label">
                  <Calendar size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Date
                </span>
                <span className="prod-view-val gg-num">{fmtDate(adj.date)}</span>
              </div>

              <div className="prod-view-row">
                <span className="prod-view-label">
                  <Clock size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  Created
                </span>
                <span className="prod-view-val gg-num">{fmtDateTime(adj.createdAt)}</span>
              </div>

            </div>
          </div>

          {/* Summary */}
          <div className="gg-card">
            <div className="gg-card-head">
              <span className="gg-card-title">Summary</span>
            </div>
            <div className="gg-card-pad" style={{ paddingTop: 0 }}>

              <div className="prod-view-row">
                <span className="prod-view-label">Products adjusted</span>
                <span className="prod-view-val">
                  <span className="qty-pill">{adj.items.length}</span>
                </span>
              </div>

              <div className="prod-view-row">
                <span className="prod-view-label">Total additions</span>
                <span className="prod-view-val">
                  {totalAdded > 0
                    ? <span className="gg-chip-unit gg-num">+{totalAdded}</span>
                    : <span style={{ color: 'var(--gray-400)' }}>—</span>
                  }
                </span>
              </div>

              <div className="prod-view-row">
                <span className="prod-view-label">Total subtractions</span>
                <span className="prod-view-val">
                  {totalSubtracted > 0
                    ? <span className="alert-pill gg-num">−{totalSubtracted}</span>
                    : <span style={{ color: 'var(--gray-400)' }}>—</span>
                  }
                </span>
              </div>

            </div>
          </div>

        </div>

        {/* ── Line items table ───────────────────────────────────────────── */}
        <div
          style={{
            background: 'var(--gray-100)',
            padding: '12px var(--sp-5)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--gray-500)',
            marginBottom: 'var(--sp-4)',
          }}
        >
          Order Items
        </div>

        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Code</th>
                <th>Qty</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {adj.items.map((item) => (
                <tr key={item.id}>
                  <td className="gg-td-strong">{item.product.name}</td>
                  <td>
                    <span className="gg-chip-code gg-num">{item.product.code}</span>
                  </td>
                  <td className="gg-num">
                    {item.type === 'Addition'
                      ? <span className="gg-chip-unit">+{item.quantity}&nbsp;{item.product.productUnit}</span>
                      : <span className="alert-pill">−{item.quantity}&nbsp;{item.product.productUnit}</span>
                    }
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: 24,
                        padding: '0 10px',
                        borderRadius: 'var(--r-sm)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        background: item.type === 'Addition'
                          ? 'var(--success-bg)'
                          : 'var(--danger-bg)',
                        color: item.type === 'Addition'
                          ? 'var(--success-fg)'
                          : 'var(--danger-fg)',
                      }}
                    >
                      {item.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </>
  );
}
