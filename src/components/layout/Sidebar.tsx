'use client';

// ==============================================================================
// COMPONENT: src/components/layout/Sidebar.tsx
// Navigasi Vertikal Gaya Foto 2: Brand "Keluarga Ajian" & Palet Pastel Soft
// ==============================================================================

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  ReceiptText,
  Wallet,
  Target,
  BarChart3,
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react';

interface SidebarProps {
  pendingCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({
  pendingCount = 0,
  isOpenMobile = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const menuItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      name: 'Transactions',
      href: '/inbox',
      icon: ReceiptText,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      name: 'My Wallet',
      href: '/accounts',
      icon: Wallet,
    },
    {
      name: 'Savings',
      href: '/budget',
      icon: Target,
    },
    {
      name: 'Analytics',
      href: '/rekap',
      icon: BarChart3,
    },
  ];

  const generalItems = [
    {
      name: 'Supports',
      href: '/supports',
      icon: HelpCircle,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--surface-1)] border-r border-[var(--border-color)] w-64 select-none text-[var(--text-main)]">
      {/* Brand Header: Keluarga Ajian */}
      <div className="p-5 flex items-center justify-between border-b border-[var(--border-color)]">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] text-[var(--accent-color)] flex items-center justify-center font-bold shadow-xs border border-[var(--border-color)]">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-[var(--text-main)] tracking-tight">
                Keluarga Ajian
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-income)] animate-pulse" />
            </div>
            <span className="text-[10px] font-medium text-[var(--text-muted)] block">
              Financial Management
            </span>
          </div>
        </Link>

        {/* Close Button untuk Mobile Drawer */}
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigasi Menu */}
      <div className="flex-1 py-4 px-3 space-y-6 overflow-y-auto no-scrollbar">
        {/* Grup 1: MENU */}
        <div>
          <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
            MENU
          </span>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-sm font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.name}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                        isActive
                          ? 'bg-[var(--surface-1)] text-[var(--accent-color)]'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Grup 2: GENERAL */}
        <div>
          <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
            GENERAL
          </span>
          <nav className="space-y-1">
            {generalItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-sm font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer: Tombol Keluar */}
      <div className="p-3 border-t border-[var(--border-color)]">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-[var(--color-expense)] hover:bg-[var(--color-expense)]/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar Desktop (Fixed di Kiri) */}
      <aside className="hidden md:flex flex-col shrink-0 sticky top-0 h-screen z-30">
        {sidebarContent}
      </aside>

      {/* Drawer Sidebar Mobile dengan Overlay Halus */}
      {isOpenMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[var(--bg-card)] shadow-xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
