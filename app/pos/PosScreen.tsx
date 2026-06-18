'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  User, UserPlus, Home, ChevronDown,
  Search, List, ShoppingBag, Maximize, Calculator, Gauge,
  Sparkles, Hand, RotateCw, Banknote,
  Minus, Plus, Trash2, Pencil, AlertTriangle, X, Loader2,
} from 'lucide-react';
import type { PosProduct, PosCategory, PosBrand, PosWarehouse, PosCustomer } from './page';
import { createSale } from '@/app/(dashboard)/sales/actions';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRAD_PAIRS = [
  ['#E48FA6', '#C75C7E'],
  ['#9FB6C9', '#6E8BA6'],
  ['#8FC9A6', '#4E9E73'],
  ['#E8A6B4', '#D06A82'],
  ['#C4A4D8', '#9B6DC0'],
  ['#A6C4E8', '#6B9BD0'],
  ['#E8D0A6', '#D0A56B'],
  ['#A6E8D0', '#6BD0A5'],
] as const;

function cardGradient(id: number) {
  const [c1, c2] = GRAD_PAIRS[id % GRAD_PAIRS.length];
  return `linear-gradient(140deg, ${c1}, ${c2})`;
}

function money(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CartItem = {
  productId:   number;
  name:        string;
  code:        string;
  price:       number;
  qty:         number;
  stock:       number;
  productUnit: string;
};

type HeldOrder = {
  id:          string;
  heldAt:      Date;
  customer:    PosCustomer | null;
  items:       CartItem[];
  orderTaxPct: number;
  flatDiscount: number;
  shipping:    number;
  grandTotal:  number;
};

const PAY_TYPES = ['Cash', 'Card', 'Cheque', 'Bank Transfer'] as const;
type PayType = typeof PAY_TYPES[number];

function fmtHeldTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

type Props = {
  warehouses:          PosWarehouse[];
  customers:           PosCustomer[];
  categories:          PosCategory[];
  brands:              PosBrand[];
  products:            PosProduct[];
  selectedWarehouseId: number | null;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PosScreen({
  warehouses,
  customers,
  categories,
  brands,
  products,
  selectedWarehouseId,
}: Props) {
  const router = useRouter();

  // ── Selector state ────────────────────────────────────────────────────────
  const defaultCustomer = customers.find((c) => c.isDefault) ?? customers[0] ?? null;
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(defaultCustomer);
  const [custOpen,         setCustOpen]         = useState(false);
  const [whOpen,           setWhOpen]           = useState(false);

  // ── Product grid filters ──────────────────────────────────────────────────
  const [activeCatId,   setActiveCatId]   = useState<number | null>(null);
  const [activeBrandId, setActiveBrandId] = useState<number | null>(null);
  const [search,        setSearch]        = useState('');

  // ── Cart state ────────────────────────────────────────────────────────────
  const [cart,         setCart]         = useState<CartItem[]>([]);
  const [orderTaxPct,  setOrderTaxPct]  = useState(0);
  const [flatDiscount, setFlatDiscount] = useState(0);
  const [shipping,     setShipping]     = useState(0);

  // ── Hold / Resume state ───────────────────────────────────────────────────
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld,   setShowHeld]   = useState(false);

  // ── Pay Now state ─────────────────────────────────────────────────────────
  const [showPay,  setShowPay]  = useState(false);
  const [payType,  setPayType]  = useState<PayType>('Cash');
  const [tendered, setTendered] = useState('');
  const [paying,   setPaying]   = useState(false);
  const [payError, setPayError] = useState('');

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) ?? warehouses[0] ?? null;

  const filtered = useMemo(() => {
    let list = products;
    if (activeCatId   !== null) list = list.filter((p) => p.categoryId === activeCatId);
    if (activeBrandId !== null) list = list.filter((p) => p.brandId    === activeBrandId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, activeCatId, activeBrandId, search]);

  const { totalQty, subTotal } = useMemo(() => ({
    totalQty: cart.reduce((s, i) => s + i.qty, 0),
    subTotal: round2(cart.reduce((s, i) => s + i.price * i.qty, 0)),
  }), [cart]);

  const cartQtyMap = useMemo(
    () => new Map(cart.map((i) => [i.productId, i.qty])),
    [cart],
  );

  const grandTotal = useMemo(() => {
    const taxAmt = round2(subTotal * (orderTaxPct / 100));
    return Math.max(0, round2(subTotal + taxAmt - flatDiscount + shipping));
  }, [subTotal, orderTaxPct, flatDiscount, shipping]);

  // ── Cart actions ──────────────────────────────────────────────────────────

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const exists = prev.find((i) => i.productId === product.id);
      if (exists) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId:   product.id,
          name:        product.name,
          code:        product.code,
          price:       product.price,
          qty:         1,
          stock:       product.stock,
          productUnit: product.productUnit,
        },
      ];
    });
  }

  function updateQty(productId: number, delta: number) {
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, qty: Math.max(1, i.qty + delta) }
          : i,
      ),
    );
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  function resetCart() {
    setCart([]);
    setOrderTaxPct(0);
    setFlatDiscount(0);
    setShipping(0);
  }

  // ── Hold / Resume / Discard ───────────────────────────────────────────────

  function holdCart() {
    if (cart.length === 0) return;
    const held: HeldOrder = {
      id:          crypto.randomUUID(),
      heldAt:      new Date(),
      customer:    selectedCustomer,
      items:       [...cart],
      orderTaxPct,
      flatDiscount,
      shipping,
      grandTotal,
    };
    setHeldOrders((prev) => [...prev, held]);
    resetCart();
  }

  function resumeOrder(order: HeldOrder) {
    if (cart.length > 0) {
      const autoHeld: HeldOrder = {
        id:          crypto.randomUUID(),
        heldAt:      new Date(),
        customer:    selectedCustomer,
        items:       [...cart],
        orderTaxPct,
        flatDiscount,
        shipping,
        grandTotal,
      };
      setHeldOrders((prev) => [
        ...prev.filter((h) => h.id !== order.id),
        autoHeld,
      ]);
    } else {
      setHeldOrders((prev) => prev.filter((h) => h.id !== order.id));
    }
    setCart(order.items);
    setSelectedCustomer(order.customer);
    setOrderTaxPct(order.orderTaxPct);
    setFlatDiscount(order.flatDiscount);
    setShipping(order.shipping);
    setShowHeld(false);
  }

  function discardOrder(id: string) {
    setHeldOrders((prev) => prev.filter((h) => h.id !== id));
  }

  // ── Pay Now ───────────────────────────────────────────────────────────────

  function openPayModal() {
    if (cart.length === 0 || !selectedCustomer || !selectedWarehouseId) return;
    setPayType('Cash');
    setTendered(grandTotal.toFixed(2));
    setPayError('');
    setShowPay(true);
  }

  function handlePayTypeChange(pt: PayType) {
    setPayType(pt);
    // Non-cash: pre-fill tendered with exact total (no change concept)
    if (pt !== 'Cash') setTendered(grandTotal.toFixed(2));
    setPayError('');
  }

  async function confirmPayment() {
    if (!selectedWarehouseId || !selectedCustomer || cart.length === 0) return;

    const tenderedNum = parseFloat(tendered) || 0;
    if (payType === 'Cash' && tenderedNum < grandTotal) {
      setPayError(`Tendered amount must be at least $ ${money(grandTotal)}.`);
      return;
    }

    setPaying(true);
    setPayError('');

    const fd = new FormData();
    fd.set('date',          new Date().toISOString().slice(0, 10));
    fd.set('warehouseId',   String(selectedWarehouseId));
    fd.set('customerId',    String(selectedCustomer.id));
    fd.set('status',        'Received');
    fd.set('paymentType',   payType);
    fd.set('orderTaxPct',   String(orderTaxPct));
    fd.set('flatDiscount',  String(flatDiscount));
    fd.set('shipping',      String(shipping));
    fd.set('paidAmount',    String(grandTotal)); // POS sales are always fully paid
    fd.set('items',         JSON.stringify(
      cart.map((item) => ({
        productId:    item.productId,
        quantity:     item.qty,
        netUnitPrice: item.price,
        discountType: 'Fixed',
        discount:     0,
        taxType:      'Exclusive',
        orderTax:     0,
        saleUnit:     item.productUnit,
      })),
    ));

    const result = await createSale({}, fd);
    setPaying(false);

    if (result.error) {
      setPayError(result.error);
      return;
    }

    const ref = `SA_${String(result.id).padStart(4, '0')}`;
    toast.success(`Sale ${ref} completed`);
    setShowPay(false);
    resetCart();
    router.refresh(); // re-fetch product stock from server
  }

  // ── Warehouse change clears cart ──────────────────────────────────────────

  function changeWarehouse(id: number) {
    resetCart();
    setActiveCatId(null);
    setActiveBrandId(null);
    setSearch('');
    setWhOpen(false);
    router.replace(`/pos?wh=${id}`);
  }

  // ── Derived pay values ────────────────────────────────────────────────────

  const tenderedNum = parseFloat(tendered) || 0;
  const change      = round2(Math.max(0, tenderedNum - grandTotal));
  const canPay      = cart.length > 0 && !!selectedCustomer && !!selectedWarehouseId;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="pos">

        {/* ============================= LEFT : CART ============================= */}
        <div className="pos-col">

          {/* Top bar: customer + warehouse */}
          <div className="pos-bar">

            {/* Customer selector — wrapper keeps dropdown outside overflow:hidden */}
            <div style={{ flex: 1, position: 'relative' }}>
              <div className="cust-box">
                <div
                  className="who"
                  onClick={() => { setCustOpen((v) => !v); setWhOpen(false); }}
                >
                  <User size={18} />
                  <span>{selectedCustomer?.name ?? 'Select Customer'}</span>
                </div>
                <button
                  className="add"
                  type="button"
                  title="Change customer"
                  onClick={() => { setCustOpen((v) => !v); setWhOpen(false); }}
                >
                  <UserPlus size={20} />
                </button>
              </div>

              {custOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setCustOpen(false)}
                  />
                  <div className="pos-dropdown">
                    {customers.length === 0 ? (
                      <span className="pos-dropdown-item" style={{ color: 'var(--gray-400)', cursor: 'default' }}>
                        No customers found
                      </span>
                    ) : customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`pos-dropdown-item${selectedCustomer?.id === c.id ? ' is-active' : ''}`}
                        onClick={() => { setSelectedCustomer(c); setCustOpen(false); }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Warehouse selector */}
            <div style={{ position: 'relative' }}>
              <div
                className="wh-box"
                onClick={() => { setWhOpen((v) => !v); setCustOpen(false); }}
              >
                <Home size={18} style={{ color: 'var(--gray-500)', flexShrink: 0 }} />
                <span className="nm">{selectedWarehouse?.name ?? 'Select Warehouse'}</span>
                <ChevronDown size={18} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
              </div>

              {whOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                    onClick={() => setWhOpen(false)}
                  />
                  <div className="pos-dropdown">
                    {warehouses.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className={`pos-dropdown-item${w.id === selectedWarehouseId ? ' is-active' : ''}`}
                        onClick={() => changeWarehouse(w.id)}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cart card */}
          <div className="cart">
            <div className="cart-head">
              <span>Product</span>
              <span style={{ textAlign: 'center' }}>Qty</span>
              <span>Price</span>
              <span>Sub Total</span>
              <span />
            </div>

            <div className="cart-body">
              {cart.length === 0 ? (
                <div className="cart-empty">Click a product to add it to the cart</div>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="cart-row">
                    {/* Name + code + over-stock warning */}
                    <div>
                      <div className="pname">{item.name}</div>
                      <div className="pmeta">
                        <span className="pcode">{item.code}</span>
                        <button className="pedit" type="button" title="Edit price">
                          <Pencil size={14} />
                        </button>
                      </div>
                      {item.qty > item.stock && (
                        <div className="stock-hint">
                          <AlertTriangle size={11} />
                          Only {item.stock} in stock
                        </div>
                      )}
                    </div>

                    {/* Qty stepper — + turns amber at stock limit */}
                    <div className="stepper">
                      <button type="button" onClick={() => updateQty(item.productId, -1)}>
                        <Minus size={16} />
                      </button>
                      <span className="q gg-num">{item.qty}</span>
                      <button
                        type="button"
                        className={item.qty >= item.stock ? 'is-warn' : ''}
                        onClick={() => updateQty(item.productId, 1)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="price gg-num">$ {money(item.price)}</div>
                    <div className="sub gg-num">$ {money(round2(item.price * item.qty))}</div>

                    <button
                      className="del"
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer: modifiers + totals + actions */}
            <div className="cart-foot">
              <div className="foot-grid">
                <div className="foot-fields">
                  <div className="foot-input">
                    <input
                      placeholder="Tax"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={orderTaxPct > 0 ? orderTaxPct : ''}
                      onChange={(e) =>
                        setOrderTaxPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                      }
                    />
                    <span className="suf">%</span>
                  </div>
                  <div className="foot-input">
                    <input
                      placeholder="Discount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={flatDiscount > 0 ? flatDiscount : ''}
                      onChange={(e) =>
                        setFlatDiscount(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                    />
                    <span className="suf">$</span>
                  </div>
                  <div className="foot-input">
                    <input
                      placeholder="Shipping"
                      type="number"
                      min="0"
                      step="0.01"
                      value={shipping > 0 ? shipping : ''}
                      onChange={(e) =>
                        setShipping(Math.max(0, parseFloat(e.target.value) || 0))
                      }
                    />
                    <span className="suf">$</span>
                  </div>
                </div>

                <div className="totals">
                  <div className="tq gg-num">Total QTY : <span>{totalQty}</span></div>
                  <div className="st gg-num">Sub Total : $ <span>{money(subTotal)}</span></div>
                  <div className="gt gg-num">Total : <b>$ <span>{money(grandTotal)}</span></b></div>
                </div>
              </div>

              <div className="cart-actions">
                <button
                  className="pos-btn btn-hold"
                  type="button"
                  onClick={holdCart}
                  style={cart.length === 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                >
                  Hold <Hand size={19} />
                </button>
                <button className="pos-btn btn-reset" type="button" onClick={resetCart}>
                  Reset <RotateCw size={19} />
                </button>
                <button
                  className="pos-btn btn-pay"
                  type="button"
                  onClick={openPayModal}
                  style={!canPay ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                >
                  Pay Now <Banknote size={19} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ============================= RIGHT : PRODUCTS ======================== */}
        <div className="pos-col">

          {/* Top bar: search + tools */}
          <div className="pos-bar">
            <div className="search-box">
              <Search size={22} />
              <input
                placeholder="Scan/Search Product by Code Name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="pos-tools">
              <button
                className="tool tool--rose"
                type="button"
                title="Held orders"
                onClick={() => setShowHeld(true)}
              >
                <List size={26} />
                <span className="badge gg-num">{heldOrders.length}</span>
              </button>
              <button className="tool tool--green" type="button" title="Orders">
                <ShoppingBag size={26} />
              </button>
              <button className="tool tool--gold" type="button" title="Full screen">
                <Maximize size={26} />
              </button>
              <button className="tool tool--gold" type="button" title="Calculator">
                <Calculator size={26} />
              </button>
              <button className="tool tool--gold" type="button" title="Dashboard">
                <Gauge size={26} />
              </button>
            </div>
          </div>

          {/* Products panel */}
          <div className="prods">

            {/* Category chips */}
            <div className="chip-row">
              <button
                type="button"
                className={`fchip${activeCatId === null ? ' is-active' : ''}`}
                onClick={() => setActiveCatId(null)}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`fchip${activeCatId === c.id ? ' is-active' : ''}`}
                  onClick={() => setActiveCatId(activeCatId === c.id ? null : c.id)}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Brand chips */}
            <div className="chip-row">
              <button
                type="button"
                className={`fchip${activeBrandId === null ? ' is-active' : ''}`}
                onClick={() => setActiveBrandId(null)}
              >
                All Brands
              </button>
              {brands.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`fchip${activeBrandId === b.id ? ' is-active' : ''}`}
                  onClick={() => setActiveBrandId(activeBrandId === b.id ? null : b.id)}
                >
                  {b.name}
                </button>
              ))}
            </div>

            {/* Product grid — clicking adds to cart */}
            <div className="prod-grid">
              {filtered.length === 0 ? (
                <div className="prod-empty">
                  {warehouses.length === 0
                    ? 'No warehouses found. Create a warehouse first.'
                    : products.length === 0
                    ? 'No products in stock for this warehouse.'
                    : 'No products match the current filter.'}
                </div>
              ) : (
                filtered.map((p) => {
                  const cartQty = cartQtyMap.get(p.id) ?? 0;
                  const inCart  = cartQty > 0;
                  const atMax   = cartQty >= p.stock;
                  return (
                    <div
                      key={p.id}
                      className={`pcard${inCart ? ' in-cart' : ''}`}
                      onClick={() => addToCart(p)}
                    >
                      <div
                        className="ph"
                        style={p.image ? undefined : { background: cardGradient(p.id) }}
                      >
                        {p.image
                          ? <img src={p.image} alt={p.name} className="ph-img" />
                          : <Sparkles size={46} style={{ color: 'rgba(255,255,255,.9)' }} />
                        }
                        <span className="tag price gg-num">$ {money(p.price)}</span>
                        <span className={`tag stock gg-num${atMax ? ' is-warn' : ''}`}>
                          {p.stock} {p.productUnit}
                        </span>
                        {inCart && (
                          <span className="tag qty-tag gg-num">In cart: {cartQty}</span>
                        )}
                      </div>
                      <div className="body">
                        <div className="nm">{p.name}</div>
                        <div className="code">{p.code}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================= HELD ORDERS MODAL ======================= */}
      {showHeld && (
        <div className="pos-modal-overlay" onClick={() => setShowHeld(false)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h2>Held Orders ({heldOrders.length})</h2>
              <button className="pos-modal-close" type="button" onClick={() => setShowHeld(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="pos-modal-body">
              {heldOrders.length === 0 ? (
                <div className="held-empty">No held orders</div>
              ) : (
                heldOrders.map((order) => (
                  <div key={order.id} className="held-row">
                    <div className="held-info">
                      <div className="held-customer">
                        {order.customer?.name ?? 'No customer'}
                      </div>
                      <div className="held-meta">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                        {' · '}
                        {order.items.reduce((s, i) => s + i.qty, 0)} qty
                        {' · '}
                        Held at {fmtHeldTime(order.heldAt)}
                      </div>
                    </div>
                    <div className="held-total gg-num">$ {money(order.grandTotal)}</div>
                    <div className="held-actions">
                      <button className="btn-resume" type="button" onClick={() => resumeOrder(order)}>
                        Resume
                      </button>
                      <button className="btn-discard" type="button" onClick={() => discardOrder(order.id)}>
                        Discard
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================= PAY NOW MODAL =========================== */}
      {showPay && (
        <div className="pos-modal-overlay" onClick={() => { if (!paying) setShowPay(false); }}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-modal-head">
              <h2>Payment</h2>
              <button
                className="pos-modal-close"
                type="button"
                disabled={paying}
                onClick={() => setShowPay(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="pos-modal-body">
              {/* Grand total */}
              <div className="pay-total">
                <div className="lbl">Grand Total</div>
                <div className="amt gg-num">$ {money(grandTotal)}</div>
              </div>

              {/* Payment type selector */}
              <div className="pay-types">
                {PAY_TYPES.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    className={`pay-type-btn${payType === pt ? ' is-active' : ''}`}
                    onClick={() => handlePayTypeChange(pt)}
                    disabled={paying}
                  >
                    {pt}
                  </button>
                ))}
              </div>

              {/* Tendered (Cash only) */}
              {payType === 'Cash' && (
                <>
                  <div className="pay-field">
                    <label>TENDERED AMOUNT</label>
                    <input
                      type="number"
                      min={grandTotal}
                      step="0.01"
                      value={tendered}
                      onChange={(e) => { setTendered(e.target.value); setPayError(''); }}
                      disabled={paying}
                      autoFocus
                    />
                  </div>

                  {change > 0 && (
                    <div className="pay-change-row">
                      <span className="lbl">Change to give back</span>
                      <span className="val gg-num">$ {money(change)}</span>
                    </div>
                  )}
                </>
              )}

              {/* Error */}
              {payError && (
                <div className="pay-err">
                  <AlertTriangle size={15} />
                  {payError}
                </div>
              )}
            </div>

            <div className="pos-modal-foot">
              <button
                className="btn-cancel"
                type="button"
                disabled={paying}
                onClick={() => setShowPay(false)}
              >
                Cancel
              </button>
              <button
                className="btn-confirm"
                type="button"
                disabled={paying}
                onClick={confirmPayment}
              >
                {paying ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
