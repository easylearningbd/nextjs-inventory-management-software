'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Menu, Monitor, Grid2X2, ChevronDown,
  LayoutDashboard, Users, Boxes, Receipt, ShoppingCart, Repeat,
  Wallet, ShieldCheck, Warehouse, BarChart3, DollarSign, Languages,
  LayoutTemplate, Settings, SlidersHorizontal, FileText,
  User, KeyRound, LogOut,
} from 'lucide-react';

const PAGE_META: Record<string, { title: string; icon: React.ReactNode }> = {
  '/dashboard':           { title: 'Dashboard',          icon: <LayoutDashboard size={18} /> },
  '/products':            { title: 'Products',            icon: <Boxes size={18} /> },
  '/products/create':     { title: 'Create Product',      icon: <Boxes size={18} /> },
  '/product-categories':  { title: 'Product Categories',  icon: <Boxes size={18} /> },
  '/brands':              { title: 'Brands',              icon: <Boxes size={18} /> },
  '/adjustments':         { title: 'Adjustments',         icon: <SlidersHorizontal size={18} /> },
  '/adjustments/create':  { title: 'Create Adjustment',   icon: <SlidersHorizontal size={18} /> },
  '/quotations':          { title: 'Quotations',          icon: <FileText size={18} /> },
  '/purchases':           { title: 'Purchases',           icon: <Receipt size={18} /> },
  '/purchases/returns':          { title: 'Purchases Returns',        icon: <Receipt size={18} /> },
  '/purchases/returns/create':   { title: 'Create Purchase Return',   icon: <Receipt size={18} /> },
  '/sales':               { title: 'Sales',               icon: <ShoppingCart size={18} /> },
  '/sales/create':        { title: 'Create Sale',         icon: <ShoppingCart size={18} /> },
  '/sales-returns':       { title: 'Sales Returns',       icon: <ShoppingCart size={18} /> },
  '/transfers':           { title: 'Transfers',           icon: <Repeat size={18} /> },
  '/expenses':            { title: 'Expenses',            icon: <Wallet size={18} /> },
  '/expense-categories':  { title: 'Expense Categories',  icon: <Wallet size={18} /> },
  '/customers':           { title: 'Customers',           icon: <Users size={18} /> },
  '/suppliers':           { title: 'Suppliers',           icon: <Users size={18} /> },
  '/users':               { title: 'Users',               icon: <Users size={18} /> },
  '/roles':               { title: 'Roles / Permissions', icon: <ShieldCheck size={18} /> },
  '/warehouse':           { title: 'Warehouse',           icon: <Warehouse size={18} /> },
  '/warehouse/create':    { title: 'Create Warehouse',    icon: <Warehouse size={18} /> },
  '/suppliers/create':    { title: 'Create Supplier',     icon: <Users size={18} /> },
  '/customers/create':    { title: 'Create Customer',     icon: <Users size={18} /> },
  '/users/create':        { title: 'Create User',         icon: <User size={18} /> },
  '/reports':             { title: 'Reports',             icon: <BarChart3 size={18} /> },
  '/currencies':          { title: 'Currencies',          icon: <DollarSign size={18} /> },
  '/languages':           { title: 'Languages',           icon: <Languages size={18} /> },
  '/templates/sms':       { title: 'SMS Templates',       icon: <LayoutTemplate size={18} /> },
  '/templates/email':     { title: 'Email Templates',     icon: <LayoutTemplate size={18} /> },
  '/settings':            { title: 'Settings',            icon: <Settings size={18} /> },
  '/profile':             { title: 'My Profile',          icon: <User size={18} /> },
  '/change-password':     { title: 'Change Password',      icon: <KeyRound size={18} /> },
};

type TopbarProps = {
  onToggleSidebar: () => void;
  userName:        string;
  userInitial:     string;
};

export default function Topbar({ onToggleSidebar, userName, userInitial }: TopbarProps) {
  const pathname = usePathname();

  // Exact-match first; fall back to regex for dynamic segments.
  type PageMeta = { title: string; icon: React.ReactNode };
  let meta: PageMeta | undefined = PAGE_META[pathname];
  if (!meta) {
    if      (/^\/adjustments\/\d+$/.test(pathname))               meta = { title: 'View Adjustment',       icon: <SlidersHorizontal size={18} /> };
    else if (/^\/products\/\d+\/edit$/.test(pathname))            meta = { title: 'Edit Product',          icon: <Boxes size={18} /> };
    else if (/^\/products\/\d+$/.test(pathname))                  meta = { title: 'View Product',          icon: <Boxes size={18} /> };
    else if (/^\/warehouse\/\d+\/edit$/.test(pathname))           meta = { title: 'Edit Warehouse',        icon: <Warehouse size={18} /> };
    else if (/^\/suppliers\/\d+\/edit$/.test(pathname))           meta = { title: 'Edit Supplier',         icon: <Users size={18} /> };
    else if (/^\/customers\/\d+\/edit$/.test(pathname))           meta = { title: 'Edit Customer',         icon: <Users size={18} /> };
    else if (/^\/users\/\d+\/edit$/.test(pathname))               meta = { title: 'Edit User',             icon: <User size={18} /> };
    else if (/^\/sales\/\d+\/pdf$/.test(pathname))                meta = { title: 'Sale PDF',              icon: <ShoppingCart size={18} /> };
    else if (/^\/sales\/\d+\/edit$/.test(pathname))               meta = { title: 'Edit Sale',             icon: <ShoppingCart size={18} /> };
    else if (/^\/sales\/\d+$/.test(pathname))                     meta = { title: 'View Sale',             icon: <ShoppingCart size={18} /> };
    else if (/^\/purchases\/returns\/\d+\/pdf$/.test(pathname))   meta = { title: 'Purchase Return PDF',   icon: <Receipt size={18} /> };
    else if (/^\/purchases\/returns\/\d+\/edit$/.test(pathname))  meta = { title: 'Edit Purchase Return',  icon: <Receipt size={18} /> };
    else if (/^\/purchases\/returns\/\d+$/.test(pathname))        meta = { title: 'View Purchase Return',  icon: <Receipt size={18} /> };
    else if (/^\/purchases\/\d+\/pdf$/.test(pathname))            meta = { title: 'Purchase PDF',          icon: <Receipt size={18} /> };
    else if (/^\/purchases\/\d+\/edit$/.test(pathname))           meta = { title: 'Edit Purchase',         icon: <Receipt size={18} /> };
    else if (/^\/purchases\/\d+$/.test(pathname))                 meta = { title: 'View Purchase',         icon: <Receipt size={18} /> };
  }

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await signOut({ redirectTo: '/' });
  }

  return (
    <header className="gg-topbar">
      <button className="gg-icon-btn" onClick={onToggleSidebar} title="Toggle sidebar">
        <Menu size={19} />
      </button>

      {meta && (
        <div className="gg-topbar-title">
          <span className="gg-page-chip">{meta.icon}</span>
          <span className="gg-breadcrumb">{meta.title}</span>
        </div>
      )}

      <div className="gg-topbar-spacer" />

      <button className="gg-pos-btn">
        <Monitor size={16} />
        POS
      </button>

      <button className="gg-icon-btn">
        <Grid2X2 size={19} />
      </button>

      {/* User menu */}
      <div ref={containerRef} style={{ position: 'relative' }}>
        <div className="gg-user" onClick={() => setOpen((v) => !v)}>
          <div className="gg-avatar">{userInitial}</div>
          <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{userName}</span>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--gray-400)',
              transition: 'transform .18s',
              transform: open ? 'rotate(180deg)' : undefined,
            }}
          />
        </div>

        {open && (
          <div
            className="gg-menu"
            style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50 }}
          >
            <Link
              href="/profile"
              className="gg-menu-item"
              onClick={() => setOpen(false)}
            >
              <User size={17} />
              Profile
            </Link>

            <Link
              href="/change-password"
              className="gg-menu-item"
              onClick={() => setOpen(false)}
            >
              <KeyRound size={17} />
              Change Password
            </Link>

            <button
              className="gg-menu-item is-danger"
              onClick={handleLogout}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <LogOut size={17} />
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
