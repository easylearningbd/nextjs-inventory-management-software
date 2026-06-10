import Link from 'next/link';
import { Plus, Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Truck } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import SupplierSearch       from './SupplierSearch';
import SupplierPerPage      from './SupplierPerPage';
import ImportSuppliersButton from './ImportSuppliersButton';
import DeleteSupplierButton from './DeleteSupplierButton';

const PER_OPTIONS = [10, 25, 50];

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.SupplierWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { name:        { contains: q } },
        { email:       { contains: q } },
        { city:        { contains: q } },
        { country:     { contains: q } },
        { phoneNumber: { contains: q } },
      ],
    }),
  };

  const [total, suppliers] = await Promise.all([
    db.supplier.count({ where }),
    db.supplier.findMany({
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
    return `/suppliers?${params}`;
  }

  return (
    <>
      {/* ── toolbar ── */}
      <div className="gg-table-toolbar">
        <SupplierSearch defaultQ={q} />
        <div className="gg-spacer" />
        <ImportSuppliersButton />
        <Link href="/suppliers/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Supplier
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        {/* ── table ── */}
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Phone Number</th>
                <th>Created On</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <Truck size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>
                        {q
                          ? `No suppliers match "${q}".`
                          : 'No suppliers yet.'}
                      </p>
                      {!q && (
                        <Link
                          href="/suppliers/create"
                          className="gg-btn gg-btn--primary"
                          style={{ marginTop: 'var(--sp-2)' }}
                        >
                          <Plus size={16} /> Create your first supplier
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id}>
                    {/* Supplier — name + email */}
                    <td>
                      <div className="ppl-cell">
                        <span className="nm">{s.name}</span>
                        {s.email && <span className="em">{s.email}</span>}
                      </div>
                    </td>

                    {/* Phone Number */}
                    <td className="gg-num">
                      {s.phoneNumber ?? <span className="gg-muted">—</span>}
                    </td>

                    {/* Created On */}
                    <td>
                      <span className="gg-chip-time gg-num">
                        {s.createdAt.toLocaleTimeString('en-US', {
                          hour:     '2-digit',
                          minute:   '2-digit',
                          timeZone: 'UTC',
                        })}
                        <br />
                        {s.createdAt.toLocaleDateString('en-US', {
                          month:    '2-digit',
                          day:      '2-digit',
                          year:     'numeric',
                          timeZone: 'UTC',
                        })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-acts">
                        <Link
                          href={`/suppliers/${s.id}/edit`}
                          className="act-edit"
                          title="Edit"
                        >
                          <Pencil size={17} />
                        </Link>
                        <DeleteSupplierButton id={s.id} name={s.name} />
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
            <SupplierPerPage perPage={perPage} />
          </div>

          <span className="gg-muted gg-num">{from}–{to} of {total}</span>

          <div className="gg-spacer" />

          <Link href={pageUrl(1)}           className="gg-page-btn" aria-label="First"><ChevronsLeft  size={17} /></Link>
          <Link href={pageUrl(page - 1)}    className="gg-page-btn" aria-label="Previous"><ChevronLeft   size={17} /></Link>
          <Link href={pageUrl(page + 1)}    className="gg-page-btn" aria-label="Next"><ChevronRight  size={17} /></Link>
          <Link href={pageUrl(totalPages)}  className="gg-page-btn" aria-label="Last"><ChevronsRight size={17} /></Link>
        </div>
      </div>

      
    </>
  );
}
