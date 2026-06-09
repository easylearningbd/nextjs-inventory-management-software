import Link from 'next/link';
import { Plus, Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Building2 } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import WarehouseSearch  from './WarehouseSearch';
import WarehousePerPage from './WarehousePerPage';
import DeleteWarehouseButton from './DeleteWarehouseButton';

const PER_OPTIONS = [10, 25, 50];

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q       = sp.q?.trim() ?? '';
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.WarehouseWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { name:        { contains: q } },
        { email:       { contains: q } },
        { city:        { contains: q } },
        { country:     { contains: q } },
      ],
    }),
  };

  const [total, warehouses] = await Promise.all([
    db.warehouse.count({ where }),
    db.warehouse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
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
    return `/warehouse?${params}`;
  }

  return (
    <>
      {/* ── toolbar ── */}
      <div className="gg-table-toolbar">
        <WarehouseSearch defaultQ={q} />
        <div className="gg-spacer" />
        <Link href="/warehouse/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Warehouse
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        {/* ── table ── */}
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>City / Country</th>
                <th>Created On</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <Building2 size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>
                        {q
                          ? `No warehouses match "${q}".`
                          : 'No warehouses yet.'}
                      </p>
                      {!q && (
                        <Link href="/warehouse/create" className="gg-btn gg-btn--primary" style={{ marginTop: 'var(--sp-2)' }}>
                          <Plus size={16} /> Create your first warehouse
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                warehouses.map((w) => (
                  <tr key={w.id}>
                    {/* Name */}
                    <td>
                      <span className="gg-td-strong">{w.name}</span>
                    </td>

                    {/* Email / Phone */}
                    <td>
                      {w.email || w.phoneNumber ? (
                        <div className="ppl-cell">
                          {w.email       && <span className="em">{w.email}</span>}
                          {w.phoneNumber && <span className="em">{w.phoneNumber}</span>}
                        </div>
                      ) : (
                        <span className="gg-muted">—</span>
                      )}
                    </td>

                    {/* City / Country */}
                    <td>
                      {w.city || w.country ? (
                        <div className="ppl-cell">
                          {w.city    && <span className="em">{w.city}</span>}
                          {w.country && <span className="em">{w.country}</span>}
                        </div>
                      ) : (
                        <span className="gg-muted">—</span>
                      )}
                    </td>

                    {/* Created On */}
                    <td>
                      <span className="gg-chip-time gg-num">
                        {w.createdAt.toLocaleDateString('en-US', {
                          month: 'short',
                          day:   'numeric',
                          year:  'numeric',
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-acts">
                        <Link
                          href={`/warehouse/${w.id}/edit`}
                          className="act-edit"
                          title="Edit"
                        >
                          <Pencil size={17} />
                        </Link>
                        <DeleteWarehouseButton id={w.id} name={w.name} />
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
            <WarehousePerPage perPage={perPage} />
          </div>

          <span className="gg-muted gg-num">{from}–{to} of {total}</span>

          <div className="gg-spacer" />

          <Link href={pageUrl(1)} className="gg-page-btn" aria-label="First">
            <ChevronsLeft size={17} />
          </Link>
          <Link href={pageUrl(page - 1)} className="gg-page-btn" aria-label="Previous">
            <ChevronLeft size={17} />
          </Link>
          <Link href={pageUrl(page + 1)} className="gg-page-btn" aria-label="Next">
            <ChevronRight size={17} />
          </Link>
          <Link href={pageUrl(totalPages)} className="gg-page-btn" aria-label="Last">
            <ChevronsRight size={17} />
          </Link>
        </div>
      </div>

      
    </>
  );
}
