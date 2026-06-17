'use client';

import { useRouter } from 'next/navigation';

const SUBS = [
  { key: 'sales',            label: 'Sales' },
  { key: 'sale-returns',     label: 'Sales Returns' },
  { key: 'purchase-returns', label: 'Purchases Returns' },
  { key: 'expenses',         label: 'Expenses' },
] as const;

export default function WrSubTabs({ activeSub }: { activeSub: string }) {
  const router = useRouter();

  function handleClick(key: string) {
    const url = new URL(window.location.href);
    if (key === 'sales') url.searchParams.delete('sub');
    else                 url.searchParams.set('sub', key);
    url.searchParams.delete('q');
    url.searchParams.delete('page');
    router.push(url.pathname + url.search);
  }

  return (
    <div className="rpt-subtabs">
      {SUBS.map((s) => (
        <button
          key={s.key}
          className={`rpt-subtab${activeSub === s.key ? ' is-active' : ''}`}
          onClick={() => handleClick(s.key)}
          style={{ fontSize: 16, background: 'none', border: 'none', font: 'inherit' }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
