'use client';

import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ImportSuppliersButton() {
  return (
    <button
      type="button"
      className="gg-btn gg-btn--secondary"
      onClick={() => toast('Import Suppliers — coming soon.')}
    >
      <Upload size={17} /> Import Suppliers
    </button>
  );
}
