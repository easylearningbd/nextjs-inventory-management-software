'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { ProductFormState } from './actions';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return []; }
}

// ─── Prop types ───────────────────────────────────────────────────────────────
type DropdownItem = { id: number; name: string };

export type ProductData = {
  name:               string;
  code:               string;
  price:              string;   // Decimal → string via .toString()
  categoryId:         number;
  brandId:            number;
  productUnit:        string;
  stockAlert:         number | null;
  orderTax:           string | null;
  taxType:            string;
  quantityLimitation: number | null;
  notes:              string | null;
  images:             string | null; // JSON array of paths
};

type ProductAction = (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;

type Props = {
  action:     ProductAction;
  mode:       'create' | 'edit';
  categories: DropdownItem[];
  brands:     DropdownItem[];
  warehouses: DropdownItem[];
  suppliers:  DropdownItem[];
  units:      DropdownItem[];
  product?:   ProductData;
};

const TAX_TYPES = ['Exclusive', 'Inclusive'];
const STATUSES  = ['Received', 'Pending', 'Ordered'];

export default function ProductForm({
  action, mode, categories, brands, warehouses, suppliers, units, product,
}: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  // ── Image management ────────────────────────────────────────────────────────
  // existingImages: paths already in the DB. User can click × to remove them;
  // the kept set is sent to the server as a JSON hidden field.
  const [existingImages, setExistingImages] = useState<string[]>(
    parseImages(product?.images),
  );
  // previews: object-URL thumbnails for files just selected by the user
  // (not yet uploaded — they live in the file input's FileList).
  const [previews, setPreviews]   = useState<string[]>([]);
  const [fileLabel, setFileLabel] = useState('No file chosen');

  // Tracks current blob URLs so we can revoke them on change or unmount.
  const prevUrlsRef  = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke all blob URLs when the component unmounts to prevent memory leaks.
  useEffect(() => {
    return () => { prevUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  // Toast + redirect on action result.
  useEffect(() => {
    if (!state.success && !state.error) return;
    if (state.success) {
      toast.success(
        mode === 'create' ? 'Product created successfully.' : 'Product updated successfully.',
      );
      router.push('/products');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  // When the user picks new files, revoke old blob URLs and create fresh ones.
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    prevUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    const files = Array.from(e.target.files ?? []);
    const urls  = files.map((f) => URL.createObjectURL(f));
    prevUrlsRef.current = urls;
    setPreviews(urls);
    setFileLabel(
      files.length === 0 ? 'No file chosen'
        : files.length === 1 ? files[0].name
        : `${files.length} files selected`,
    );
  }

  // Remove one of the newly-selected (not yet uploaded) files.
  // Uses the DataTransfer API to keep the file input's FileList in sync
  // so that only the remaining files are submitted with the form.
  function removeNewFile(idx: number) {
    URL.revokeObjectURL(previews[idx]);

    const nextPreviews = previews.filter((_, i) => i !== idx);
    prevUrlsRef.current = nextPreviews;
    setPreviews(nextPreviews);

    // Rebuild the file input FileList without the removed file.
    if (fileInputRef.current?.files) {
      const dt = new DataTransfer();
      Array.from(fileInputRef.current.files).forEach((f, i) => {
        if (i !== idx) dt.items.add(f);
      });
      fileInputRef.current.files = dt.files;
    }

    const remaining = fileInputRef.current?.files?.length ?? 0;
    setFileLabel(
      remaining === 0 ? 'No file chosen'
        : remaining === 1 ? (fileInputRef.current?.files?.[0].name ?? '1 file')
        : `${remaining} files selected`,
    );
  }

  // Remove one of the already-saved images (edit mode).
  // The kept set is re-serialised into the hidden input on every render,
  // so the server sees only the paths the user did NOT remove.
  function removeExistingImage(path: string) {
    setExistingImages((prev) => prev.filter((p) => p !== path));
  }

  const v = product;

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create Product' : 'Edit Product'}
        </h1>
        <Link href="/products" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="create-layout">

          {/* ── LEFT: product fields ── */}
          <div className="field-grid">

            {/* Name */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-name">
                Name <span className="gg-req">*</span>
              </label>
              <input
                id="pr-name" name="name" className="gg-input"
                placeholder="Enter Name"
                defaultValue={v?.name ?? ''}
                required disabled={isPending}
              />
            </div>

            {/* Code */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-code">
                Code <span className="gg-req">*</span>
              </label>
              <input
                id="pr-code" name="code" className="gg-input"
                placeholder="Enter Code"
                defaultValue={v?.code ?? ''}
                required disabled={isPending}
              />
            </div>

            {/* Product Category */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-cat">
                Product Category <span className="gg-req">*</span>
              </label>
              <select
                id="pr-cat" name="categoryId" className="gg-select"
                defaultValue={v?.categoryId ?? ''}
                required disabled={isPending}
              >
                <option value="" disabled>Choose Product Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Brand */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-brand">
                Brand <span className="gg-req">*</span>
              </label>
              <select
                id="pr-brand" name="brandId" className="gg-select"
                defaultValue={v?.brandId ?? ''}
                required disabled={isPending}
              >
                <option value="" disabled>Choose Brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Product Price */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-price">
                Product Price <span className="gg-req">*</span>
              </label>
              <div className="gg-input-group">
                <input
                  id="pr-price" name="price" type="number" step="0.01" min="0"
                  className="gg-input gg-num"
                  placeholder="0.00"
                  defaultValue={v?.price ?? ''}
                  required disabled={isPending}
                />
                <span className="gg-input-suffix">$</span>
              </div>
            </div>

            {/* Product Unit */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-unit">
                Product Unit <span className="gg-req">*</span>
              </label>
              <select
                id="pr-unit" name="productUnit" className="gg-select"
                defaultValue={v?.productUnit ?? ''}
                required disabled={isPending}
              >
                <option value="" disabled>Choose Unit</option>
                {units.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Stock Alert */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-alert">Stock Alert</label>
              <input
                id="pr-alert" name="stockAlert" type="number" step="1" min="0"
                className="gg-input gg-num"
                placeholder="0"
                defaultValue={v?.stockAlert ?? ''}
                disabled={isPending}
              />
            </div>

            {/* Order Tax */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-tax">Order Tax</label>
              <div className="gg-input-group">
                <input
                  id="pr-tax" name="orderTax" type="number" step="0.01" min="0" max="100"
                  className="gg-input gg-num"
                  placeholder="0"
                  defaultValue={v?.orderTax ?? ''}
                  disabled={isPending}
                />
                <span className="gg-input-suffix">%</span>
              </div>
            </div>

            {/* Tax Type */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-taxtype">
                Tax Type <span className="gg-req">*</span>
              </label>
              <select
                id="pr-taxtype" name="taxType" className="gg-select"
                defaultValue={v?.taxType ?? 'Exclusive'}
                required disabled={isPending}
              >
                {TAX_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Quantity Limitation */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="pr-qlimit">Quantity Limitation</label>
              <input
                id="pr-qlimit" name="quantityLimitation" type="number" step="1" min="0"
                className="gg-input gg-num"
                placeholder="No limit"
                defaultValue={v?.quantityLimitation ?? ''}
                disabled={isPending}
              />
            </div>

            {/* Notes — spans both columns */}
            <div className="gg-field span-2">
              <label className="gg-label" htmlFor="pr-notes">Notes</label>
              <textarea
                id="pr-notes" name="notes" className="gg-textarea"
                placeholder="Enter Notes"
                style={{ minHeight: 110 }}
                defaultValue={v?.notes ?? ''}
                disabled={isPending}
              />
            </div>

            {/* Save / Cancel */}
            <div className="span-2 gg-form-actions" style={{ marginTop: 0 }}>
              <button
                type="submit"
                className="gg-btn gg-btn--primary"
                disabled={isPending}
              >
                {isPending
                  ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                  : <><Check size={17} /> Save</>}
              </button>
              <Link href="/products" className="gg-btn gg-btn--secondary">
                Cancel
              </Link>
            </div>

          </div>

          {/* ── RIGHT: images + initial stock ── */}
          <div className="stock-rail">

            {/* ── Image section ── */}
            <div className="gg-field">
              <label className="gg-label">
                {mode === 'edit' ? 'Product Images' : 'Multiple Image'}
              </label>

              {/*
                Hidden input — carries the JSON list of existing paths the user
                chose to keep.  Any path the user removed via × is absent here,
                so the server only preserves what appears in this list.
                Server-side: updateProduct cross-checks this list against the
                actual DB record to prevent path-injection.
              */}
              <input
                type="hidden"
                name="existingImages"
                value={JSON.stringify(existingImages)}
              />

              {/* Styled file picker trigger */}
              <div
                className="gg-file"
                onClick={() => !isPending && fileInputRef.current?.click()}
              >
                <span className="gg-file-btn">Choose Files</span>
                <span className="gg-file-name">{fileLabel}</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                style={{ display: 'none' }}
                disabled={isPending}
                onChange={handleFileChange}
              />

              {/* Previews for newly selected (not yet saved) files */}
              {previews.length > 0 && (
                <div className="prod-img-strip">
                  {previews.map((url, i) => (
                    <div key={url} className="prod-img-item">
                      <img src={url} alt={`New ${i + 1}`} />
                      <button
                        type="button"
                        className="prod-img-del"
                        title="Remove"
                        onClick={() => removeNewFile(i)}
                        disabled={isPending}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Already-saved images (edit mode) with per-image × button */}
              {mode === 'edit' && existingImages.length > 0 && (
                <>
                  <p style={{
                    margin: '8px 0 4px', fontSize: 12,
                    color: 'var(--gray-500)', fontWeight: 600,
                  }}>
                    Saved — click × to remove
                  </p>
                  <div className="prod-img-strip">
                    {existingImages.map((path) => (
                      <div key={path} className="prod-img-item">
                        <img src={path} alt="Saved" />
                        <button
                          type="button"
                          className="prod-img-del"
                          title="Remove"
                          onClick={() => removeExistingImage(path)}
                          disabled={isPending}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Prompt when in edit mode with no images at all */}
              {mode === 'edit' && existingImages.length === 0 && previews.length === 0 && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gray-400)' }}>
                  No images saved yet.
                </p>
              )}
            </div>

            {/* ── Add Stock — create mode only ──────────────────────────────────
                In edit mode this block is intentionally absent.  Re-running the
                stock-create logic on every product save would silently inflate
                the per-warehouse quantity.  Stock changes after creation must
                go through a dedicated adjustment flow (future feature).
            ── */}
            {mode === 'create' && (
              <>
                <div
                  className="gg-form-section-title"
                  style={{ textAlign: 'left', fontSize: 'var(--text-card)', marginBottom: 0 }}
                >
                  Add Stock
                </div>

                {/* Warehouse */}
                <div className="gg-field">
                  <label className="gg-label" htmlFor="pr-wh">
                    Warehouse <span className="gg-req">*</span>
                  </label>
                  <select
                    id="pr-wh" name="warehouseId" className="gg-select"
                    defaultValue="" required disabled={isPending}
                  >
                    <option value="" disabled>Choose Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                {/* Supplier */}
                <div className="gg-field">
                  <label className="gg-label" htmlFor="pr-sup">Supplier</label>
                  <select
                    id="pr-sup" name="supplierId" className="gg-select"
                    defaultValue="" disabled={isPending}
                  >
                    <option value="">Choose Supplier (optional)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div className="gg-field">
                  <label className="gg-label" htmlFor="pr-qty">
                    Add Product Quantity <span className="gg-req">*</span>
                  </label>
                  <input
                    id="pr-qty" name="quantity" type="number" step="1" min="0"
                    className="gg-input gg-num"
                    placeholder="0"
                    required disabled={isPending}
                  />
                </div>

                {/* Status */}
                <div className="gg-field">
                  <label className="gg-label" htmlFor="pr-status">
                    Status <span className="gg-req">*</span>
                  </label>
                  <select
                    id="pr-status" name="status" className="gg-select"
                    defaultValue="Received" required disabled={isPending}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </form>
  );
}
