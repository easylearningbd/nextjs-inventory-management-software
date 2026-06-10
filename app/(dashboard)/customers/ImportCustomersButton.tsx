'use client';

import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ImportCustomersButton() {
  return (
    <button
      type="button"
      className="gg-btn gg-btn--secondary"
      onClick={() => toast('Import Customers — coming soon.')}
    >
      <Upload size={17} /> Import Customers
    </button>
  );
}
