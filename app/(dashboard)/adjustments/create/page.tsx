import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import AdjustmentForm from './AdjustmentForm';

export default async function CreateAdjustmentPage() {
  const session = await auth();
  if (!session) redirect('/');

  const warehouses = await db.warehouse.findMany({
    where:   { deletedAt: null },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Create Adjustment</h1>
        <Link href="/adjustments" className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <AdjustmentForm warehouses={warehouses} />
    </>
  );
}
