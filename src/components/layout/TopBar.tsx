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
  Monitor,
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
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const { isHideBalance, togglePrivacy } = usePrivacy();

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
    setThemeMode(saved);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      const current = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
      if (current === 'system') {
        if (e.matches) {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        }
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const cycleTheme = () => {
    // Siklus 3-arah: Terang -> Gelap -> Sistem Otomatis -> Terang
    const nextMode: 'light' | 'dark' | 'system' =
      themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';

    setThemeMode(nextMode);
    localStorage.setItem('theme', nextMode);

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = nextMode === 'dark' || (nextMode === 'system' && prefersDark);

    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  };

  const getPageTitle = () => {
    if (pathname === '/') {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Dasbor</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">Utama</span>
        </>
      );
    }
    if (pathname.startsWith('/inbox')) {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Daftar</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">Transaksi</span>
        </>
      );
    }
    if (pathname.startsWith('/accounts')) {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Dompet</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">Keluarga</span>
        </>
      );
    }
    if (pathname.startsWith('/budget')) {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Tabungan</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">& Anggaran</span>
        </>
      );
    }
    if (pathname.startsWith('/rekap')) {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Analisis</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">Keuangan</span>
        </>
      );
    }
    if (pathname.startsWith('/supports')) {
      return (
        <>
          <span className="font-extrabold text-[var(--text-main)]">Bantuan</span>{' '}
          <span className="font-semibold italic text-[var(--text-accent-italic)]">MacroDroid</span>
        </>
      );
    }
    return (
      <>
        <span className="font-extrabold text-[var(--text-main)]">Keluarga</span>{' '}
        <span className="font-semibold italic text-[var(--text-accent-italic)]">Ajian</span>
      </>
    );
  };

  return (
    <header className="sticky top-0 z-20 bg-[var(--bg-card)]/95 backdrop-blur-md border-b border-[var(--border-color)] px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Kiri: Hamburger Mobile + Breadcrumb Judul Halaman */}
        <div className="flex items-center gap-3">
          {onOpenMobileSidebar && (
            <button
              onClick={onOpenMobileSidebar}
              className="md:hidden p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div>
            <h1 className="text-base sm:text-lg tracking-tight leading-none">
              {getPageTitle()}
            </h1>
            <span className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5 hidden sm:block">
              Keuangan Keluarga • Ajian
            </span>
          </div>
        </div>

        {/* Tengah: Kolom Pencarian Global (Search Bar ala Foto 2) */}
        <div className="flex-1 max-w-md mx-2 hidden sm:block">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Cari transaksi, merchant, keterangan..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 transition-all"
            />
          </div>
        </div>

        {/* Kanan: Fitur Sensor Saldo, Notifikasi Bell, 3-Way Theme, & Avatar Pengguna */}
        <div className="flex items-center gap-2">
          {/* Tombol Sensor Saldo */}
          <button
            onClick={togglePrivacy}
            title={isHideBalance ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Saldo (Sensor)'}
            className={`p-2 rounded-xl border transition-colors ${
              isHideBalance
                ? 'bg-[var(--surface-2)] text-[var(--accent-color)] border-[var(--border-color)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border-transparent hover:bg-[var(--surface-2)]'
            }`}
          >
            {isHideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Notifikasi Bell */}
          <Link
            href="/inbox"
            title={pendingCount > 0 ? `${pendingCount} transaksi menunggu verifikasi` : 'Semua transaksi tervalidasi'}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-[var(--bg-card)] animate-pulse" />
            )}
          </Link>

          {/* 3-Way Toggle Theme (Terang / Gelap / Sistem) */}
          <button
            onClick={cycleTheme}
            title={
              themeMode === 'light'
                ? 'Tema: Mode Terang (Klik untuk ganti ke Mode Gelap)'
                : themeMode === 'dark'
                ? 'Tema: Mode Gelap (Klik untuk ganti ke Otomatis Sistem)'
                : 'Tema: Otomatis Sistem (Klik untuk ganti ke Mode Terang)'
            }
            aria-label="Ganti Tema Tampilan (Terang / Gelap / Sistem)"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors relative flex items-center justify-center"
          >
            {themeMode === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
            {themeMode === 'dark' && <Moon className="w-4 h-4 text-indigo-400" />}
            {themeMode === 'system' && <Monitor className="w-4 h-4 text-sky-400" />}
          </button>

          {/* Avatar Profil: Keluarga Ajian */}
          <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-color)] ml-1">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
              <img
                src={userRole === 'suami' ? '/avatars/suami.png' : '/avatars/istri.png'}
                alt={userRole === 'suami' ? 'Kepala Keluarga' : 'Istri'}
                width={32}
                height={32}
                style={{ width: '32px', height: '32px' }}
                className="w-full h-full object-cover rounded-full dark:brightness-90 dark:contrast-[0.98]"
              />
            </div>
            <div className="hidden lg:block text-left">
              <span className="text-xs font-bold text-[var(--text-main)] block leading-none">
                {userRole === 'suami' ? 'Kepala Keluarga' : (displayName || 'Istri')}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block capitalize">
                {userRole === 'suami' ? 'Kepala Keluarga' : 'Bendahara'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
