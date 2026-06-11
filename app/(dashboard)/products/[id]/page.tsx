import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { db } from '@/lib/db';

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return []; }
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function ViewProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/');

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) notFound();

  const product = await db.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { name: true } },
      brand:    { select: { name: true } },
      stocks: {
        include: {
          warehouse: { select: { name: true } },
          supplier:  { select: { name: true } },
        },
        orderBy: { warehouseId: 'asc' },
      },
    },
  });

  if (!product) notFound();

  const images     = parseImages(product.images);
  const totalStock = product.stocks.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="prod-view-grid">

      {/* ── Left column: all product fields ──────────────────────────────── */}
      <div className="gg-card">
        <div className="gg-card-head">
          <h2 className="gg-card-title">Product Details</h2>
          <Link href={`/products/${id}/edit`} className="gg-btn gg-btn--secondary gg-btn--sm">
            Edit
          </Link>
        </div>

        <div className="gg-card-pad" style={{ paddingTop: 0 }}>

          <div className="prod-view-row">
            <span className="prod-view-label">Name</span>
            <span className="prod-view-val">{product.name}</span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Code</span>
            <span className="prod-view-val">
              <span className="gg-chip-code">{product.code}</span>
            </span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Category</span>
            <span className="prod-view-val">{product.category.name}</span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Brand</span>
            <span className="prod-view-val">{product.brand.name}</span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Price</span>
            <span className="prod-view-val">${product.price.toString()}</span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Unit</span>
            <span className="prod-view-val">
              <span className="gg-chip-unit">{product.productUnit}</span>
            </span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Tax Type</span>
            <span className="prod-view-val">{product.taxType}</span>
          </div>

          {product.orderTax !== null && (
            <div className="prod-view-row">
              <span className="prod-view-label">Order Tax</span>
              <span className="prod-view-val">{product.orderTax.toString()}%</span>
            </div>
          )}

          {product.stockAlert !== null && (
            <div className="prod-view-row">
              <span className="prod-view-label">Stock Alert</span>
              <span className="prod-view-val">{product.stockAlert}</span>
            </div>
          )}

          {product.quantityLimitation !== null && (
            <div className="prod-view-row">
              <span className="prod-view-label">Qty Limitation</span>
              <span className="prod-view-val">{product.quantityLimitation}</span>
            </div>
          )}

          {product.notes && (
            <div className="prod-view-row">
              <span className="prod-view-label">Notes</span>
              <span className="prod-view-val">{product.notes}</span>
            </div>
          )}

          <div className="prod-view-row">
            <span className="prod-view-label">Total In Stock</span>
            <span className="prod-view-val">
              {totalStock > 0
                ? <span className="qty-pill">{totalStock}</span>
                : <span className="alert-pill">0</span>
              }
            </span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Created</span>
            <span className="prod-view-val">{fmtDate(product.createdAt)}</span>
          </div>

          <div className="prod-view-row">
            <span className="prod-view-label">Last Updated</span>
            <span className="prod-view-val">{fmtDate(product.updatedAt)}</span>
          </div>

        </div>
      </div>

      {/* ── Right column: images + per-warehouse stock ───────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>

        {/* Images gallery */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h2 className="gg-card-title">Images</h2>
          </div>
          <div className="gg-card-pad" style={{ paddingTop: 0 }}>
            {images.length > 0 ? (
              <div className="prod-gallery">
                {images.map((src) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={src} src={src} alt={product.name} className="prod-gallery-img" />
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-sm)', margin: 0 }}>
                No images uploaded.
              </p>
            )}
          </div>
        </div>

        {/* Per-warehouse stock breakdown */}
        <div className="gg-card">
          <div className="gg-card-head">
            <h2 className="gg-card-title">Stock by Warehouse</h2>
          </div>

          {product.stocks.length > 0 ? (
            <div className="gg-table-wrap">
              <table className="gg-table">
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th>Supplier</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {product.stocks.map((s) => (
                    <tr key={s.id}>
                      <td className="gg-td-strong">{s.warehouse.name}</td>
                      <td>{s.supplier?.name ?? '—'}</td>
                      <td>
                        {s.quantity > 0
                          ? <span className="qty-pill">{s.quantity}</span>
                          : <span className="alert-pill">0</span>
                        }
                      </td>
                      <td>{s.status}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td colSpan={2}>{totalStock}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="gg-card-pad" style={{ paddingTop: 'var(--sp-3)' }}>
              <p style={{ color: 'var(--gray-400)', fontSize: 'var(--text-sm)', margin: 0 }}>
                No stock records found.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
