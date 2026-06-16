'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PERMISSIONS } from '@/lib/permissions';
import type { RoleState } from './actions';

export type RoleInitial = {
  name:        string;
  permissions: string[];
};

type Action = (prev: RoleState, formData: FormData) => Promise<RoleState>;

type Props = {
  action:   Action;
  mode:     'create' | 'edit';
  initial?: RoleInitial;
};

export default function RoleForm({ action, mode, initial }: Props) {
  const [state, formAction, isPending] = useActionState(action, {});

  // Controlled checkbox state — drives both the grid and the "All" toggle.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(initial?.permissions ?? []),
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const allChecked  = PERMISSIONS.every((p) => checked.has(p));
  const someChecked = PERMISSIONS.some((p)  => checked.has(p));

  // Drive the native indeterminate property (not expressible in JSX).
  const allRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allRef.current) {
      allRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  function handleAllChange(e: React.ChangeEvent<HTMLInputElement>) {
    setChecked(e.target.checked ? new Set(PERMISSIONS) : new Set());
  }

  function handlePermChange(perm: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(perm); else next.delete(perm);
      return next;
    });
  }

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create Role' : 'Edit Role'}
        </h1>
        <Link href="/roles" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* Name */}
        <div className="gg-field" style={{ maxWidth: 480 }}>
          <label className="gg-label" htmlFor="role-name">
            Name <span className="gg-req">*</span>
          </label>
          <input
            id="role-name"
            name="name"
            className="gg-input"
            placeholder="Enter Name"
            defaultValue={initial?.name ?? ''}
            required
            disabled={isPending}
          />
        </div>

        {/* Permissions header */}
        <div className="perm-head">
          <span className="lbl">
            Permissions <span className="gg-req">*</span>
          </span>
          <label className="perm-all">
            <input
              ref={allRef}
              type="checkbox"
              className="gg-check"
              checked={allChecked}
              onChange={handleAllChange}
              disabled={isPending}
            />
            <span style={{ color: 'var(--gray-700)', fontSize: 14 }}>
              All Permissions
            </span>
          </label>
        </div>

        {/* Permission grid — rendered from canonical constant, never hardcoded */}
        <div className="perm-grid">
          {PERMISSIONS.map((perm) => (
            <label key={perm} className="perm-item">
              <input
                type="checkbox"
                name="permissions"
                value={perm}
                className="gg-check"
                checked={checked.has(perm)}
                onChange={(e) => handlePermChange(perm, e.target.checked)}
                disabled={isPending}
              />
              <span>{perm}</span>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            {isPending
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Check size={17} /> Save</>}
          </button>
          <Link href="/roles" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>

      </div>
    </form>
  );
}
