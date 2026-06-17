'use client';

import { useRouter } from 'next/navigation';

type Warehouse = { id: number; name: string };

export default function WrWarehouseFilter({
  warehouses,
  selectedId,
}: {
  warehouses: Warehouse[];
  selectedId: number | null;
}) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const url = new URL(window.location.href);
    if (e.target.value) url.searchParams.set('wh', e.target.value);
    else                url.searchParams.delete('wh');
    url.searchParams.delete('page');
    router.replace(url.pathname + url.search);
  }

  return (
    <div className="wh-filter">
      <label>Warehouse :</label>
      <select className="gg-select" defaultValue={selectedId ?? ''} onChange={handleChange}>
        <option value="">All Warehouse</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </div>
  );
}
