'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { changePassword, type ChangePasswordState } from './actions';

const INITIAL: ChangePasswordState = {};

function PwdField({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  show,
  onToggle,
  disabled,
  autoComplete,
}: {
  id:           string;
  name:         string;
  label:        string;
  placeholder:  string;
  value:        string;
  onChange:     (v: string) => void;
  show:         boolean;
  onToggle:     () => void;
  disabled:     boolean;
  autoComplete: string;
}) {
  return (
    <div className="gg-field">
      <label className="gg-label" htmlFor={id}>
        {label} <span className="gg-req">*</span>
      </label>
      <div className="gg-input-pwd">
        <input
          id={id}
          name={name}
          className="gg-input"
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={disabled}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="gg-pwd-toggle"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordForm() {
  const [state, action, isPending] = useActionState(changePassword, INITIAL);

  const [currentPwd,  setCurrentPwd]  = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!state.success && !state.error) return;

    if (state.success) {
      toast.success('Password updated successfully.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={action}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">Change Password</h1>
        <Link href="/profile" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>

          <PwdField
            id="currentPassword"
            name="currentPassword"
            label="Current Password"
            placeholder="Enter current password"
            value={currentPwd}
            onChange={setCurrentPwd}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
            disabled={isPending}
            autoComplete="current-password"
          />

          <PwdField
            id="newPassword"
            name="newPassword"
            label="New Password"
            placeholder="Min. 8 characters"
            value={newPwd}
            onChange={setNewPwd}
            show={showNew}
            onToggle={() => setShowNew((v) => !v)}
            disabled={isPending}
            autoComplete="new-password"
          />

          <PwdField
            id="confirmPassword"
            name="confirmPassword"
            label="Confirm New Password"
            placeholder="Repeat new password"
            value={confirmPwd}
            onChange={setConfirmPwd}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
            disabled={isPending}
            autoComplete="new-password"
          />

        </div>

        <div className="gg-form-actions">
          <button
            className="gg-btn gg-btn--primary"
            type="submit"
            disabled={isPending}
          >
            {isPending ? (
              <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Updating…</>
            ) : (
              <><Check size={17} /> Update Password</>
            )}
          </button>
          <Link href="/profile" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>
      </div>

      
    </form>
  );
}
