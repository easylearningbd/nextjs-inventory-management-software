'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MoreVertical, Eye, FileDown, DollarSign, CornerUpRight,
  Pencil, Trash2, X, AlertTriangle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteSale } from './actions';

type Props = {
  id:            number;
  reference:     string;
  status:        string;
  paymentStatus: string;
};

export default function SaleRowMenu({ id, reference, status, paymentStatus }: Props) {
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
      const result = await deleteSale(id);
      setDelOpen(false);
      if (result.success) {
        toast.success(`Sale "${reference}" deleted.`);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to delete sale.');
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
          <div className="gg-menu" style={{ display: 'block' }}>
            <Link
              href={`/sales/${id}`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Eye size={15} /> View Sale
            </Link>
            <Link
              href={`/sales/${id}/pdf`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <FileDown size={15} /> Download PDF
            </Link>
            <Link
              href={`/sales/${id}/payments`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <DollarSign size={15} /> Show Payments
            </Link>
            <Link
              href={`/sales-returns/create?saleId=${id}`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <CornerUpRight size={15} /> Create Sale Return
            </Link>
            <Link
              href={`/sales/${id}/edit`}
              className="gg-menu-item"
              onClick={() => setMenuOpen(false)}
            >
              <Pencil size={15} /> Edit Sale
            </Link>
            <button
              type="button"
              className="gg-menu-item is-danger"
              onClick={openDelete}
            >
              <Trash2 size={15} /> Delete Sale
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
              <span className="gg-card-title">Delete Sale</span>
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
                    Delete sale <strong>{reference}</strong>?
                  </p>
                  {status === 'Received' ? (
                    <p style={{ margin: '6px 0 0', color: 'var(--danger)', fontSize: 13 }}>
                      This sale has status <strong>Received</strong>. Deleting it will
                      add the sold stock back to the warehouse.
                    </p>
                  ) : (
                    <p style={{ margin: '6px 0 0', color: 'var(--gray-500)', fontSize: 13 }}>
                      This action cannot be undone. The sale record will be removed.
                    </p>
                  )}
                  {paymentStatus !== 'Unpaid' && (
                    <p style={{ margin: '6px 0 0', color: 'var(--warning-fg)', fontSize: 13 }}>
                      This sale has recorded payments. Deleting it will not refund any money automatically.
                    </p>
                  )}
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
                  : <><Trash2 size={16} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
