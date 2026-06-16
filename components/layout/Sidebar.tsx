'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Boxes, SlidersHorizontal, FileText,
  Receipt, ShoppingCart, Repeat, Wallet, Users, ShieldCheck,
  Warehouse, BarChart3, DollarSign, Languages, LayoutTemplate,
  Settings, ChevronRight, Search, Truck, User,
} from 'lucide-react';

type NavChild = {
  label:       string;
  href:        string;
  icon?:       React.ReactNode;
  permission?: string;
};

type NavItem = {
  label:       string;
  href?:       string;
  icon?:       React.ReactNode;
  permission?: string;
  children?:   NavChild[];
};

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard />, permission: 'Manage Dashboard' },
  {
    label: 'Products',
    icon: <Boxes />,
    children: [
      { label: 'Products',           href: '/products',           permission: 'Manage Products' },
      { label: 'Product Categories', href: '/product-categories', permission: 'Manage Product Categories' },
      { label: 'Brands',             href: '/brands',             permission: 'Manage Brands' },
      { label: 'Units',              href: '/units',              permission: 'Manage Units' },
      { label: 'Base Units',         href: '/base-units',         permission: 'Manage Units' },
      { label: 'Print Barcode',      href: '/print-barcode',      permission: 'Manage Products' },
    ],
  },
  { label: 'Adjustments', href: '/adjustments', icon: <SlidersHorizontal />, permission: 'Manage Adjustments' },
  { label: 'Quotations',  href: '/quotations',  icon: <FileText />,          permission: 'Manage Quotations'  },
  {
    label: 'Purchases',
    icon: <Receipt />,
    children: [
      { label: 'Purchases',         href: '/purchases',         permission: 'Manage Purchase'        },
      { label: 'Purchases Returns', href: '/purchases/returns', permission: 'Manage Purchase Return' },
    ],
  },
  {
    label: 'Sales',
    icon: <ShoppingCart />,
    children: [
      { label: 'Sales',         href: '/sales',         permission: 'Manage Sale'        },
      { label: 'Sales Returns', href: '/sales-returns', permission: 'Manage Sale Return' },
    ],
  },
  { label: 'Transfers', href: '/transfers', icon: <Repeat />, permission: 'Manage Transfers' },
  {
    label: 'Expenses',
    icon: <Wallet />,
    children: [
      { label: 'Expenses',           href: '/expenses',           permission: 'Manage Expenses'           },
      { label: 'Expense Categories', href: '/expense-categories', permission: 'Manage Expense Categories' },
    ],
  },
  {
    label: 'Peoples',
    icon: <Users />,
    children: [
      { label: 'Suppliers', href: '/suppliers', icon: <Truck />, permission: 'Manage Suppliers' },
      { label: 'Customers', href: '/customers', icon: <Users />, permission: 'Manage Customers' },
      { label: 'Users',     href: '/users',     icon: <User />,  permission: 'Manage Users'     },
    ],
  },
  { label: 'Roles/Permissions', href: '/roles',      icon: <ShieldCheck />, permission: 'Manage Roles'      },
  { label: 'Warehouse',         href: '/warehouse',  icon: <Warehouse />,   permission: 'Manage Warehouses' },
  { label: 'Reports',           href: '/reports',    icon: <BarChart3 />,   permission: 'Manage Reports'    },
  { label: 'Currencies',        href: '/currencies', icon: <DollarSign />,  permission: 'Manage Currency'   },
  { label: 'Languages',         href: '/languages',  icon: <Languages />,   permission: 'Manage Language'   },
  {
    label: 'Templates',
    icon: <LayoutTemplate />,
    children: [
      { label: 'SMS Templates',   href: '/templates/sms',   permission: 'Manage Sms Templates'   },
      { label: 'Email Templates', href: '/templates/email', permission: 'Manage Email Templates' },
    ],
  },
  { label: 'Settings', href: '/settings', icon: <Settings />, permission: 'Manage Setting' },
];

type SidebarProps = {
  collapsed:       boolean;
  userPermissions: string[];
};

function NavGroup({
  item,
  collapsed,
  pathname,
  userPermissions,
}: {
  item:            NavItem;
  collapsed:       boolean;
  pathname:        string;
  userPermissions: string[];
}) {
  const allowed = (perm?: string) => !perm || userPermissions.includes(perm);

  // Pre-filter children so the group open-state reflects only visible items.
  const visibleChildren = item.children?.filter((c) => allowed(c.permission));

  const isChildActive = visibleChildren?.some((c) => pathname.startsWith(c.href)) ?? false;
  const [open, setOpen] = useState(isChildActive);

  // Leaf item
  if (!item.children) {
    if (!allowed(item.permission)) return null;
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

  // Group: hide entirely if no children pass the permission filter.
  if (!visibleChildren || visibleChildren.length === 0) return null;

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
        {visibleChildren.map((child) => {
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

export default function Sidebar({ collapsed, userPermissions }: SidebarProps) {
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
            userPermissions={userPermissions}
          />
        ))}
      </nav>
    </aside>
  );
}
