'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, Loader2, Image as ImageIcon, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CategoryRow } from './CategoriesClient';
import type { CategoryState } from './actions';

type CategoryAction = (prev: CategoryState, formData: FormData) => Promise<CategoryState>;

type Props = {
  mode:     'create' | 'edit';
  category: CategoryRow | null;
  action:   CategoryAction;
  onClose:  () => void;
};

export default function CategoryModal({ mode, category, action, onClose }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(category?.logo ?? null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, isPending]);

  // Toast + refresh + close on result
  useEffect(() => {
    if (!state.success && !state.error) return;
    if (state.success) {
      toast.success(mode === 'create' ? 'Category created.' : 'Category updated.');
      router.refresh();
      onClose();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div
      className="gg-overlay is-open"
      onClick={(e) => e.target === e.currentTarget && !isPending && onClose()}
    >
      <div className="gg-modal" role="dialog" aria-modal="true">

        {/* ── head ── */}
        <div className="gg-modal-head">
          <span className="gg-card-title">
            {mode === 'create' ? 'Create Product Category' : 'Edit Product Category'}
          </span>
          <button
            type="button"
            className="gg-modal-close"
            onClick={onClose}
            disabled={isPending}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── body + foot inside form so FormData includes all fields ── */}
        <form action={formAction}>
          <div className="gg-modal-body">

            {/* Name */}
            <div className="gg-field">
              <label className="gg-label" htmlFor="cat-name">
                Name <span className="gg-req">*</span>
              </label>
              <input
                id="cat-name"
                name="name"
                className="gg-input"
                placeholder="Enter Name"
                defaultValue={category?.name ?? ''}
                required
                disabled={isPending}
                autoFocus
              />
            </div>

            {/* Logo uploader */}
            <div className="gg-field">
              <label className="gg-label">Change Logo</label>
              <div className="logo-drop">
                {preview
                  ? <img src={preview} alt="Logo preview" />
                  : <ImageIcon className="ph" />}
                <button
                  type="button"
                  className="logo-edit"
                  title="Pick logo image"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Pencil size={15} />
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                name="logo"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPreview(URL.createObjectURL(f));
                }}
              />
            </div>

          </div>

          {/* ── foot ── */}
          <div className="gg-modal-foot">
            <button
              type="submit"
              className="gg-btn gg-btn--primary"
              disabled={isPending}
            >
              {isPending
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <><Check size={16} /> Save</>}
            </button>
            <button
              type="button"
              className="gg-btn gg-btn--secondary"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
