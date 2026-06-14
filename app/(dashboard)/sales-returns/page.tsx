import type { Prisma } from '@prisma/client';
import {
  Filter, CornerUpRight,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db } from '@/lib/db';
import SrSearch     from './SrSearch';
import SrDateFilter from './SrDateFilter';
import SrPerPage    from './SrPerPage';
import SrRowMenu    from './SrRowMenu';

const PER_OPTIONS = [10, 25, 50];

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="gg-muted">—</span>;
  const colours: Record<string, { bg: string; fg: string }> = {
    Received:  { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    Completed: { bg: 'var(--info-bg)',    fg: 'var(--info)' },
    Pending:   { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
  };
  const c = colours[status] ?? { bg: 'var(--gray-100)', fg: 'var(--gray-600)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      height: 24, padding: '0 10px',
      borderRadius: 'var(--r-sm)', fontSize: 12.5, fontWeight: 600,
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
      height: 24, padding: '0 10px',
      borderRadius: 'var(--r-sm)', fontSize: 12.5, fontWeight: 600,
      background: c.bg, color: c.fg,
    }}>
      {status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SaleReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; date?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const dateStr   = sp.date?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.SaleReturnWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { reference: { contains: q } },
        { customer:  { name: { contains: q } } },
        { warehouse: { name: { contains: q } } },
      ],
    }),
    ...(dateStr && {
      date: {
        gte: new Date(dateStr + 'T00:00:00.000Z'),
        lte: new Date(dateStr + 'T23:59:59.999Z'),
      },
    }),
  };

  const [total, returns_, agg] = await Promise.all([
    db.saleReturn.count({ where }),
    db.saleReturn.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * perPage,
      take:    perPage,
      select: {
        id:            true,
        reference:     true,
        status:        true,
        grandTotal:    true,
        paid:          true,
        paymentStatus: true,
        createdAt:     true,
        customer:  { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    }),
    db.saleReturn.aggregate({
      where,
      _sum: { grandTotal: true, paid: true },
    }),
  ]);

  const totalPages    = Math.max(1, Math.ceil(total / perPage));
  const from          = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to            = Math.min(page * perPage, total);
  const grandTotalSum = Number(agg._sum.grandTotal ?? 0);
  const paidSum       = Number(agg._sum.paid       ?? 0);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q)       params.set('q',    q);
    if (dateStr) params.set('date', dateStr);
    params.set('per',  String(perPage));
    params.set('page', String(Math.max(1, Math.min(p, totalPages))));
    return `/sales-returns?${params}`;
  }

  return (
    <>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="gg-table-toolbar">
        <SrSearch defaultQ={q} />
        <div className="gg-spacer" />
        <button
          type="button"
          className="gg-icon-btn"
          title="Filter"
          style={{ background: 'var(--gold-600)', color: '#fff', borderColor: 'var(--gold-600)' }}
        >
          <Filter size={18} />
        </button>
        <SrDateFilter defaultDate={dateStr} />
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Warehouse</th>
                <th>Status</th>
                <th>Grand Total</th>
                <th>Paid</th>
                <th>Payment Status</th>
                <th>Created On</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {returns_.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <CornerUpRight size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>
                        {q || dateStr
                          ? 'No sale returns match the current filter.'
                          : 'No sale returns yet. Create one from a sale.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                returns_.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="gg-chip-code gg-num">{r.reference}</span>
                    </td>
                    <td className="gg-td-strong">{r.customer.name}</td>
                    <td>{r.warehouse.name}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="gg-num gg-td-strong">{fmtMoney(Number(r.grandTotal))}</td>
                    <td className="gg-num">{fmtMoney(Number(r.paid))}</td>
                    <td><PaymentStatusBadge status={r.paymentStatus} /></td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {fmtTime(r.createdAt)}<br />{fmtDate(r.createdAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <SrRowMenu
                        id={r.id}
                        reference={r.reference}
                        status={r.status}
                        paymentStatus={r.paymentStatus}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* ── Footer totals ── */}
            <tfoot>
              <tr>
                <td className="gg-td-strong">Total</td>
                <td /><td /><td />
                <td className="gg-num gg-td-strong">{fmtMoney(grandTotalSum)}</td>
                <td className="gg-num gg-td-strong">{fmtMoney(paidSum)}</td>
                <td /><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <SrPerPage perPage={perPage} />
          </div>
          <span className="gg-muted gg-num">{from}–{to} of {total}</span>
          <div className="gg-spacer" />
          <a href={pageUrl(1)}          className="gg-page-btn" aria-label="First">   <ChevronsLeft  size={17} /></a>
          <a href={pageUrl(page - 1)}   className="gg-page-btn" aria-label="Previous"><ChevronLeft   size={17} /></a>
          <a href={pageUrl(page + 1)}   className="gg-page-btn" aria-label="Next">   <ChevronRight  size={17} /></a>
          <a href={pageUrl(totalPages)} className="gg-page-btn" aria-label="Last">   <ChevronsRight size={17} /></a>
        </div>
      </div>
    </>
  );
}
