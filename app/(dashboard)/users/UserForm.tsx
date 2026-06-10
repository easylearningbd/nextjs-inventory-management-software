'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, UserRound, Pencil, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import type { UserFormState } from './actions';

type UserData = {
  firstName:   string;
  lastName:    string;
  email:       string;
  phoneNumber: string | null;
  image:       string | null;
  role:        string;
};

type UserAction = (prev: UserFormState, formData: FormData) => Promise<UserFormState>;

type Props = {
  action:  UserAction;
  roles:   string[];   // fetched from Role table by parent server component
  user?:   UserData;
  mode:    'create' | 'edit';
};

export default function UserForm({ action, roles, user, mode }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  // Image preview
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(user?.image ?? null);

  // Password visibility toggles
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!state.success && !state.error) return;
    if (state.success) {
      toast.success(mode === 'create' ? 'User created successfully.' : 'User updated successfully.');
      router.push('/users');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const v = user;

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create User' : 'Edit User'}
        </h1>
        <Link href="/users" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── avatar uploader ── */}
        <div className="user-ava-wrap">
          <label className="gg-label" style={{ display: 'block', marginBottom: 'var(--sp-3)' }}>
            Change Image
          </label>
          <div className="user-ava">
            <div className="circ">
              {preview
                ? <img src={preview} alt="Avatar" />
                : <UserRound />}
            </div>
            <button
              type="button"
              className="edit"
              title="Pick a new image"
              onClick={() => fileInputRef.current?.click()}
            >
              <Pencil />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPreview(URL.createObjectURL(f));
            }}
          />
        </div>

        {/* ── fields ── */}
        <div className="exp-grid">

          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-first">
              First Name <span className="gg-req">*</span>
            </label>
            <input id="usr-first" name="firstName" className="gg-input"
              placeholder="Enter First Name" defaultValue={v?.firstName ?? ''}
              required disabled={isPending} />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-last">
              Last Name <span className="gg-req">*</span>
            </label>
            <input id="usr-last" name="lastName" className="gg-input"
              placeholder="Enter Last Name" defaultValue={v?.lastName ?? ''}
              required disabled={isPending} />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-email">
              Email <span className="gg-req">*</span>
            </label>
            <input id="usr-email" name="email" type="email" className="gg-input"
              placeholder="Enter Email" defaultValue={v?.email ?? ''}
              required disabled={isPending} />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-phone">Phone Number</label>
            <input id="usr-phone" name="phoneNumber" className="gg-input"
              placeholder="Enter Phone Number" defaultValue={v?.phoneNumber ?? ''}
              disabled={isPending} />
          </div>

          {/* Password — required on create, optional on edit */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-pwd">
              Password {mode === 'create' && <span className="gg-req">*</span>}
              {mode === 'edit' && <span className="gg-caption" style={{ marginLeft: 6 }}>(leave blank to keep current)</span>}
            </label>
            <div className="gg-input-pwd">
              <input
                id="usr-pwd"
                name="password"
                type={showPwd ? 'text' : 'password'}
                className="gg-input"
                placeholder={mode === 'create' ? 'Min. 8 characters' : 'New password (optional)'}
                required={mode === 'create'}
                disabled={isPending}
                autoComplete={mode === 'create' ? 'new-password' : 'new-password'}
              />
              <button type="button" className="gg-pwd-toggle" tabIndex={-1}
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide' : 'Show'}>
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-confirm">
              Confirm Password {mode === 'create' && <span className="gg-req">*</span>}
            </label>
            <div className="gg-input-pwd">
              <input
                id="usr-confirm"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                className="gg-input"
                placeholder="Repeat password"
                required={mode === 'create'}
                disabled={isPending}
                autoComplete="new-password"
              />
              <button type="button" className="gg-pwd-toggle" tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide' : 'Show'}>
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Role — populated from the Role table */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="usr-role">
              Role <span className="gg-req">*</span>
            </label>
            <select id="usr-role" name="role" className="gg-select"
              defaultValue={v?.role ?? ''} required disabled={isPending}>
              <option value="" disabled>Choose Role</option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

        </div>

        {/* ── actions ── */}
        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            {isPending
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Check size={17} /> Save</>}
          </button>
          <Link href="/users" className="gg-btn gg-btn--secondary">Cancel</Link>
        </div>
      </div>

      
    </form>
  );
}
