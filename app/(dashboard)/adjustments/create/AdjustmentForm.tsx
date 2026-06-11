'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Minus, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createAdjustment, searchProductsForAdjustment } from '../actions';
import type { AdjustmentState, SearchProduct } from '../actions';

type Warehouse = { id: number; name: string };

type LineItem = SearchProduct & {
  quantity: number;
  type:     'Addition' | 'Subtraction';
};

export default function AdjustmentForm({ warehouses }: { warehouses: Warehouse[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<AdjustmentState, FormData>(
    createAdjustment,
    {},
  );

  // Header fields (controlled so we can react to warehouse change)
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [date, setDate]               = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );

  // Order-items table
  const [items, setItems] = useState<LineItem[]>([]);

  // Product search
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<SearchProduct[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, startSearch]  = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Toast + redirect on action response
  useEffect(() => {
    if (state.error)   toast.error(state.error);
    if (state.success) router.push('/adjustments');
  }, [state, router]);

  // ── warehouse change: reset items + search ──────────────────────────────────
  function handleWarehouseChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setWarehouseId(val ? parseInt(val, 10) : '');
    setItems([]);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  // ── debounced product search ─────────────────────────────────────────────────
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(searchTimer.current);

    if (!warehouseId || !q.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchProductsForAdjustment(q.trim(), warehouseId as number);
        setResults(res);
        setShowResults(true);
      });
    }, 300);
  }

  // ── add product to table (no duplicates) ────────────────────────────────────
  function addItem(product: SearchProduct) {
    if (items.some((i) => i.id === product.id)) return;
    setItems((prev) => [...prev, { ...product, quantity: 1, type: 'Addition' }]);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  // ── line-item mutations ──────────────────────────────────────────────────────
  function updateQty(id: number, qty: number) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, qty) } : i)),
    );
  }

  function updateType(id: number, type: 'Addition' | 'Subtraction') {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, type } : i)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // Serialised items sent as a hidden field so the server action can read them
  // from FormData without needing one hidden input per item.
  const itemsJson = JSON.stringify(
    items.map(({ id: productId, quantity, type }) => ({ productId, quantity, type })),
  );

  return (
    <form action={formAction}>
      <div className="gg-card gg-card-pad">

        {/* ── Warehouse + Date ──────────────────────────────────────────────── */}
        <div className="adj-top">
          <div className="gg-field">
            <label className="gg-label">
              Warehouse <span className="gg-req">*</span>
            </label>
            <select
              name="warehouseId"
              className="gg-select"
              value={warehouseId}
              onChange={handleWarehouseChange}
            >
              <option value="">Select warehouse…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div className="gg-field">
            <label className="gg-label">
              Date <span className="gg-req">*</span>
            </label>
            <input
              name="date"
              type="date"
              className="gg-input gg-num"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* ── Product search ────────────────────────────────────────────────── */}
        <div
          className="gg-field"
          style={{ marginBottom: 'var(--sp-6)', position: 'relative' }}
        >
          <label className="gg-label">Product</label>

          <div className="gg-input-icon">
            {isSearching
              ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite', color: 'var(--gray-400)' }} />
              : <Search size={17} />
            }
            <input
              className="gg-input"
              placeholder={
                warehouseId
                  ? 'Search by name or code…'
                  : 'Select a warehouse first'
              }
              disabled={!warehouseId}
              value={query}
              onChange={handleQueryChange}
              onBlur={() => setTimeout(() => setShowResults(false), 150)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              autoComplete="off"
            />
          </div>

          {/* Autocomplete dropdown */}
          {showResults && (
            <div className="adj-search-results">
              {results.length === 0 ? (
                <p className="adj-search-empty">No products found.</p>
              ) : (
                results.map((p) => {
                  const already = items.some((i) => i.id === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="adj-search-item"
                      onMouseDown={() => addItem(p)}
                      disabled={already}
                    >
                      <span className="adj-search-name">{p.name}</span>
                      <span className="gg-chip-code">{p.code}</span>
                      <span className="stock-chip">{p.currentStock}&nbsp;{p.productUnit}</span>
                      {already && <Check size={14} style={{ color: 'var(--success-fg)', flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Order items table ────────────────────────────────────────────── */}
        <label className="gg-label" style={{ display: 'block', marginBottom: 'var(--sp-3)' }}>
          Order items <span className="gg-req">*</span>
        </label>

        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Code Product</th>
                <th>Stock</th>
                <th>Qty</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      color: 'var(--gray-400)',
                      fontSize: 13,
                      padding: 'var(--sp-8) var(--sp-5)',
                    }}
                  >
                    Use the search above to add products.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    {/* Name */}
                    <td className="gg-td-strong">{item.name}</td>

                    {/* Code */}
                    <td>
                      <span className="gg-chip-code gg-num">{item.code}</span>
                    </td>

                    {/* Current warehouse stock */}
                    <td>
                      <span className="stock-chip gg-num">
                        {item.currentStock}&nbsp;{item.productUnit}
                      </span>
                    </td>

                    {/* Qty stepper */}
                    <td>
                      <div className="gg-stepper">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                        >
                          <Minus size={15} />
                        </button>
                        <input
                          className="gg-num"
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateQty(item.id, parseInt(e.target.value, 10) || 1)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </td>

                    {/* Addition / Subtraction */}
                    <td>
                      <select
                        className="gg-select"
                        style={{ maxWidth: 160 }}
                        value={item.type}
                        onChange={(e) =>
                          updateType(item.id, e.target.value as 'Addition' | 'Subtraction')
                        }
                      >
                        <option value="Addition">Addition</option>
                        <option value="Subtraction">Subtraction</option>
                      </select>
                    </td>

                    {/* Remove */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="gg-icon-btn"
                        style={{ border: 'none', color: 'var(--danger)' }}
                        title="Remove"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Hidden: serialised line items, read by createAdjustment */}
        <input type="hidden" name="items" value={itemsJson} />

        {/* ── Form actions ─────────────────────────────────────────────────── */}
        <div className="gg-form-actions">
          <button
            type="submit"
            className="gg-btn gg-btn--primary"
            disabled={isPending || !warehouseId || items.length === 0}
          >
            {isPending
              ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Check size={16} /> Save</>
            }
          </button>
          <button
            type="button"
            className="gg-btn gg-btn--secondary"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </button>
        </div>

      </div>
    </form>
  );
}
