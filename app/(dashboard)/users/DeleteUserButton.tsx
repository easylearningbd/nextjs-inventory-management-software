'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

type Props = { id: number; name: string; isCurrentUser: boolean };

export default function DeleteUserButton({ id, name, isCurrentUser }: Props) {
  const router = useRouter();
  const [open, setOpen]              = useState(false);
  const [isPending, startTransition] = useTransition();

  // A user cannot delete their own account.
  // Checking here avoids even rendering the confirmation dialog.
  if (isCurrentUser) return null;

  function handleConfirm() {
    startTransition(async () => {
      // Delete action wired in Step 4 (soft-delete + last-admin guard).
      void id;
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        className="act-del"
        title="Delete"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={17} />
      </button>

      {open && (
        <div
          className="gg-overlay is-open"
          onClick={(e) =>
            e.target === e.currentTarget && !isPending && setOpen(false)
          }
        >
          <div className="gg-modal">
            <div className="gg-modal-head">
              <span className="gg-card-title">Delete User</span>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                <X size={18} />
              </button>
            </div>

            <div className="gg-modal-body">
              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                <AlertTriangle
                  size={20}
                  style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <p style={{ margin: 0, color: 'var(--ink)', fontWeight: 500 }}>
                    Are you sure you want to delete <strong>{name}</strong>?
                  </p>
                  <p style={{ margin: '6px 0 0', color: 'var(--gray-500)', fontSize: 13 }}>
                    The account will be soft-deleted and the user will no longer
                    be able to log in.
                  </p>
                </div>
              </div>
            </div>

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
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                ) : (
                  <><Trash2 size={16} /> Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
