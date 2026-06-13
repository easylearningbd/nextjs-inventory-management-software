import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import {
  Plus, Boxes, Filter, Upload, Download,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { db } from '@/lib/db';
import ProductSearch    from './ProductSearch';
import ProductPerPage   from './ProductPerPage';
import ProductRowMenu   from './ProductRowMenu';

const PER_OPTIONS = [10, 25, 50];

function parseImages(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return []; }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; per?: string }>;
}) {
  const sp = await searchParams;

  const q         = sp.q?.trim() ?? '';
  const page      = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perParsed = parseInt(sp.per ?? '10', 10);
  const perPage   = PER_OPTIONS.includes(perParsed) ? perParsed : 10;

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(q && {
      OR: [
        { name:     { contains: q } },
        { code:     { contains: q } },
        { brand:    { name: { contains: q } } },
        { category: { name: { contains: q } } },
      ],
    }),
  };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * perPage,
      take:    perPage,
      select: {
        id:          true,
        name:        true,
        code:        true,
        price:       true,
        productUnit: true,
        images:      true,
        createdAt:   true,
        brand:    { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  ]);

  // Aggregate stock per product in a single grouped query instead of N+1.
  const productIds   = products.map((p) => p.id);
  const stockGroups  = productIds.length > 0
    ? await db.productStock.groupBy({
        by:    ['productId'],
        _sum:  { quantity: true },
        where: { productId: { in: productIds } },
      })
    : [];
  const stockMap = new Map(stockGroups.map((g) => [g.productId, g._sum.quantity ?? 0]));

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from       = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to         = Math.min(page * perPage, total);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('per',  String(perPage));
    params.set('page', String(Math.max(1, Math.min(p, totalPages))));
    return `/products?${params}`;
  }

  return (
    <>
      {/* ── toolbar ── */}
      <div className="gg-table-toolbar">
        <ProductSearch defaultQ={q} />
        <div className="gg-spacer" />
        <button
          type="button"
          className="gg-icon-btn"
          title="Filter"
          style={{ background: 'var(--gold-600)', color: '#fff', borderColor: 'var(--gold-600)' }}
        >
          <Filter size={18} />
        </button>
        <button type="button" className="gg-btn gg-btn--secondary">
          <Upload size={17} /> Export Products
        </button>
        <button type="button" className="gg-btn gg-btn--secondary">
          <Download size={17} /> Import Products
        </button>
        <Link href="/products/create" className="gg-btn gg-btn--primary">
          <Plus size={17} /> Create Product
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Name</th>
                <th>Code</th>
                <th>Brand</th>
                <th>Price</th>
                <th>Product Unit</th>
                <th>In Stock</th>
                <th>Created On</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <Boxes size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>{q ? `No products match "${q}".` : 'No products yet.'}</p>
                      {!q && (
                        <Link
                          href="/products/create"
                          className="gg-btn gg-btn--primary"
                          style={{ marginTop: 'var(--sp-2)' }}
                        >
                          <Plus size={16} /> Create your first product
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const firstImage = parseImages(p.images)[0] ?? null;
                  const inStock    = stockMap.get(p.id) ?? 0;
                  const price      = Number(p.price).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });

                  return (
                    <tr key={p.id}>
                      {/* Thumbnail */}
                      <td>
                        <div className="prod-thumb">
                          {firstImage && <img src={firstImage} alt={p.name} />}
                        </div>
                      </td>

                      {/* Name */}
                      <td>
                        <span className="gg-td-strong prod-name" title={p.name}>
                          {p.name}
                        </span>
                      </td>

                      {/* Code */}
                      <td><span className="gg-chip-code">{p.code}</span></td>

                      {/* Brand */}
                      <td>{p.brand.name}</td>

                      {/* Price */}
                      <td className="gg-num gg-td-strong">$ {price}</td>

                      {/* Unit */}
                      <td><span className="gg-chip-unit">{p.productUnit}</span></td>

                      {/* In Stock — summed across all warehouses */}
                      <td className="gg-num">
                        <span className={inStock > 0 ? 'qty-pill' : 'alert-pill'}>
                          {inStock}
                        </span>
                      </td>

                      {/* Created On */}
                      <td>
                        <span className="gg-chip-time gg-num">
                          {p.createdAt.toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                          })}
                          <br />
                          {p.createdAt.toLocaleDateString('en-US', {
                            month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC',
                          })}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <ProductRowMenu id={p.id} name={p.name} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── pagination ── */}
        <div className="gg-pagination">
          <div className="gg-perpage">
            <span className="gg-muted">Records per page</span>
            <ProductPerPage perPage={perPage} />
          </div>
          <span className="gg-muted gg-num">{from}–{to} of {total}</span>
          <div className="gg-spacer" />
          <Link href={pageUrl(1)}          className="gg-page-btn" aria-label="First"><ChevronsLeft  size={17} /></Link>
          <Link href={pageUrl(page - 1)}   className="gg-page-btn" aria-label="Previous"><ChevronLeft   size={17} /></Link>
          <Link href={pageUrl(page + 1)}   className="gg-page-btn" aria-label="Next"><ChevronRight  size={17} /></Link>
          <Link href={pageUrl(totalPages)} className="gg-page-btn" aria-label="Last"><ChevronsRight size={17} /></Link>
        </div>
      </div>
    </>
  );
}
