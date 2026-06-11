'use client';

import { useRouter } from 'next/navigation';

const PER_OPTIONS = [10, 25, 50];

export default function AdjustmentPerPage({ perPage }: { perPage: number }) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    url.searchParams.set('per',  e.target.value);
    url.searchParams.set('page', '1');
    router.replace(url.pathname + url.search);
  }

  return (
    <select
      className="gg-select"
      style={{ width: 78, height: 38 }}
      defaultValue={perPage}
      onChange={handleChange}
    >
      {PER_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}
