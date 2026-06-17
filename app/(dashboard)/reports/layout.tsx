import { can } from '@/lib/can';

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const denied = await can('Manage Reports');
  if (denied) {
    return (
      <div className="gg-empty-state">
        <p>{denied}</p>
      </div>
    );
  }
  return <>{children}</>;
}
