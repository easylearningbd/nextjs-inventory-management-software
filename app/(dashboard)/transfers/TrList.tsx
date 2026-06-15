'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { deleteTransfer } from './actions';

export type TrRow = {
  id:              number;
  reference:       string;
  fromWarehouse:   string;
  toWarehouse:     string;
  itemCount:       number;
  grandTotal:      number;
  status:          string;
  createdAt:       string; // ISO string
};

const STATUS_BADGE: Record<string, string> = {
  Completed: 'gg-badge gg-badge--success',
  Sent:      'gg-badge gg-badge--info',
  Pending:   'gg-badge gg-badge--warning',
};

function fmtMoney(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC',
  });
}

export default function TrList({ rows }: { rows: TrRow[] }) {
  const router = useRouter();
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [delTarget, setDelTarget]   = useState<TrRow | null>(null);
  const [delError,  setDelError]    = useState('');
  const [pending,   startTransition] = useTransition();

  const allCheckRef = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.indeterminate = selected.size > 0 && selected.size < rows.length;
  }, [selected, rows.length]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  function toggleRow(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function openDelete(row: TrRow) {
    setDelTarget(row);
    setDelError('');
  }

  function closeDelete() {
    setDelTarget(null);
    setDelError('');
  }

  function confirmDelete() {
    if (!delTarget) return;
    startTransition(async () => {
      const res = await deleteTransfer(delTarget.id);
      if (res.error) {
        setDelError(res.error);
      } else {
        closeDelete();
        router.refresh();
      }
    });
  }

  return (
    <>
      <table className="gg-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>
              <input
                type="checkbox"
                className="gg-check"
                ref={allCheckRef}
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </th>
            <th>Reference</th>
            <th>From Warehouse</th>
            <th>To Warehouse</th>
            <th>Items</th>
            <th>Grand Total</th>
            <th>Status</th>
            <th>Created On</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--gray-400)' }}>
                No transfers found.
              </td>
            </tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              <td>
                <input
                  type="checkbox"
                  className="gg-check"
                  checked={selected.has(row.id)}
                  onChange={(e) => toggleRow(row.id, e.target.checked)}
                />
              </td>
              <td>
                <span className="gg-chip-code gg-num">{row.reference}</span>
              </td>
              <td>{row.fromWarehouse}</td>
              <td>{row.toWarehouse}</td>
              <td className="gg-num">{row.itemCount}</td>
              <td className="gg-num gg-td-strong">{fmtMoney(row.grandTotal)}</td>
              <td>
                <span className={STATUS_BADGE[row.status] ?? 'gg-badge'}>
                  {row.status}
                </span>
              </td>
              <td>
                <span className="gg-chip-time gg-num">
                  {fmtTime(row.createdAt)}<br />{fmtDate(row.createdAt)}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <div className="row-acts">
                  <Link href={`/transfers/${row.id}`} className="act-view" title="View">
                    <Eye size={17} />
                  </Link>
                  <Link href={`/transfers/${row.id}/edit`} className="act-edit" title="Edit">
                    <Pencil size={17} />
                  </Link>
                  <button className="act-del" title="Delete" onClick={() => openDelete(row)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {delTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeDelete(); }}
        >
          <div className="gg-card" style={{ width: 420, padding: 'var(--sp-6)', borderRadius: 'var(--r-lg)' }}>
            <h3 style={{ margin: '0 0 var(--sp-3)', fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
              Delete Transfer
            </h3>

            <p style={{ margin: '0 0 var(--sp-4)', fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.5 }}>
              Are you sure you want to delete{' '}
              <strong>{delTarget.reference}</strong>?
              {delTarget.status === 'Completed' && (
                <> This transfer is <strong>Completed</strong> — deleting it will
                reverse the stock movement (stock will be added back to the source
                warehouse and removed from the destination warehouse).</>
              )}
            </p>

            {delError && (
              <p style={{ margin: '0 0 var(--sp-4)', fontSize: 13.5, color: 'var(--danger)', fontWeight: 500 }}>
                {delError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end' }}>
              <button type="button" className="gg-btn gg-btn--secondary gg-btn--sm" onClick={closeDelete}>
                Cancel
              </button>
              <button
                type="button"
                className="gg-btn gg-btn--danger gg-btn--sm"
                onClick={confirmDelete}
                disabled={pending}
              >
                {pending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
