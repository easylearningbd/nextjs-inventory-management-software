'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Minus, Plus, Trash2, Pencil, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createTransfer, updateTransfer, searchProductsForTransfer } from './actions';
import type { ActionResult, SearchProductForTransfer } from './actions';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

// ── Types ─────────────────────────────────────────────────────────────────────

type Warehouse = { id: number; name: string };
type Unit      = { id: number; name: string };

export type LineItem = {
  productId:    number;
  name:         string;
  code:         string;
  productUnit:  string;
  currentStock: number;
  netUnitCost:  number;
  quantity:     number;
  discountType: 'Fixed' | 'Percentage';
  discount:     number;
  taxType:      'Inclusive' | 'Exclusive';
  orderTax:     number;
  transferUnit: string;
};

export type InitialValues = {
  id:              number;  // 0 = create, >0 = edit
  date:            string;
  fromWarehouseId: number;
  toWarehouseId:   number;
  status:          'Pending' | 'Sent' | 'Completed';
  orderTaxPct:     number;
  flatDiscount:    number;
  shipping:        number;
  notes:           string;
  items:           LineItem[];
};

type Props = {
  warehouses: Warehouse[];
  units:      Unit[];
  initial?:   InitialValues;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TransferForm({ warehouses, units, initial }: Props) {
  const router = useRouter();
  const isEdit = !!initial?.id;

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    isEdit ? updateTransfer : createTransfer,
    {},
  );

  // ── Header state ──────────────────────────────────────────────────────────
  const [date,            setDate]            = useState(() => initial?.date ?? new Date().toISOString().slice(0, 10));
  const [fromWarehouseId, setFromWarehouseId] = useState<number | ''>(() => initial?.fromWarehouseId ?? '');
  const [toWarehouseId,   setToWarehouseId]   = useState<number | ''>(() => initial?.toWarehouseId   ?? '');

  // ── Line items ────────────────────────────────────────────────────────────
  const [items, setItems] = useState<LineItem[]>(() => initial?.items ?? []);

  // ── Order-level fields ────────────────────────────────────────────────────
  const [orderTaxPct,  setOrderTaxPct]  = useState(() => initial?.orderTaxPct  ?? 0);
  const [flatDiscount, setFlatDiscount] = useState(() => initial?.flatDiscount ?? 0);
  const [shipping,     setShipping]     = useState(() => initial?.shipping     ?? 0);
  const [status,       setStatus]       = useState<InitialValues['status']>(() => initial?.status ?? 'Pending');
  const [notes,        setNotes]        = useState(() => initial?.notes ?? '');

  // ── Per-line modal state ──────────────────────────────────────────────────
  const [modalItem,     setModalItem]     = useState<LineItem | null>(null);
  const [modalCost,     setModalCost]     = useState('');
  const [modalTaxType,  setModalTaxType]  = useState<'Inclusive' | 'Exclusive'>('Exclusive');
  const [modalOrderTax, setModalOrderTax] = useState('');
  const [modalDiscType, setModalDiscType] = useState<'Fixed' | 'Percentage'>('Fixed');
  const [modalDisc,     setModalDisc]     = useState('');
  const [modalUnit,     setModalUnit]     = useState('');

  // ── Product search ────────────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<SearchProductForTransfer[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [, startSearch]               = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRef   = useRef<HTMLDivElement>(null);

  // ── Close search dropdown on outside click ────────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // ── Toast / redirect ──────────────────────────────────────────────────────
  const initialId = initial?.id;
  useEffect(() => {
    if (state.error)   toast.error(state.error);
    if (state.success) {
      router.push(
        initialId ? `/transfers/${initialId}` : (state.id ? `/transfers/${state.id}` : '/transfers'),
      );
    }
  }, [state, router, initialId]);

  // ── From-warehouse change — clear items (stock refs become stale) ─────────
  function handleFromChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setFromWarehouseId(val ? parseInt(val, 10) : '');
    setItems([]);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  // ── Product search ────────────────────────────────────────────────────────
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    searchTimer.current = setTimeout(() => {
      startSearch(async () => {
        const res = await searchProductsForTransfer(q.trim(), fromWarehouseId || null);
        setResults(res);
        setShowResults(true);
      });
    }, 300);
  }

  // ── Add product from search ───────────────────────────────────────────────
  function addItem(product: SearchProductForTransfer) {
    if (items.some((i) => i.productId === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId:    product.id,
        name:         product.name,
        code:         product.code,
        productUnit:  product.productUnit,
        currentStock: product.currentStock,
        netUnitCost:  product.cost,
        quantity:     1,
        discountType: 'Fixed',
        discount:     0,
        taxType:      'Exclusive',
        orderTax:     0,
        transferUnit: product.productUnit,
      },
    ]);
    setQuery('');
    setResults([]);
    setShowResults(false);
  }

  // ── Qty stepper ───────────────────────────────────────────────────────────
  function updateQty(productId: number, qty: number) {
    setItems((prev) =>
      prev.map((i) => i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i),
    );
  }

  function removeItem(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  // ── Per-line modal ────────────────────────────────────────────────────────
  function openModal(item: LineItem) {
    setModalItem(item);
    setModalCost(item.netUnitCost.toString());
    setModalTaxType(item.taxType);
    setModalOrderTax(item.orderTax.toString());
    setModalDiscType(item.discountType);
    setModalDisc(item.discount.toString());
    setModalUnit(item.transferUnit);
  }

  function saveModal() {
    if (!modalItem) return;
    const cost = parseFloat(modalCost)     || 0;
    const tax  = parseFloat(modalOrderTax) || 0;
    const disc = parseFloat(modalDisc)     || 0;
    setItems((prev) =>
      prev.map((i) =>
        i.productId === modalItem.productId
          ? {
              ...i,
              netUnitCost:  cost,
              taxType:      modalTaxType,
              orderTax:     tax,
              discountType: modalDiscType,
              discount:     disc,
              transferUnit: modalUnit || i.transferUnit,
            }
          : i,
      ),
    );
    setModalItem(null);
  }

  // ── Live totals ───────────────────────────────────────────────────────────
  const lineInputs = items.map((i) => ({
    netUnitCost:  i.netUnitCost,
    quantity:     i.quantity,
    discountType: i.discountType,
    discount:     i.discount,
    taxType:      i.taxType,
    orderTax:     i.orderTax,
  }));

  const grand        = orderGrandTotal({ lines: lineInputs, orderTaxPct, flatDiscount, shipping });
  const subtotalsSum = lineInputs.reduce((s, l) => s + lineSubtotal(l), 0);
  const orderTaxAmt  = Math.round(subtotalsSum * orderTaxPct) / 100;

  // ── Serialise items for hidden field ──────────────────────────────────────
  const itemsJson = JSON.stringify(
    items.map(({ productId, quantity, discountType, discount, taxType, orderTax, netUnitCost, transferUnit }) => ({
      productId, quantity, discountType, discount, taxType, orderTax, netUnitCost, transferUnit,
    })),
  );

  const sameWarehouse = fromWarehouseId !== '' && toWarehouseId !== '' && fromWarehouseId === toWarehouseId;
  const canSubmit     = !isPending && !!fromWarehouseId && !!toWarehouseId && !sameWarehouse && items.length > 0;

  return (
    <>
      <form action={formAction}>
        <div className="gg-card gg-card-pad">

          {/* ── Hidden fields ─────────────────────────────────────────────── */}
          {isEdit && <input type="hidden" name="transferId" value={initial!.id} />}
          <input type="hidden" name="items"      value={itemsJson} />
          <input type="hidden" name="grandTotal" value={grand.toString()} />

          {/* ── Header: Date / From / To ──────────────────────────────────── */}
          <div className="pur-top">
            <div className="gg-field">
              <label className="gg-label">Date <span className="gg-req">*</span></label>
              <input
                name="date"
                type="date"
                className="gg-input gg-num"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="gg-field">
              <label className="gg-label">From Warehouse <span className="gg-req">*</span></label>
              <select
                name="fromWarehouseId"
                className="gg-select"
                value={fromWarehouseId}
                onChange={handleFromChange}
              >
                <option value="">— Select warehouse —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div className="gg-field">
              <label className="gg-label">To Warehouse <span className="gg-req">*</span></label>
              <select
                name="toWarehouseId"
                className="gg-select"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">— Select warehouse —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              {sameWarehouse && (
                <p style={{ margin: 'var(--sp-1) 0 0', fontSize: 12.5, color: 'var(--danger)' }}>
                  Source and destination must be different warehouses.
                </p>
              )}
            </div>
          </div>

          {/* ── Product search ────────────────────────────────────────────── */}
          <div className="gg-field" style={{ marginBottom: 'var(--sp-6)', position: 'relative' }} ref={searchRef}>
            <label className="gg-label">Product</label>
            <div className="gg-input-icon">
              <Search size={18} />
              <input
                className="gg-input"
                placeholder={fromWarehouseId ? 'Search Product by Code or Name' : 'Select a source warehouse first'}
                value={query}
                disabled={!fromWarehouseId}
                onChange={handleQueryChange}
                onFocus={() => results.length > 0 && setShowResults(true)}
                autoComplete="off"
              />
            </div>

            {showResults && results.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: '#fff', border: '1px solid var(--gray-200)',
                borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)',
                zIndex: 50, maxHeight: 280, overflowY: 'auto',
              }}>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 16px',
                      border: 'none', background: 'none', cursor: 'pointer',
                      borderBottom: '1px solid var(--gray-100)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 'var(--sp-4)',
                    }}
                    onMouseDown={() => addItem(p)}
                  >
                    <span>
                      <span style={{ fontWeight: 600, fontFamily: 'var(--font-display)', fontSize: 14 }}>{p.code}</span>
                      <span style={{ color: 'var(--gray-500)', fontSize: 13, marginLeft: 8 }}>{p.name}</span>
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>
                      stock: {p.currentStock}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Order items table ──────────────────────────────────────────── */}
          <label className="gg-label" style={{ display: 'block', marginBottom: 'var(--sp-3)' }}>
            Order items <span className="gg-req">*</span>
          </label>

          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Net Unit Cost</th>
                  <th>Stock</th>
                  <th>Qty</th>
                  <th>Discount</th>
                  <th>Tax</th>
                  <th>Subtotal</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, padding: 'var(--sp-8) var(--sp-5)' }}
                    >
                      {fromWarehouseId
                        ? 'No items added. Search for a product above.'
                        : 'Select a source warehouse to add products.'}
                    </td>
                  </tr>
                ) : items.map((item) => {
                  const gross   = item.netUnitCost * item.quantity;
                  const discAmt = item.discountType === 'Percentage'
                    ? gross * item.discount / 100
                    : item.discount;
                  const taxAmt  = item.taxType === 'Exclusive'
                    ? (gross - discAmt) * item.orderTax / 100
                    : 0;
                  const sub = lineSubtotal({
                    netUnitCost:  item.netUnitCost,
                    quantity:     item.quantity,
                    discountType: item.discountType,
                    discount:     item.discount,
                    taxType:      item.taxType,
                    orderTax:     item.orderTax,
                  });
                  return (
                    <tr key={item.productId}>
                      <td>
                        <div className="prod-cell">
                          <span className="prod-code">{item.code}</span>
                          <span className="prod-name-row">
                            <span className="gg-chip-unit">{item.name}</span>
                            <button
                              type="button"
                              className="prod-edit"
                              title="Edit line details"
                              onClick={() => openModal(item)}
                            >
                              <Pencil size={14} />
                            </button>
                          </span>
                        </div>
                      </td>
                      <td className="gg-num">{fmt(item.netUnitCost)}</td>
                      <td>
                        <span className="stock-chip gg-num">
                          {item.currentStock}&nbsp;{item.transferUnit}
                        </span>
                      </td>
                      <td>
                        <div className="gg-stepper">
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity - 1)}>
                            <Minus size={15} />
                          </button>
                          <input
                            className="gg-num"
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateQty(item.productId, parseInt(e.target.value, 10) || 1)}
                          />
                          <button type="button" onClick={() => updateQty(item.productId, item.quantity + 1)}>
                            <Plus size={15} />
                          </button>
                        </div>
                      </td>
                      <td className="gg-num">{fmt(discAmt)}</td>
                      <td className="gg-num">{fmt(taxAmt)}</td>
                      <td className="gg-num gg-td-strong">{fmt(sub)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="gg-icon-btn"
                          style={{ border: 'none', color: 'var(--danger)' }}
                          title="Remove line"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Totals box ─────────────────────────────────────────────────── */}
          <div className="pur-totals-box">
            <div className="pur-totals-row">
              <span className="ptr-lbl">Order Tax</span>
              <span className="ptr-val gg-num">{fmt(orderTaxAmt)}&nbsp;({orderTaxPct.toFixed(2)}&nbsp;%)</span>
            </div>
            <div className="pur-totals-row">
              <span className="ptr-lbl">Discount</span>
              <span className="ptr-val gg-num">{fmt(flatDiscount)}</span>
            </div>
            <div className="pur-totals-row">
              <span className="ptr-lbl">Shipping</span>
              <span className="ptr-val gg-num">{fmt(shipping)}</span>
            </div>
            <div className="pur-totals-row ptr-grand">
              <span className="ptr-lbl">Grand Total</span>
              <span className="ptr-val gg-num">{fmt(grand)}</span>
            </div>
          </div>

          {/* ── Order Tax / Discount / Shipping ───────────────────────────── */}
          <div className="pur-below">
            <div className="gg-field">
              <label className="gg-label">Order Tax</label>
              <div className="gg-input-group">
                <input
                  name="orderTaxPct"
                  className="gg-input gg-num"
                  type="number" min={0} step="0.01"
                  value={orderTaxPct}
                  onChange={(e) => setOrderTaxPct(parseFloat(e.target.value) || 0)}
                />
                <span className="gg-input-suffix">%</span>
              </div>
            </div>
            <div className="gg-field">
              <label className="gg-label">Discount</label>
              <div className="gg-input-group">
                <input
                  name="flatDiscount"
                  className="gg-input gg-num"
                  type="number" min={0} step="0.01"
                  value={flatDiscount}
                  onChange={(e) => setFlatDiscount(parseFloat(e.target.value) || 0)}
                />
                <span className="gg-input-suffix">$</span>
              </div>
            </div>
            <div className="gg-field">
              <label className="gg-label">Shipping</label>
              <div className="gg-input-group">
                <input
                  name="shipping"
                  className="gg-input gg-num"
                  type="number" min={0} step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                />
                <span className="gg-input-suffix">$</span>
              </div>
            </div>
          </div>

          {/* ── Status ────────────────────────────────────────────────────── */}
          <div className="gg-field" style={{ marginTop: 'var(--sp-8)', maxWidth: 520 }}>
            <label className="gg-label">Status <span className="gg-req">*</span></label>
            <select
              name="status"
              className="gg-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as InitialValues['status'])}
            >
              <option value="Completed">Completed</option>
              <option value="Sent">Sent</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          {/* ── Note ──────────────────────────────────────────────────────── */}
          <div className="gg-field" style={{ marginTop: 'var(--sp-5)' }}>
            <label className="gg-label">Note</label>
            <textarea
              name="notes"
              className="gg-textarea"
              placeholder="Enter Note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ── Form actions ───────────────────────────────────────────────── */}
          <div className="gg-form-actions">
            <button
              type="submit"
              className="gg-btn gg-btn--primary"
              disabled={!canSubmit}
            >
              {isPending
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <><Check size={16} /> {isEdit ? 'Update' : 'Save'}</>}
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

      {/* ── Per-line edit modal ────────────────────────────────────────────── */}
      {modalItem && (
        <div
          className="gg-overlay is-open"
          onClick={(e) => e.target === e.currentTarget && setModalItem(null)}
        >
          <div className="gg-modal">
            <div className="gg-modal-head">
              <span className="gg-card-title">{modalItem.name}</span>
              <button
                type="button"
                className="gg-modal-close"
                onClick={() => setModalItem(null)}
              >
                ✕
              </button>
            </div>

            <div className="gg-modal-body">
              <div className="gg-field">
                <label className="gg-label">Product Cost <span className="gg-req">*</span></label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    type="number" min={0} step="0.01"
                    value={modalCost}
                    onChange={(e) => setModalCost(e.target.value)}
                  />
                  <span className="gg-input-suffix">$</span>
                </div>
              </div>

              <div className="gg-field">
                <label className="gg-label">Tax Type <span className="gg-req">*</span></label>
                <select
                  className="gg-select"
                  value={modalTaxType}
                  onChange={(e) => setModalTaxType(e.target.value as 'Inclusive' | 'Exclusive')}
                >
                  <option value="Exclusive">Exclusive</option>
                  <option value="Inclusive">Inclusive</option>
                </select>
              </div>

              <div className="gg-field">
                <label className="gg-label">Order Tax</label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    type="number" min={0} step="0.01"
                    value={modalOrderTax}
                    onChange={(e) => setModalOrderTax(e.target.value)}
                  />
                  <span className="gg-input-suffix">%</span>
                </div>
              </div>

              <div className="gg-field">
                <label className="gg-label">Discount Type <span className="gg-req">*</span></label>
                <select
                  className="gg-select"
                  value={modalDiscType}
                  onChange={(e) => setModalDiscType(e.target.value as 'Fixed' | 'Percentage')}
                >
                  <option value="Fixed">Fixed</option>
                  <option value="Percentage">Percentage</option>
                </select>
              </div>

              <div className="gg-field">
                <label className="gg-label">Discount <span className="gg-req">*</span></label>
                <input
                  className="gg-input gg-num"
                  type="number" min={0} step="0.01"
                  value={modalDisc}
                  onChange={(e) => setModalDisc(e.target.value)}
                />
              </div>

              <div className="gg-field">
                <label className="gg-label">Product Unit <span className="gg-req">*</span></label>
                <select
                  className="gg-select"
                  value={modalUnit}
                  onChange={(e) => setModalUnit(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="gg-modal-foot">
              <button type="button" className="gg-btn gg-btn--primary" onClick={saveModal}>
                <Check size={16} /> Save
              </button>
              <button type="button" className="gg-btn gg-btn--secondary" onClick={() => setModalItem(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
