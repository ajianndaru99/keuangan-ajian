'use client';

// ==============================================================================
// COMPONENT: src/components/Navbar.tsx
// Navigasi Utama: Desain Finansial Bersih, Rapi, & Profesional
// Mendukung Tab Dashboard, Inbox, Budget, Rekap, Akun, serta Toggle Privacy
// ==============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Inbox,
  Wallet,
  BarChart3,
  Target,
  LogOut,
  Sun,
  Moon,
  Eye,
  EyeOff,
} from 'lucide-react';
import { usePrivacy } from '@/lib/privacy';

interface NavbarProps {
  userRole?: 'suami' | 'istri';
  displayName?: string;
  pendingCount?: number;
  isRealtimeActive?: boolean;
}

export default function Navbar({
  userRole = 'suami',
  displayName,
  pendingCount = 0,
  isRealtimeActive = true,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const { isHideBalance, togglePrivacy } = usePrivacy();

  useEffect(() => {
    const isDarkActive = document.documentElement.classList.contains('dark');
    setIsDark(isDarkActive);
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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      name: 'Inbox',
      href: '/inbox',
      icon: Inbox,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      name: 'Budget',
      href: '/budget',
      icon: Target,
    },
    {
      name: 'Rekap',
      href: '/rekap',
      icon: BarChart3,
    },
    {
      name: 'Akun',
      href: '/accounts',
      icon: Wallet,
    },
  ];

  const roleText = userRole === 'suami' ? 'Suami' : 'Istri';

  return (
    <>
      {/* Top Header Desktop & Mobile */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3 transition-colors">
        <div className="max-w-[1440px] mx-auto w-full flex items-center justify-between">
          {/* Logo & Identitas Pengguna */}
          <div className="flex items-center gap-3">
            <Link href="/" className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-bold text-sm shadow-xs hover:opacity-90 transition-opacity">
              <Wallet className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Link href="/" className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-none hover:underline">
                  Keuangan Keluarga
                </Link>
                {isRealtimeActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Keluarga Ajian
                </span>
              </div>
            </div>
          </div>

          {/* Navigasi Desktop */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.name}</span>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Tombol Privacy, Tema & Keluar */}
          <div className="flex items-center gap-1">
            {/* Tombol Sensor/Sembunyikan Saldo */}
            <button
              onClick={togglePrivacy}
              aria-label={isHideBalance ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Nominal Saldo'}
              title={isHideBalance ? 'Tampilkan Nominal Saldo' : 'Sembunyikan Nominal Saldo (Mode Privasi)'}
              className={`p-2 rounded-xl transition-colors border ${
                isHideBalance
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
              }`}
            >
              {isHideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Tombol Tema */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Tombol Keluar */}
            <button
              onClick={handleLogout}
              title="Keluar"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Floating Bottom Nav (Mobile Saja) */}
      <nav className="md:hidden fixed bottom-3 left-4 right-4 z-30 mx-auto max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl px-2 py-1.5 flex items-center justify-around border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-900/5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
                isActive
                  ? 'text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4" />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2 px-1 py-0.2 text-[9px] font-bold rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px]">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
