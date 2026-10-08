'use client';

// ==============================================================================
// COMPONENT: src/components/layout/TopBar.tsx
// Header Atas Gaya Foto 2: Search Bar, Status Notifikasi, Sensor Saldo, & Profil
// ==============================================================================

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { usePrivacy } from '@/lib/privacy';
import {
  Search,
  Bell,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Menu,
} from 'lucide-react';

interface TopBarProps {
  userRole?: 'suami' | 'istri';
  displayName?: string;
  pendingCount?: number;
  onOpenMobileSidebar?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function TopBar({
  userRole = 'suami',
  displayName,
  pendingCount = 0,
  onOpenMobileSidebar,
  searchQuery,
  onSearchChange,
}: TopBarProps) {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);
  const { isHideBalance, togglePrivacy } = usePrivacy();

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard';
    if (pathname.startsWith('/inbox')) return 'Transactions';
    if (pathname.startsWith('/accounts')) return 'My Wallet';
    if (pathname.startsWith('/budget')) return 'Savings & Budget';
    if (pathname.startsWith('/rekap')) return 'Analytics';
    if (pathname.startsWith('/supports')) return 'Supports & Help';
    return 'Keluarga Ajian';
  };

  return (
    <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Kiri: Hamburger Mobile + Breadcrumb Judul Halaman */}
        <div className="flex items-center gap-3">
          {onOpenMobileSidebar && (
            <button
              onClick={onOpenMobileSidebar}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              {getPageTitle()}
            </h1>
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-0.5 hidden sm:block">
              Keuangan Keluarga • Ajian
            </span>
          </div>
        </div>

        {/* Tengah: Kolom Pencarian Global (Search Bar ala Foto 2) */}
        <div className="flex-1 max-w-md mx-2 hidden sm:block">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Cari transaksi, merchant, keterangan..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Kanan: Fitur Sensor Saldo, Notifikasi Bell, Theme, & Avatar Pengguna */}
        <div className="flex items-center gap-2">
          {/* Tombol Sensor Saldo */}
          <button
            onClick={togglePrivacy}
            title={isHideBalance ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Saldo (Sensor)'}
            className={`p-2 rounded-xl border transition-colors ${
              isHideBalance
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {isHideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Notifikasi Bell */}
          <Link
            href="/inbox"
            title={pendingCount > 0 ? `${pendingCount} transaksi menunggu verifikasi` : 'Semua transaksi tervalidasi'}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            )}
          </Link>

          {/* Toggle Dark/Light Mode */}
          <button
            onClick={toggleTheme}
            title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Avatar Profil: Keluarga Ajian */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200/80 dark:border-slate-800/80 ml-1">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center border border-indigo-200 dark:border-indigo-700">
              {userRole === 'suami' ? '👨' : '👩'}
            </div>
            <div className="hidden lg:block text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white block leading-none">
                {displayName || 'Keluarga Ajian'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 block capitalize">
                {userRole === 'suami' ? 'Suami' : 'Istri'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
