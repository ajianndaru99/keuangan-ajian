'use client';

// ==============================================================================
// COMPONENT: src/components/Navbar.tsx
// Header & Floating Bottom Dock Liquid Glass dengan Kontras Tajam
// ==============================================================================

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Inbox, Wallet, BarChart3, Target, LogOut, Sun, Moon } from 'lucide-react';

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

  return (
    <>
      {/* Top Header - Frosted Liquid Glass */}
      <header className="sticky top-0 z-30 liquid-glass border-b border-white/80 dark:border-white/10 px-4 py-3 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-sky-400 via-sky-500 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-sky-400/25 border border-white/40">
            <Wallet className="w-4 h-4 text-white drop-shadow-sm" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">
              Keuangan Keluarga
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full liquid-pill text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-white/10">
                {userRole === 'suami' ? '👨 Suami' : '👩 Istri'}
                {displayName ? ` (${displayName})` : ''}
              </span>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-400/50" />
                  Live
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Tombol Ganti Tema */}
          <button
            onClick={toggleTheme}
            aria-label={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
            className="p-2 rounded-2xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition-all border border-slate-200/60 dark:border-transparent"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Tombol Logout */}
          <button
            onClick={handleLogout}
            title="Keluar"
            className="p-2 rounded-2xl text-slate-500 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-950/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Floating Bottom Dock (Liquid Glass Mobile-first) */}
      <nav className="fixed bottom-3 left-4 right-4 z-30 mx-auto max-w-sm md:max-w-md liquid-glass rounded-3xl px-3 py-1.5 flex items-center justify-around shadow-[0_12px_36px_rgba(100,116,139,0.15)] border border-white/90 dark:border-white/10 transition-all">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all ${
                isActive
                  ? 'text-sky-700 dark:text-sky-400 font-black bg-white/90 dark:bg-white/10 shadow-sm shadow-sky-500/10 border border-slate-200/80 dark:border-white/10'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'scale-105' : ''} transition-transform`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 px-1.5 py-0.2 text-[9px] font-black rounded-full bg-rose-600 text-white shadow-sm shadow-rose-500/30 animate-pulse">
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
