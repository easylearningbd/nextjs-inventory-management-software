'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export default function SupplierSearch({ defaultQ }: { defaultQ: string }) {
  const router   = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const url = new URL(window.location.href);
      if (val) url.searchParams.set('q', val);
      else url.searchParams.delete('q');
      url.searchParams.delete('page');
      router.replace(url.pathname + url.search);
    }, 300);
  }

  return (
    <div className="gg-input-icon" style={{ maxWidth: 460, width: '100%' }}>
      <Search size={18} />
      <input
        className="gg-input"
        placeholder="Search by name, email or city…"
        defaultValue={defaultQ}
        onChange={handleChange}
      />
    </div>
  );
}
