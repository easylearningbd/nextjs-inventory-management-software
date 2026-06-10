'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Layers, Search,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from 'lucide-react';
import { createCategory, updateCategory, type CategoryState } from './actions';
import CategoryModal from './CategoryModal';
import DeleteCategoryModal from './DeleteCategoryModal';

export type CategoryRow = {
  id:        number;
  name:      string;
  logo:      string | null;
  createdAt: Date;
};

type Props = {
  categories: CategoryRow[];
  total:      number;
  page:       number;
  perPage:    number;
  totalPages: number;
  from:       number;
  to:         number;
  q:          string;
};

const PER_OPTIONS = [10, 25, 50];

export default function CategoriesClient({
  categories, total, page, perPage, totalPages, from, to, q,
}: Props) {
  const router   = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [modalMode, setModalMode]   = useState<'create' | 'edit' | null>(null);
  const [editCategory, setEditCategory] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  function openCreate() { setEditCategory(null); setModalMode('create'); }
  function openEdit(c: CategoryRow) { setEditCategory(c); setModalMode('edit'); }
  function closeModal() { setModalMode(null); setEditCategory(null); }

  // ── Search ────────────────────────────────────────────────────────────────
  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const url = new URL(window.location.href);
      if (val) url.searchParams.set('q', val);
      else url.searchParams.delete('q');
      url.searchParams.delete('page');
      router.replace(url.pathname + url.search);
    }, 300);
  }

  // ── Per-page ──────────────────────────────────────────────────────────────
  function handlePerPage(e: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    url.searchParams.set('per', e.target.value);
    url.searchParams.set('page', '1');
    router.replace(url.pathname + url.search);
  }

  // ── Pagination URL ────────────────────────────────────────────────────────
  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('per',  String(perPage));
    params.set('page', String(Math.max(1, Math.min(p, totalPages))));
    return `/product-categories?${params}`;
  }

  return (
    <>
      {/* ── toolbar ── */}
      <div className="gg-table-toolbar">
        <div className="gg-input-icon" style={{ maxWidth: 460, width: '100%' }}>
          <Search size={18} />
          <input
            className="gg-input"
            placeholder="Search product categories…"
            defaultValue={q}
            onChange={handleSearch}
          />
        </div>
        <div className="gg-spacer" />
        <button type="button" className="gg-btn gg-btn--primary" onClick={openCreate}>
          <Plus size={17} /> Create Product Category
        </button>
      </div>

      {/* ── table ── */}
      <div className="gg-card gg-card-pad">
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ padding: 0, border: 'none' }}>
                    <div className="gg-empty-state">
                      <Layers size={42} style={{ color: 'var(--gray-300)' }} />
                      <p>{q ? `No categories match "${q}".` : 'No product categories yet.'}</p>
                      {!q && (
                        <button
                          type="button"
                          className="gg-btn gg-btn--primary"
                          style={{ marginTop: 'var(--sp-2)' }}
                          onClick={openCreate}
                        >
                          <Plus size={16} /> Create your first category
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id}>
                    {/* Logo + name */}
                    <td>
                      <div className="gg-row gg-gap-3">
                        <div className="cat-thumb">
                          {c.logo
                            ? <img src={c.logo} alt={c.name} />
                            : <Layers size={20} />}
                        </div>
                        <span className="gg-td-strong">{c.name}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="gg-row gg-gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="act-btn act-edit"
                          title="Edit"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          className="act-btn act-del"
                          title="Delete"
                          onClick={() => setDeleteTarget(c)}
                        >
                          <Trash2 size={18} />
                        </button>
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
            <select
              className="gg-select"
              style={{ width: 78, height: 38 }}
              defaultValue={perPage}
              onChange={handlePerPage}
            >
              {PER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <span className="gg-muted gg-num">{from}–{to} of {total}</span>

          <div className="gg-spacer" />

          <Link href={pageUrl(1)}          className="gg-page-btn" aria-label="First"><ChevronsLeft  size={17} /></Link>
          <Link href={pageUrl(page - 1)}   className="gg-page-btn" aria-label="Previous"><ChevronLeft   size={17} /></Link>
          <Link href={pageUrl(page + 1)}   className="gg-page-btn" aria-label="Next"><ChevronRight  size={17} /></Link>
          <Link href={pageUrl(totalPages)} className="gg-page-btn" aria-label="Last"><ChevronsRight size={17} /></Link>
        </div>
      </div>

       

      {/* ── create / edit modal ── */}
      {modalMode && (
        <CategoryModal
          key={modalMode === 'create' ? 'create' : String(editCategory!.id)}
          mode={modalMode}
          category={editCategory}
          action={
            modalMode === 'create'
              ? createCategory
              : (updateCategory.bind(null, editCategory!.id) as (
                  prev: CategoryState,
                  formData: FormData,
                ) => Promise<CategoryState>)
          }
          onClose={closeModal}
        />
      )}

      {/* ── delete confirmation modal ── */}
      {deleteTarget && (
        <DeleteCategoryModal
          category={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
