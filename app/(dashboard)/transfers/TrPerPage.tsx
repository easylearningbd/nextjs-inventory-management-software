'use client';

import { useRouter } from 'next/navigation';

export default function TrPerPage({ perPage }: { perPage: number }) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    url.searchParams.set('per', e.target.value);
    url.searchParams.delete('page');
    router.replace(url.pathname + url.search);
  }

  return (
    <select className="gg-select" style={{ width: 70 }} value={perPage} onChange={handleChange}>
      <option value={10}>10</option>
      <option value={25}>25</option>
      <option value={50}>50</option>
    </select>
  );
}
