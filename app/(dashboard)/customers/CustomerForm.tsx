'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CustomerState } from './actions';

type CustomerData = {
  name:        string;
  email:       string | null;
  phoneNumber: string | null;
  dateOfBirth: Date | null;
  country:     string | null;
  city:        string | null;
  address:     string | null;
};

type CustomerAction = (
  prev: CustomerState,
  formData: FormData,
) => Promise<CustomerState>;

type Props = {
  action:    CustomerAction;
  customer?: CustomerData;
  mode:      'create' | 'edit';
};

// Convert a Date to "YYYY-MM-DD" for <input type="date">.
// Uses UTC parts to avoid timezone offset shifting the stored date.
function toDateInput(d: Date | null | undefined): string {
  if (!d) return '';
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CustomerForm({ action, customer, mode }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, {});

  useEffect(() => {
    if (!state.success && !state.error) return;

    if (state.success) {
      toast.success(
        mode === 'create' ? 'Customer created successfully.' : 'Customer updated successfully.',
      );
      router.push('/customers');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const v = customer;

  return (
    <form action={formAction}>
      {/* ── page header ── */}
      <div className="page-head">
        <h1 className="gg-page-title">
          {mode === 'create' ? 'Create Customer' : 'Edit Customer'}
        </h1>
        <Link href="/customers" className="gg-btn gg-btn--secondary">
          <ArrowLeft size={17} /> Back
        </Link>
      </div>

      <div className="gg-card gg-card-pad">
        <div className="exp-grid">

          {/* Name — required */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="cu-name">
              Name <span className="gg-req">*</span>
            </label>
            <input
              id="cu-name"
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
            <label className="gg-label" htmlFor="cu-email">Email</label>
            <input
              id="cu-email"
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
            <label className="gg-label" htmlFor="cu-phone">Phone Number</label>
            <input
              id="cu-phone"
              name="phoneNumber"
              className="gg-input"
              placeholder="Enter Phone Number"
              defaultValue={v?.phoneNumber ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Date of Birth — optional date picker */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="cu-dob">DOB</label>
            <div className="date-field">
              <input
                id="cu-dob"
                name="dateOfBirth"
                type="date"
                className="gg-input gg-num"
                defaultValue={toDateInput(v?.dateOfBirth)}
                disabled={isPending}
              />
              <Calendar />
            </div>
          </div>

          {/* Country */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="cu-country">Country</label>
            <input
              id="cu-country"
              name="country"
              className="gg-input"
              placeholder="Enter Country"
              defaultValue={v?.country ?? ''}
              disabled={isPending}
            />
          </div>

          {/* City */}
          <div className="gg-field">
            <label className="gg-label" htmlFor="cu-city">City</label>
            <input
              id="cu-city"
              name="city"
              className="gg-input"
              placeholder="Enter City"
              defaultValue={v?.city ?? ''}
              disabled={isPending}
            />
          </div>

          {/* Address — textarea, spans both columns */}
          <div className="gg-field" style={{ gridColumn: 'span 2' }}>
            <label className="gg-label" htmlFor="cu-address">Address</label>
            <textarea
              id="cu-address"
              name="address"
              className="gg-textarea"
              placeholder="Enter Address"
              style={{ minHeight: 120 }}
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
          <Link href="/customers" className="gg-btn gg-btn--secondary">
            Cancel
          </Link>
        </div>
      </div>

       
    </form>
  );
}
