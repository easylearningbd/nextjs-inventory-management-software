'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteWarehouse } from './actions';

type Props = { id: number; name: string };

export default function DeleteWarehouseButton({ id, name }: Props) {
  const router = useRouter();
  const [open, setOpen]                  = useState(false);
  const [isPending, startTransition]     = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteWarehouse(id);

      if (result.success) {
        setOpen(false);
        toast.success(`"${name}" has been deleted.`);
        router.refresh(); // re-fetch the server component list
      } else {
        setOpen(false);
        toast.error(result.error ?? 'Failed to delete warehouse.');
      }
    });
  }

  return (
    <>
      {/* ── trigger ── */}
      <button
        type="button"
        className="act-del"
        title="Delete"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={17} />
      </button>

      {/* ── confirmation modal ── */}
      {open && (
        <div
          className="gg-overlay is-open"
          onClick={(e) =>
            e.target === e.currentTarget && !isPending && setOpen(false)
          }
        >
          <div className="gg-modal">
            {/* head */}
            <div className="gg-modal-head">
              <span className="gg-card-title">Delete Warehouse</span>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                <X size={18} />
              </button>
            </div>

            {/* body */}
            <div className="gg-modal-body">
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-3)',
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle
                  size={20}
                  style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 500 }}>
                    Are you sure you want to delete{' '}
                    <strong>{name}</strong>?
                  </p>
                  <p
                    style={{
                      margin: '6px 0 0',
                      color: 'var(--gray-500)',
                      fontSize: 13,
                    }}
                  >
                    The warehouse will be soft-deleted. If it is currently
                    referenced by stock, sales, or purchases the deletion will
                    be blocked and you will see an explanatory message.
                  </p>
                </div>
              </div>
            </div>

            {/* foot */}
            <div className="gg-modal-foot">
              <button
                type="button"
                className="gg-btn gg-btn--secondary"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gg-btn gg-btn--danger"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2
                      size={16}
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
