'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, UserRound, Check, AlertCircle, Loader2 } from 'lucide-react';
import { updateProfile, type ProfileState } from './actions';

type UserSnapshot = {
  firstName:   string;
  lastName:    string;
  email:       string;
  phoneNumber: string | null;
  image:       string | null;
  role:        string;
};

const INITIAL: ProfileState = {};

export default function ProfileForm({ user }: { user: UserSnapshot }) {
  const router = useRouter();

  const [state, action, isPending] = useActionState(updateProfile, INITIAL);

  // Image preview — starts from the stored URL, switches to a blob URL on new pick
  const [preview, setPreview]   = useState<string | null>(user.image);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  // After a successful save, refresh server components so the topbar
  // picks up the new name / avatar from the updated JWT.
  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  }

  return (
    <form action={action}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">My Profile</h1>
        <Link href="/dashboard" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">

        {/* ── success banner ── */}
        {state.success && (
          <div className="form-success" role="status">
            <Check size={16} style={{ flexShrink: 0 }} />
            Profile updated successfully.
          </div>
        )}

        {/* ── error banner ── */}
        {state.error && (
          <div className="auth-error" role="alert">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            {state.error}
          </div>
        )}

        {/* ── avatar uploader ── */}
        <div className="user-ava-wrap">
          <label className="gg-label" style={{ display: 'block', marginBottom: 'var(--sp-3)' }}>
            Change Image
          </label>
          <div className="user-ava">
            <div className="circ">
              {preview
                ? <img src={preview} alt="Profile avatar" />
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
          {/* Hidden file input — triggered by the pencil button above */}
          <input
            ref={fileInputRef}
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={handleImagePick}
          />
        </div>

        {/* ── form fields ── */}
        <div className="exp-grid">
          <div className="gg-field">
            <label className="gg-label" htmlFor="firstName">
              First Name <span className="gg-req">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              className="gg-input"
              placeholder="Enter First Name"
              defaultValue={user.firstName}
              required
              disabled={isPending}
            />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="lastName">
              Last Name <span className="gg-req">*</span>
            </label>
            <input
              id="lastName"
              name="lastName"
              className="gg-input"
              placeholder="Enter Last Name"
              defaultValue={user.lastName}
              required
              disabled={isPending}
            />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="email">
              Email <span className="gg-req">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="gg-input"
              placeholder="Enter Email"
              defaultValue={user.email}
              required
              disabled={isPending}
            />
          </div>

          <div className="gg-field">
            <label className="gg-label" htmlFor="phoneNumber">
              Phone Number
            </label>
            <input
              id="phoneNumber"
              name="phoneNumber"
              className="gg-input"
              placeholder="Enter Phone Number"
              defaultValue={user.phoneNumber ?? ''}
              disabled={isPending}
            />
          </div>

          {/*
            Role is intentionally NOT rendered as an editable field.
            Users must not be able to change their own role (privilege escalation).
            Admins manage roles from the Users management page.
          */}
          <div className="gg-field">
            <label className="gg-label">Role</label>
            <input
              className="gg-input"
              value={user.role}
              disabled
              readOnly
              title="Role can only be changed by an administrator"
            />
          </div>
        </div>

        {/* ── actions ── */}
        <div className="gg-form-actions">
          <button
            className="gg-btn gg-btn--primary"
            type="submit"
            disabled={isPending}
          >
            {isPending
              ? <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Check size={17} /> Save Changes</>}
          </button>
          <Link href="/dashboard" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>
      </div> 
     
    </form>
  );
}
