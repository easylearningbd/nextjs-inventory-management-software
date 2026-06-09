'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { WarehouseState } from './actions';

type WarehouseData = {
  name:        string;
  email:       string | null;
  phoneNumber: string | null;
  country:     string | null;
  city:        string | null;
  zipCode:     string | null;
};

type WarehouseAction = (
  prev: WarehouseState,
  formData: FormData,
) => Promise<WarehouseState>;

type Props = {
  action:     WarehouseAction;
  warehouse?: WarehouseData;
  mode:       'create' | 'edit';
};

export default function WarehouseForm({ action, warehouse, mode }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  useEffect(() => {
    if (!state.success && !state.error) return;

    if (state.success) {
      toast.success(
        mode === 'create' ? 'Warehouse created successfully.' : 'Warehouse updated successfully.',
      );
      router.push('/warehouse');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const v = warehouse; // shorthand for defaultValue access

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create Warehouse' : 'Edit Warehouse'}
        </h1>
        <Link href="/warehouse" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="exp-grid">

          {/* Name — required */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="wh-name">
              Name <span className="gg-req">*</span>
            </label>
            <input
              id="wh-name"
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
            <label className="gg-label" htmlFor="wh-email">Email</label>
            <input
              id="wh-email"
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
            <label className="gg-label" htmlFor="wh-phone">Phone Number</label>
            <input
              id="wh-phone"
              name="phoneNumber"
              className="gg-input"
              placeholder="Phone Number"
              defaultValue={v?.phoneNumber ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Country */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="wh-country">Country</label>
            <input
              id="wh-country"
              name="country"
              className="gg-input"
              placeholder="Enter Country"
              defaultValue={v?.country ?? ''}
              disabled={isPending}
            />
          </div>

          {/* City */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="wh-city">City</label>
            <input
              id="wh-city"
              name="city"
              className="gg-input"
              placeholder="Enter City"
              defaultValue={v?.city ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Zip Code */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="wh-zip">Zip Code</label>
            <input
              id="wh-zip"
              name="zipCode"
              className="gg-input"
              placeholder="Enter Zip Code"
              defaultValue={v?.zipCode ?? ''}
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
          <Link href="/warehouse" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>
      </div>

       
    </form>
  );
}
