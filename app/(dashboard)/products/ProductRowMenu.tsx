'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Eye, Pencil, Trash2,
  X, AlertTriangle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteProduct } from './actions';

type Props = { id: number; name: string };

export default function ProductRowMenu({ id, name }: Props) {
  const router                       = useRouter();
  const [menuOpen, setMenuOpen]      = useState(false);
  const [delOpen,  setDelOpen]       = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  function openDelete() {
    setMenuOpen(false);
    setDelOpen(true);
  }

  function handleConfirmDelete() {
    startTransition(async () => {
      const result = await deleteProduct(id);
      setDelOpen(false);
      if (result.success) {
        toast.success(`"${name}" has been deleted.`);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to delete product.');
      }
    });
  }

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          type="button"
          className="gg-row-action"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Row actions"
        >
          <MoreVertical size={17} />
        </button>

        {menuOpen && (
          <div className="gg-menu">
            <Link
              href={`/products/${id}`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Eye size={15} /> View Product
            </Link>
            <Link
              href={`/products/${id}/edit`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Pencil size={15} /> Edit Product
            </Link>
            <button
              type="button"
              className="gg-menu-item is-danger"
              onClick={openDelete}
            >
              <Trash2 size={15} /> Delete Product
            </button>
          </div>
        )}
      </div>

      {delOpen && (
        <div
          className="gg-overlay is-open"
          onClick={(e) => e.target === e.currentTarget && !isPending && setDelOpen(false)}
        >
          <div className="gg-modal">
            <div className="gg-modal-head">
              <span className="gg-card-title">Delete Product</span>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setDelOpen(false)}
                disabled={isPending}
              >
                <X size={18} />
              </button>
            </div>

            <div className="gg-modal-body">
              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 500 }}>
                    Are you sure you want to delete <strong>{name}</strong>?
                  </p>
                  <p style={{ margin: '6px 0 0', color: 'var(--gray-500)', fontSize: 13 }}>
                    The product will be soft-deleted. If it is referenced by any
                    purchases, sales, or transfers the deletion will be blocked.
                  </p>
                </div>
              </div>
            </div>

            <div className="gg-modal-foot">
              <button
                type="button"
                className="gg-btn gg-btn--secondary"
                onClick={() => setDelOpen(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gg-btn gg-btn--danger"
                onClick={handleConfirmDelete}
                disabled={isPending}
              >
                {isPending
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                  : <><Trash2 size={16} /> Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
