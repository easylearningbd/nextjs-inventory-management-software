'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { SupplierState } from './actions';

type SupplierData = {
  name:        string;
  email:       string | null;
  phoneNumber: string | null;
  country:     string | null;
  city:        string | null;
  address:     string | null;
};

type SupplierAction = (
  prev: SupplierState,
  formData: FormData,
) => Promise<SupplierState>;

type Props = {
  action:    SupplierAction;
  supplier?: SupplierData;
  mode:      'create' | 'edit';
};

export default function SupplierForm({ action, supplier, mode }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  useEffect(() => {
    if (!state.success && !state.error) return;

    if (state.success) {
      toast.success(
        mode === 'create' ? 'Supplier created successfully.' : 'Supplier updated successfully.',
      );
      router.push('/suppliers');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const v = supplier;

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create Supplier' : 'Edit Supplier'}
        </h1>
        <Link href="/suppliers" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="exp-grid">

          {/* Name — required */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-name">
              Name <span className="gg-req">*</span>
            </label>
            <input
              id="sp-name"
              name="name"
              className="gg-input"
              placeholder="Enter Name"
              defaultValue={v?.name ?? ''}
              required
              disabled={isPending}
            />
          </div>

          {/* Email */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-email">Email</label>
            <input
              id="sp-email"
              name="email"
              type="email"
              className="gg-input"
              placeholder="Enter Email"
              defaultValue={v?.email ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Phone Number */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-phone">Phone Number</label>
            <input
              id="sp-phone"
              name="phoneNumber"
              className="gg-input"
              placeholder="Phone Number"
              defaultValue={v?.phoneNumber ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Country */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-country">Country</label>
            <input
              id="sp-country"
              name="country"
              className="gg-input"
              placeholder="Enter Country"
              defaultValue={v?.country ?? ''}
              disabled={isPending}
            />
          </div>

          {/* City */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-city">City</label>
            <input
              id="sp-city"
              name="city"
              className="gg-input"
              placeholder="Enter City"
              defaultValue={v?.city ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Address — note: address not zipCode (differs from Warehouse) */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="sp-address">Address</label>
            <input
              id="sp-address"
              name="address"
              className="gg-input"
              placeholder="Enter Address"
              defaultValue={v?.address ?? ''}
              disabled={isPending}
            />
          </div>

        </div>

        {/* ── actions ── */}
        <div className="gg-form-actions">
          <button className="gg-btn gg-btn--primary" type="submit" disabled={isPending}>
            {isPending ? (
              <><Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
            ) : (
              <><Check size={17} /> Save</>
            )}
          </button>
          <Link href="/suppliers" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>
      </div>

      
    </form>
  );
}
