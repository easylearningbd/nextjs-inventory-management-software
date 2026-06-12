'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Minus, Plus, Trash2, Pencil, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { createPurchase, searchProductsForPurchase } from './actions';
import type { ActionResult, SearchProductForPurchase } from './actions';
import { lineSubtotal, orderGrandTotal } from '@/lib/pricing';

// ── Types ─────────────────────────────────────────────────────────────────────

type Warehouse = { id: number; name: string };
type Supplier  = { id: number; name: string };
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
  purchaseUnit: string;
};

type Props = {
  warehouses: Warehouse[];
  suppliers:  Supplier[];
  units:      Unit[];
  // edit mode will pass initial values in Step 7
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseForm({ warehouses, suppliers, units }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    createPurchase,
    {},
  );

  // ── Header state ──────────────────────────────────────────────────────────
  const [date, setDate]             = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState<number | ''>('');
  const [supplierId,  setSupplierId]  = useState<number | ''>('');

  // ── Line items ────────────────────────────────────────────────────────────
  const [items, setItems] = useState<LineItem[]>([]);

  // ── Below-table order-level fields ───────────────────────────────────────
  const [orderTaxPct,   setOrderTaxPct]   = useState(0);
  const [flatDiscount,  setFlatDiscount]  = useState(0);
  const [shipping,      setShipping]      = useState(0);
  const [status, setStatus] = useState<'Received' | 'Pending' | 'Ordered'>('Received');
  const [notes,  setNotes]  = useState('');

  // ── Per-line edit modal state ─────────────────────────────────────────────
  const [modalItem,    setModalItem]    = useState<LineItem | null>(null);
  const [modalCost,    setModalCost]    = useState('');
  const [modalTaxType, setModalTaxType] = useState<'Inclusive' | 'Exclusive'>('Exclusive');
  const [modalOrderTax, setModalOrderTax] = useState('');
  const [modalDiscType, setModalDiscType] = useState<'Fixed' | 'Percentage'>('Fixed');
  const [modalDisc,    setModalDisc]    = useState('');
  const [modalUnit,    setModalUnit]    = useState('');

  // ── Product search ────────────────────────────────────────────────────────
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<SearchProductForPurchase[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, startSearch]    = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Toast / redirect on action response ──────────────────────────────────
  useEffect(() => {
    if (state.error)   toast.error(state.error);
    if (state.success) router.push('/purchases');
  }, [state, router]);

  // ── Warehouse change — reset items (stock reference resets too) ───────────
  function handleWarehouseChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setWarehouseId(val ? parseInt(val, 10) : '');
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
        const res = await searchProductsForPurchase(q.trim(), warehouseId || null);
        setResults(res);
        setShowResults(true);
      });
    }, 300);
  }

  // ── Add product from search ───────────────────────────────────────────────
  function addItem(product: SearchProductForPurchase) {
    if (items.some((i) => i.productId === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        productId:    product.id,
        name:         product.name,
        code:         product.code,
        productUnit:  product.productUnit,
        currentStock: product.currentStock,
        netUnitCost:  product.price,
        quantity:     1,
        discountType: 'Fixed',
        discount:     0,
        taxType:      'Exclusive',
        orderTax:     0,
        purchaseUnit: product.productUnit,
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
    setModalUnit(item.purchaseUnit);
  }

  function saveModal() {
    if (!modalItem) return;
    const cost    = parseFloat(modalCost)    || 0;
    const tax     = parseFloat(modalOrderTax) || 0;
    const disc    = parseFloat(modalDisc)    || 0;
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
              purchaseUnit: modalUnit || i.purchaseUnit,
            }
          : i,
      ),
    );
    setModalItem(null);
  }

  // ── Live totals ───────────────────────────────────────────────────────────
  const grand = orderGrandTotal({
    lines: items.map((i) => ({
      netUnitCost:  i.netUnitCost,
      quantity:     i.quantity,
      discountType: i.discountType,
      discount:     i.discount,
      taxType:      i.taxType,
      orderTax:     i.orderTax,
    })),
    orderTaxPct,
    flatDiscount,
    shipping,
  });
  const subtotalsSum  = items.reduce((s, i) => s + lineSubtotal({
    netUnitCost: i.netUnitCost, quantity: i.quantity,
    discountType: i.discountType, discount: i.discount,
    taxType: i.taxType, orderTax: i.orderTax,
  }), 0);
  const orderTaxAmt = Math.round(subtotalsSum * orderTaxPct) / 100;

  // ── Serialised payload for hidden field ───────────────────────────────────
  const itemsJson = JSON.stringify(
    items.map(({ productId, quantity, discountType, discount, taxType, orderTax, netUnitCost, purchaseUnit }) => ({
      productId, quantity, discountType, discount, taxType, orderTax, netUnitCost, purchaseUnit,
    })),
  );

  const canSubmit = !isPending && !!warehouseId && !!supplierId && items.length > 0;

  return (
    <>
      <form action={formAction}>
        <div className="gg-card gg-card-pad">

          {/* ── Header: Date / Warehouse / Supplier ──────────────────────── */}
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
              <label className="gg-label">Warehouse <span className="gg-req">*</span></label>
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
              <label className="gg-label">Supplier <span className="gg-req">*</span></label>
              <select
                name="supplierId"
                className="gg-select"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value ? parseInt(e.target.value, 10) : '')}
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Product search ─────────────────────────────────────────────── */}
          <div className="gg-field" style={{ marginBottom: 'var(--sp-6)', position: 'relative' }}>
            <label className="gg-label">Product</label>
            <div className="gg-input-icon">
              {isSearching
                ? <Loader2 size={17} style={{ animation: 'spin 1s linear infinite', color: 'var(--gray-400)' }} />
                : <Search size={17} />}
              <input
                className="gg-input"
                placeholder="Search Product by Code or Name"
                value={query}
                onChange={handleQueryChange}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                onFocus={() => results.length > 0 && setShowResults(true)}
                autoComplete="off"
              />
            </div>

            {showResults && (
              <div className="adj-search-results">
                {results.length === 0
                  ? <p className="adj-search-empty">No products found.</p>
                  : results.map((p) => {
                      const already = items.some((i) => i.productId === p.id);
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
                          {warehouseId && (
                            <span className="stock-chip">{p.currentStock}&nbsp;{p.productUnit}</span>
                          )}
                          {already && <Check size={14} style={{ color: 'var(--success-fg)', flexShrink: 0 }} />}
                        </button>
                      );
                    })}
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
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray-400)', fontSize: 13, padding: 'var(--sp-8) var(--sp-5)' }}>
                      Use the search above to add products.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const gross    = item.netUnitCost * item.quantity;
                    const discAmt  = item.discountType === 'Percentage'
                      ? gross * item.discount / 100
                      : item.discount;
                    const taxAmt   = item.taxType === 'Exclusive'
                      ? (gross - discAmt) * item.orderTax / 100
                      : 0;
                    const sub = lineSubtotal({
                      netUnitCost: item.netUnitCost, quantity: item.quantity,
                      discountType: item.discountType, discount: item.discount,
                      taxType: item.taxType, orderTax: item.orderTax,
                    });
                    return (
                      <tr key={item.productId}>
                        {/* Product: code + name + pencil */}
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
                        {/* Net unit cost */}
                        <td className="gg-num">{fmt(item.netUnitCost)}</td>
                        {/* Stock reference */}
                        <td>
                          <span className="stock-chip gg-num">
                            {item.currentStock}&nbsp;{item.purchaseUnit}
                          </span>
                        </td>
                        {/* Qty stepper */}
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
                        {/* Discount amount */}
                        <td className="gg-num">{fmt(discAmt)}</td>
                        {/* Tax amount */}
                        <td className="gg-num">{fmt(taxAmt)}</td>
                        {/* Subtotal */}
                        <td className="gg-num gg-td-strong">{fmt(sub)}</td>
                        {/* Remove */}
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="gg-icon-btn"
                            style={{ border: 'none', color: 'var(--danger)' }}
                            title="Remove"
                            onClick={() => removeItem(item.productId)}
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Below-table: Order Tax / Discount / Shipping + Totals box ── */}
          <div className="pur-totals-box">
            <div className="pur-totals-row">
              <span className="ptr-lbl">Order Tax</span>
              <span className="ptr-val gg-num">{fmt(orderTaxAmt)} ({orderTaxPct.toFixed(2)}&nbsp;%)</span>
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

          <div className="pur-below">
            <div className="gg-field">
              <label className="gg-label">Order Tax</label>
              <div className="gg-input-group">
                <input
                  name="orderTaxPct"
                  className="gg-input gg-num"
                  type="number"
                  min={0}
                  step="0.01"
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
                  type="number"
                  min={0}
                  step="0.01"
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
                  type="number"
                  min={0}
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                />
                <span className="gg-input-suffix">$</span>
              </div>
            </div>
          </div>

          {/* ── Status + Notes ─────────────────────────────────────────────── */}
          <div className="gg-field" style={{ marginTop: 'var(--sp-6)', maxWidth: 420 }}>
            <label className="gg-label">Status <span className="gg-req">*</span></label>
            <select
              name="status"
              className="gg-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="Received">Received</option>
              <option value="Ordered">Ordered</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          <div className="gg-field" style={{ marginTop: 'var(--sp-5)' }}>
            <label className="gg-label">Notes</label>
            <textarea
              name="notes"
              className="gg-textarea"
              placeholder="Enter notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Hidden serialised payload */}
          <input type="hidden" name="items"        value={itemsJson} />
          <input type="hidden" name="grandTotal"   value={grand.toString()} />

          {/* ── Form actions ───────────────────────────────────────────────── */}
          <div className="gg-form-actions">
            <button
              type="submit"
              className="gg-btn gg-btn--primary"
              disabled={!canSubmit}
            >
              {isPending
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : <><Check size={16} /> Save</>}
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
              <button type="button" className="gg-modal-close" onClick={() => setModalItem(null)}>
                ✕
              </button>
            </div>

            <div className="gg-modal-body">
              <div className="gg-field">
                <label className="gg-label">Product Cost <span className="gg-req">*</span></label>
                <div className="gg-input-group">
                  <input
                    className="gg-input gg-num"
                    type="number"
                    min={0}
                    step="0.01"
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
                    type="number"
                    min={0}
                    step="0.01"
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
                  type="number"
                  min={0}
                  step="0.01"
                  value={modalDisc}
                  onChange={(e) => setModalDisc(e.target.value)}
                />
              </div>

              <div className="gg-field">
                <label className="gg-label">Purchase Unit <span className="gg-req">*</span></label>
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
