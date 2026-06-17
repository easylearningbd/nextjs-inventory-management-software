import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  ShoppingCart, ShoppingBag, ArrowRight, ArrowLeft, Filter,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db } from '@/lib/db';
import WrWarehouseFilter from './WrWarehouseFilter';
import WrSubTabs         from './WrSubTabs';
import WrSearch          from './WrSearch';
import WrPerPage         from './WrPerPage';

const PER_OPTIONS = [10, 25, 50];
const VALID_SUBS  = ['sales', 'sale-returns', 'purchase-returns', 'expenses'] as const;
type Sub = typeof VALID_SUBS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, { bg: string; fg: string }> = {
    Received:  { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    Completed: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
    Ordered:   { bg: 'var(--info-bg)',    fg: 'var(--info)' },
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function WarehouseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ wh?: string; sub?: string; q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const whIdRaw  = parseInt(sp.wh ?? '', 10);
  const whId     = Number.isNaN(whIdRaw) ? null : whIdRaw;
  const sub      = (VALID_SUBS as readonly string[]).includes(sp.sub ?? '') ? (sp.sub as Sub) : 'sales';
  const q        = sp.q?.trim() ?? '';
  const page     = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage  = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const whFilter = whId ? { warehouseId: whId } : {};

  // ── Parallel: warehouse list + 4 KPI counts ───────────────────────────────
  const [
    warehouses,
    salesCount, purchasesCount, saleReturnsCount, purchaseReturnsCount,
  ] = await Promise.all([
    db.warehouse.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.sale.count({ where: { deletedAt: null, ...whFilter } }),
    db.purchase.count({ where: { deletedAt: null, ...whFilter } }),
    db.saleReturn.count({ where: { deletedAt: null, ...whFilter } }),
    db.purchaseReturn.count({ where: { deletedAt: null, ...whFilter } }),
  ]);

  // ── Table data (only fetch the active sub-tab) ────────────────────────────

  // Sales
  type SaleRow = {
    id: number; reference: string; status: string; paymentStatus: string;
    grandTotal: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal;
    customer: { name: string }; warehouse: { name: string };
  };
  let saleRows: SaleRow[]                 = [];

  // Sale Returns
  type SaleReturnRow = {
    id: number; reference: string; status: string; paymentStatus: string;
    grandTotal: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal;
    customer: { name: string }; warehouse: { name: string };
  };
  let saleReturnRows: SaleReturnRow[]     = [];

  // Purchase Returns
  type PurchaseReturnRow = {
    id: number; reference: string; status: string;
    grandTotal: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal;
    supplier: { name: string }; warehouse: { name: string };
  };
  let purchaseReturnRows: PurchaseReturnRow[] = [];

  // Expenses
  type ExpenseRow = {
    id: number; reference: string; title: string; amount: Prisma.Decimal;
    date: Date; warehouse: { name: string }; category: { name: string };
  };
  let expenseRows: ExpenseRow[]           = [];

  let total = 0;

  if (sub === 'sales') {
    const where: Prisma.SaleWhereInput = {
      deletedAt: null,
      ...whFilter,
      ...(q && { OR: [
        { reference: { contains: q } },
        { customer:  { name: { contains: q } } },
        { warehouse: { name: { contains: q } } },
      ]}),
    };
    const [cnt, rows] = await Promise.all([
      db.sale.count({ where }),
      db.sale.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
        select: {
          id: true, reference: true, status: true, paymentStatus: true,
          grandTotal: true, paid: true, due: true,
          customer:  { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    total    = cnt;
    saleRows = rows;
  } else if (sub === 'sale-returns') {
    const where: Prisma.SaleReturnWhereInput = {
      deletedAt: null,
      ...whFilter,
      ...(q && { OR: [
        { reference: { contains: q } },
        { customer:  { name: { contains: q } } },
        { warehouse: { name: { contains: q } } },
      ]}),
    };
    const [cnt, rows] = await Promise.all([
      db.saleReturn.count({ where }),
      db.saleReturn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
        select: {
          id: true, reference: true, status: true, paymentStatus: true,
          grandTotal: true, paid: true, due: true,
          customer:  { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    total          = cnt;
    saleReturnRows = rows;
  } else if (sub === 'purchase-returns') {
    const where: Prisma.PurchaseReturnWhereInput = {
      deletedAt: null,
      ...whFilter,
      ...(q && { OR: [
        { reference: { contains: q } },
        { supplier:  { name: { contains: q } } },
        { warehouse: { name: { contains: q } } },
      ]}),
    };
    const [cnt, rows] = await Promise.all([
      db.purchaseReturn.count({ where }),
      db.purchaseReturn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
        select: {
          id: true, reference: true, status: true,
          grandTotal: true, paid: true, due: true,
          supplier:  { select: { name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);
    total              = cnt;
    purchaseReturnRows = rows;
  } else {
    // expenses
    const where: Prisma.ExpenseWhereInput = {
      deletedAt: null,
      ...whFilter,
      ...(q && { OR: [
        { reference: { contains: q } },
        { title:     { contains: q } },
        { warehouse: { name: { contains: q } } },
      ]}),
    };
    const [cnt, rows] = await Promise.all([
      db.expense.count({ where }),
      db.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
        select: {
          id: true, reference: true, title: true, amount: true, date: true,
          warehouse: { select: { name: true } },
          category:  { select: { name: true } },
        },
      }),
    ]);
    total       = cnt;
    expenseRows = rows;
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from       = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to         = Math.min(page * perPage, total);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (whId)           params.set('wh',   String(whId));
    if (sub !== 'sales') params.set('sub',  sub);
    if (q)              params.set('q',    q);
    params.set('per',  String(perPage));
    params.set('page', String(Math.max(1, Math.min(p, totalPages))));
    return `/reports/warehouse?${params}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Warehouse filter */}
      <WrWarehouseFilter warehouses={warehouses} selectedId={whId} />

      {/* KPI tiles */}
      <div className="gg-kpi-grid" style={{ marginBottom: 'var(--sp-7)' }}>
        <div className="gg-kpi gg-kpi--violet">
          <div className="gg-kpi-ico"><ShoppingCart size={22} /></div>
          <div className="gg-kpi-body">
            <span className="gg-kpi-value gg-num">{salesCount}</span>
            <span className="gg-kpi-label">Sales</span>
          </div>
        </div>
        <div className="gg-kpi gg-kpi--emerald">
          <div className="gg-kpi-ico"><ShoppingBag size={22} /></div>
          <div className="gg-kpi-body">
            <span className="gg-kpi-value gg-num">{purchasesCount}</span>
            <span className="gg-kpi-label">Purchases</span>
          </div>
        </div>
        <div className="gg-kpi gg-kpi--blue">
          <div className="gg-kpi-ico"><ArrowRight size={22} /></div>
          <div className="gg-kpi-body">
            <span className="gg-kpi-value gg-num">{saleReturnsCount}</span>
            <span className="gg-kpi-label">Sales Return</span>
          </div>
        </div>
        <div className="gg-kpi gg-kpi--orange">
          <div className="gg-kpi-ico"><ArrowLeft size={22} /></div>
          <div className="gg-kpi-body">
            <span className="gg-kpi-value gg-num">{purchaseReturnsCount}</span>
            <span className="gg-kpi-label">Purchases Return</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <WrSubTabs activeSub={sub} />

      {/* Toolbar */}
      <div className="rpt-toolbar">
        <WrSearch defaultQ={q} />
        <div className="gg-spacer" />
        <button className="btn-icon-gold" title="Filter" type="button">
          <Filter size={18} />
        </button>
        <button className="btn-excel" type="button" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          EXCEL
        </button>
      </div>

      {/* Table */}
      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table">

            {/* ── Sales ── */}
            {sub === 'sales' && (
              <>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Warehouse</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Payment Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saleRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                        <div className="gg-empty-state">
                          <ShoppingCart size={40} style={{ color: 'var(--gray-300)' }} />
                          <p>{q ? 'No sales match the search.' : 'No sales found.'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : saleRows.map((s) => (
                    <tr key={s.id}>
                      <td><span className="gg-chip-code gg-num">{s.reference}</span></td>
                      <td className="gg-td-strong">{s.customer.name}</td>
                      <td>{s.warehouse.name}</td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="gg-num gg-td-strong">{fmtMoney(Number(s.grandTotal))}</td>
                      <td className="gg-num">{fmtMoney(Number(s.paid))}</td>
                      <td className="gg-num">{fmtMoney(Number(s.due))}</td>
                      <td><PaymentStatusBadge status={s.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {/* ── Sales Returns ── */}
            {sub === 'sale-returns' && (
              <>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Warehouse</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Payment Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saleReturnRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                        <div className="gg-empty-state">
                          <ShoppingCart size={40} style={{ color: 'var(--gray-300)' }} />
                          <p>{q ? 'No sale returns match the search.' : 'No sale returns found.'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : saleReturnRows.map((r) => (
                    <tr key={r.id}>
                      <td><span className="gg-chip-code gg-num">{r.reference}</span></td>
                      <td className="gg-td-strong">{r.customer.name}</td>
                      <td>{r.warehouse.name}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="gg-num gg-td-strong">{fmtMoney(Number(r.grandTotal))}</td>
                      <td className="gg-num">{fmtMoney(Number(r.paid))}</td>
                      <td className="gg-num">{fmtMoney(Number(r.due))}</td>
                      <td><PaymentStatusBadge status={r.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {/* ── Purchase Returns ── */}
            {sub === 'purchase-returns' && (
              <>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Supplier</th>
                    <th>Warehouse</th>
                    <th>Status</th>
                    <th>Grand Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseReturnRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, border: 'none' }}>
                        <div className="gg-empty-state">
                          <ShoppingBag size={40} style={{ color: 'var(--gray-300)' }} />
                          <p>{q ? 'No purchase returns match the search.' : 'No purchase returns found.'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : purchaseReturnRows.map((r) => (
                    <tr key={r.id}>
                      <td><span className="gg-chip-code gg-num">{r.reference}</span></td>
                      <td className="gg-td-strong">{r.supplier.name}</td>
                      <td>{r.warehouse.name}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="gg-num gg-td-strong">{fmtMoney(Number(r.grandTotal))}</td>
                      <td className="gg-num">{fmtMoney(Number(r.paid))}</td>
                      <td className="gg-num">{fmtMoney(Number(r.due))}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {/* ── Expenses ── */}
            {sub === 'expenses' && (
              <>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Title</th>
                    <th>Warehouse</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                        <div className="gg-empty-state">
                          <ArrowLeft size={40} style={{ color: 'var(--gray-300)' }} />
                          <p>{q ? 'No expenses match the search.' : 'No expenses found.'}</p>
                        </div>
                      </td>
                    </tr>
                  ) : expenseRows.map((e) => (
                    <tr key={e.id}>
                      <td><span className="gg-chip-code gg-num">{e.reference}</span></td>
                      <td className="gg-td-strong">{e.title}</td>
                      <td>{e.warehouse.name}</td>
                      <td>{e.category.name}</td>
                      <td className="gg-num gg-td-strong">{fmtMoney(Number(e.amount))}</td>
                      <td className="gg-num">{fmtDate(e.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

          </table>
        </div>

        {/* Pagination */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <WrPerPage perPage={perPage} />
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
