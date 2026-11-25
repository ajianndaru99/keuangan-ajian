'use client';

// ==============================================================================
// COMPONENT: src/components/layout/TopBar.tsx
// Header Atas Ringkas: Judul Rekap & Analisis, Sensor Saldo, Refresh, Tema, Profil
// ==============================================================================

import { useState, useEffect } from 'react';
import { usePrivacy } from '@/lib/privacy';
import BrandLogo from './BrandLogo';
import {
  Sun,
  Moon,
  Monitor,
  Eye,
  EyeOff,
  Menu,
  RotateCw,
} from 'lucide-react';

interface TopBarProps {
  displayName?: string;
  onOpenMobileSidebar?: () => void;
}

export default function TopBar({
  displayName,
  onOpenMobileSidebar,
}: TopBarProps) {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const { isHideBalance, togglePrivacy } = usePrivacy();

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
    setThemeMode(saved);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      const current = (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
      if (current === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
        document.documentElement.classList.toggle('light', !e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const cycleTheme = () => {
    const nextMode: 'light' | 'dark' | 'system' =
      themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';

    setThemeMode(nextMode);
    localStorage.setItem('theme', nextMode);

    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = nextMode === 'dark' || (nextMode === 'system' && prefersDark);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  };

  return (
    <header className="sticky top-0 z-20 bg-[var(--bg-card)]/95 backdrop-blur-md border-b border-[var(--border-color)] px-4 sm:px-6 lg:px-8 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
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

          <BrandLogo size="sm" className="md:hidden" />

          <div>
            <h1 className="text-base sm:text-lg font-bold text-[var(--text-main)] tracking-tight leading-none">
              Rekap &amp; Analisis
            </h1>
            <span className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5 hidden sm:block">
              Keuangan Keluarga • Ajian
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={() => {
              if (
                typeof window !== 'undefined' &&
                (window as unknown as { AndroidBridge?: { checkForUpdate?: () => void } }).AndroidBridge?.checkForUpdate
              ) {
                try {
                  (window as unknown as { AndroidBridge: { checkForUpdate: () => void } }).AndroidBridge.checkForUpdate();
                } catch {
                  // Abaikan
                }
              }
              window.location.reload();
            }}
            title="Muat ulang aplikasi & periksa pembaruan"
            aria-label="Muat Ulang Aplikasi"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            onClick={cycleTheme}
            title="Ganti Tema (Terang / Gelap / Sistem)"
            aria-label="Ganti Tema Tampilan"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center"
          >
            {themeMode === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
            {themeMode === 'dark' && <Moon className="w-4 h-4 text-indigo-400" />}
            {themeMode === 'system' && <Monitor className="w-4 h-4 text-sky-400" />}
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-[var(--border-color)] ml-1">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
              <img
                src="/avatars/suami.png"
                alt={displayName || 'Kepala Keluarga'}
                width={32}
                height={32}
                style={{ width: '32px', height: '32px' }}
                className="w-full h-full object-cover rounded-full dark:brightness-90 dark:contrast-[0.98]"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
