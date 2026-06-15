import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import {
  Plus, Filter,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db }       from '@/lib/db';
import TrSearch     from './TrSearch';
import TrPerPage    from './TrPerPage';
import TrList       from './TrList';
import type { TrRow } from './TrList';

const PER_OPTIONS = [10, 25, 50];

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.TransferWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { reference:    { contains: q } },
        { fromWarehouse: { name: { contains: q } } },
        { toWarehouse:   { name: { contains: q } } },
      ],
    }),
  };

  const [total, transfers] = await Promise.all([
    db.transfer.count({ where }),
    db.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * perPage,
      take:    perPage,
      select: {
        id:          true,
        reference:   true,
        status:      true,
        grandTotal:  true,
        createdAt:   true,
        fromWarehouse: { select: { name: true } },
        toWarehouse:   { select: { name: true } },
        _count:        { select: { items: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from       = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to         = Math.min(page * perPage, total);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('per',  String(perPage));
    params.set('page', String(Math.max(1, Math.min(p, totalPages))));
    return `/transfers?${params}`;
  }

  const rows: TrRow[] = transfers.map((t) => ({
    id:            t.id,
    reference:     t.reference,
    fromWarehouse: t.fromWarehouse.name,
    toWarehouse:   t.toWarehouse.name,
    itemCount:     t._count.items,
    grandTotal:    Number(t.grandTotal),
    status:        t.status,
    createdAt:     t.createdAt.toISOString(),
  }));

  return (
    <>
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="gg-table-toolbar">
        <TrSearch defaultQ={q} />
        <div className="gg-spacer" />
        <button
          type="button"
          className="gg-icon-btn"
          title="Filter"
          style={{ background: 'var(--gold-600)', color: '#fff', borderColor: 'var(--gold-600)' }}
        >
          <Filter size={18} />
        </button>
        <Link href="/transfers/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Transfer
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <TrList rows={rows} />
        </div>

        {/* ── Pagination ────────────────────────────────────────────────── */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <TrPerPage perPage={perPage} />
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
