import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  Plus, Filter, ShoppingCart,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db } from '@/lib/db';
import SaleSearch    from './SaleSearch';
import SaleDateFilter from './SaleDateFilter';
import SalePerPage   from './SalePerPage';
import SaleRowMenu   from './SaleRowMenu';

const PER_OPTIONS = [10, 25, 50];

// ── Badges ────────────────────────────────────────────────────────────────────

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

export default async function SalesPage({
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

  const where: Prisma.SaleWhereInput = {
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

  const [total, sales, agg] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
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
        paymentType:   true,
        createdAt:     true,
        customer:  { select: { name: true } },
        warehouse: { select: { name: true } },
      },
    }),
    db.sale.aggregate({
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
    return `/sales?${params}`;
  }

  return (
    <>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="gg-table-toolbar">
        <SaleSearch defaultQ={q} />
        <div className="gg-spacer" />
        <button
          type="button"
          className="gg-icon-btn"
          title="Filter"
          style={{ background: 'var(--gold-600)', color: '#fff', borderColor: 'var(--gold-600)' }}
        >
          <Filter size={18} />
        </button>
        <SaleDateFilter defaultDate={dateStr} />
        <Link href="/sales/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Sale
        </Link>
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
                <th>Payment Type</th>
                <th>Created On</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <ShoppingCart size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>
                        {q || dateStr
                          ? 'No sales match the current filter.'
                          : 'No sales yet.'}
                      </p>
                      {!q && !dateStr && (
                        <Link
                          href="/sales/create"
                          className="gg-btn gg-btn--primary"
                          style={{ marginTop: 'var(--sp-2)' }}
                        >
                          <Plus size={16} /> Create your first sale
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="gg-chip-code gg-num">{s.reference}</span>
                    </td>
                    <td className="gg-td-strong">{s.customer.name}</td>
                    <td>{s.warehouse.name}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td className="gg-num gg-td-strong">{fmtMoney(Number(s.grandTotal))}</td>
                    <td className="gg-num">{fmtMoney(Number(s.paid))}</td>
                    <td><PaymentStatusBadge status={s.paymentStatus} /></td>
                    <td><span className="gg-chip-unit">{s.paymentType}</span></td>
                    <td>
                      <span className="gg-chip-time gg-num">
                        {fmtTime(s.createdAt)}<br />{fmtDate(s.createdAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <SaleRowMenu
                        id={s.id}
                        reference={s.reference}
                        status={s.status}
                        paymentStatus={s.paymentStatus}
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
                <td /><td /><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <SalePerPage perPage={perPage} />
          </div>
          <span className="gg-muted gg-num">{from}–{to} of {total}</span>
          <div className="gg-spacer" />
          <Link href={pageUrl(1)}          className="gg-page-btn" aria-label="First">   <ChevronsLeft  size={17} /></Link>
          <Link href={pageUrl(page - 1)}   className="gg-page-btn" aria-label="Previous"><ChevronLeft   size={17} /></Link>
          <Link href={pageUrl(page + 1)}   className="gg-page-btn" aria-label="Next">   <ChevronRight  size={17} /></Link>
          <Link href={pageUrl(totalPages)} className="gg-page-btn" aria-label="Last">   <ChevronsRight size={17} /></Link>
        </div>
      </div>
    </>
  );
}
