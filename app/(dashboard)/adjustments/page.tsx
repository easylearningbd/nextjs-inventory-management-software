import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  Plus, Eye, SlidersHorizontal,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db } from '@/lib/db';
import AdjustmentSearch       from './AdjustmentSearch';
import AdjustmentPerPage      from './AdjustmentPerPage';
import DeleteAdjustmentButton from './DeleteAdjustmentButton';

const PER_OPTIONS = [10, 25, 50];

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.AdjustmentWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { reference: { contains: q } },
        { warehouse: { name: { contains: q } } },
      ],
    }),
  };

  const [total, adjustments] = await Promise.all([
    db.adjustment.count({ where }),
    db.adjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * perPage,
      take:    perPage,
      select: {
        id:        true,
        reference: true,
        date:      true,
        createdAt: true,
        warehouse: { select: { name: true } },
        _count:    { select: { items: true } },
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
    return `/adjustments?${params}`;
  }

  return (
    <>
      {/* ── toolbar ── */}
      <div className="gg-table-toolbar">
        <AdjustmentSearch defaultQ={q} />
        <div className="gg-spacer" />
        <Link href="/adjustments/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Adjustment
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Warehouse</th>
                <th>Date</th>
                <th>Created On</th>
                <th>Items</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <SlidersHorizontal size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>
                        {q
                          ? `No adjustments match "${q}".`
                          : 'No adjustments yet.'}
                      </p>
                      {!q && (
                        <Link
                          href="/adjustments/create"
                          className="gg-btn gg-btn--primary"
                          style={{ marginTop: 'var(--sp-2)' }}
                        >
                          <Plus size={16} /> Create your first adjustment
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id}>
                    {/* Reference */}
                    <td>
                      <span className="gg-chip-code gg-num">{adj.reference}</span>
                    </td>

                    {/* Warehouse */}
                    <td className="gg-td-strong">{adj.warehouse.name}</td>

                    {/* Business date */}
                    <td className="gg-num">
                      {adj.date.toLocaleDateString('en-US', {
                        month: '2-digit', day: '2-digit', year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </td>

                    {/* Created On */}
                    <td>
                      <span className="gg-chip-time gg-num">
                        {adj.createdAt.toLocaleTimeString('en-US', {
                          hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                        })}
                        <br />
                        {adj.createdAt.toLocaleDateString('en-US', {
                          month: '2-digit', day: '2-digit', year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </span>
                    </td>

                    {/* Item count */}
                    <td>
                      <span className="qty-pill">{adj._count.items}</span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-acts">
                        <Link
                          href={`/adjustments/${adj.id}`}
                          className="act-view"
                          title="View"
                        >
                          <Eye size={17} />
                        </Link>
                        <DeleteAdjustmentButton
                          id={adj.id}
                          reference={adj.reference}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── pagination ── */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <AdjustmentPerPage perPage={perPage} />
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
