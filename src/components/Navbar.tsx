'use client';

// ==============================================================================
// COMPONENT: src/components/Navbar.tsx
// Header & Bottom Navigation Bar mobile-first dengan Toggle Tema Terang/Gelap
// ==============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Inbox, Wallet, BarChart3, Settings, LogOut, Sun, Moon } from 'lucide-react';

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

  useEffect(() => {
    // Cek tema awal dari HTML element
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
      name: 'Inbox',
      href: '/inbox',
      icon: Inbox,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      name: 'Akun',
      href: '/accounts',
      icon: Wallet,
    },
    {
      name: 'Rekap',
      href: '/rekap',
      icon: BarChart3,
    },
    {
      name: 'Pengaturan',
      href: '/settings',
      icon: Settings,
    },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#0f172a]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 py-3 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              Keuangan Keluarga
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                {userRole === 'suami' ? '👨 Suami' : '👩 Istri'}
                {displayName ? ` (${displayName})` : ''}
              </span>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Tombol Ganti Tema Terang/Gelap */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Tombol Logout */}
          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Bottom Floating Navigation (Mobile-first) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 mx-auto max-w-md md:max-w-xl bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 px-6 py-2 flex items-center justify-around shadow-[0_-4px_20px_rgba(0,0,0,0.03)] transition-colors">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-rose-600 text-white shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
