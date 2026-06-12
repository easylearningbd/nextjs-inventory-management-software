import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import PurchaseForm from '../PurchaseForm';

export default async function CreatePurchasePage() {
  const session = await auth();
  if (!session) redirect('/');

  const [warehouses, suppliers, units] = await Promise.all([
    db.warehouse.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.supplier.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.unit.findMany({
      where:   { deletedAt: null },
      select:  { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <h1 className="gg-page-title">Create Purchase</h1>
        <Link href="/purchases" className="gg-btn gg-btn--secondary gg-btn--sm">
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <PurchaseForm
        warehouses={warehouses}
        suppliers={suppliers}
        units={units}
      />
    </>
  );
}
