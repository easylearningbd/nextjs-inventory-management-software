'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  SlidersHorizontal,
  FileText,
  Receipt,
  ShoppingCart,
  Repeat,
  Wallet,
  Users,
  ShieldCheck,
  Warehouse,
  BarChart3,
  DollarSign,
  Languages,
  LayoutTemplate,
  Settings,
  ChevronRight,
  Search,
  Truck,
  User,
} from 'lucide-react';

type NavItem = {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  children?: { label: string; href: string; icon?: React.ReactNode }[];
};

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard /> },
  {
    label: 'Products',
    icon: <Boxes />,
    children: [
      { label: 'Products', href: '/products' },
      { label: 'Product Categories', href: '/product-categories' },
      { label: 'Brands', href: '/brands' },
      { label: 'Units', href: '/units' },
      { label: 'Base Units', href: '/base-units' },
      { label: 'Print Barcode', href: '/print-barcode' },
    ],
  },
  { label: 'Adjustments', href: '/adjustments', icon: <SlidersHorizontal /> },
  { label: 'Quotations', href: '/quotations', icon: <FileText /> },
  {
    label: 'Purchases',
    icon: <Receipt />,
    children: [
      { label: 'Purchases', href: '/purchases' },
      { label: 'Purchases Returns', href: '/purchases/returns' },
    ],
  },
  {
    label: 'Sales',
    icon: <ShoppingCart />,
    children: [
      { label: 'Sales', href: '/sales' },
      { label: 'Sales Returns', href: '/sales-returns' },
    ],
  },
  { label: 'Transfers', href: '/transfers', icon: <Repeat /> },
  {
    label: 'Expenses',
    icon: <Wallet />,
    children: [
      { label: 'Expenses', href: '/expenses' },
      { label: 'Expense Categories', href: '/expense-categories' },
    ],
  },
  {
    label: 'Peoples',
    icon: <Users />,
    children: [
      { label: 'Suppliers', href: '/suppliers', icon: <Truck /> },
      { label: 'Customers', href: '/customers', icon: <Users /> },
      { label: 'Users', href: '/users', icon: <User /> },
    ],
  },
  { label: 'Roles/Permissions', href: '/roles', icon: <ShieldCheck /> },
  { label: 'Warehouse', href: '/warehouse', icon: <Warehouse /> },
  { label: 'Reports', href: '/reports', icon: <BarChart3 /> },
  { label: 'Currencies', href: '/currencies', icon: <DollarSign /> },
  { label: 'Languages', href: '/languages', icon: <Languages /> },
  {
    label: 'Templates',
    icon: <LayoutTemplate />,
    children: [
      { label: 'SMS Templates', href: '/templates/sms' },
      { label: 'Email Templates', href: '/templates/email' },
    ],
  },
  { label: 'Settings', href: '/settings', icon: <Settings /> },
];

type SidebarProps = {
  collapsed: boolean;
};

function NavGroup({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}) {
  const isChildActive = item.children?.some((c) => pathname.startsWith(c.href ?? '')) ?? false;
  const [open, setOpen] = useState(isChildActive);

  if (!item.children) {
    const active = pathname === item.href;
    return (
      <Link
        href={item.href ?? '#'}
        className={`gg-nav-item${active ? ' is-active' : ''}`}
        title={collapsed ? item.label : undefined}
      >
        <span className="gg-nav-ico">{item.icon}</span>
        <span className="gg-nav-label">{item.label}</span>
      </Link>
    );
  }

  return (
    <div className={`gg-nav-group${open ? ' is-open' : ''}`}>
      <div
        className="gg-nav-item"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <span className="gg-nav-ico">{item.icon}</span>
        <span className="gg-nav-label">{item.label}</span>
        <ChevronRight className="gg-nav-chev" />
      </div>
      <div className="gg-nav-sub">
        {item.children.map((child) => {
          const active = pathname === child.href;
          return (
            <Link
              key={child.href}
              href={child.href}
              className={`gg-nav-item${active ? ' is-active' : ''}`}
            >
              {child.icon && <span className="gg-nav-ico">{child.icon}</span>}
              <span className="gg-nav-label">{child.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="gg-sidebar">
      <div className="gg-brand">
        <div className="gg-brand-mark">G</div>
        <span className="gg-brand-name">GildedGlow</span>
      </div>
      <div className="gg-sidebar-search">
        <div className="gg-input-icon">
          <Search size={16} />
          <input className="gg-input" type="text" placeholder="Search" />
        </div>
      </div>
      <nav className="gg-nav">
        {NAV.map((item) => (
          <NavGroup
            key={item.label}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}
      </nav>
    </aside>
  );
}
