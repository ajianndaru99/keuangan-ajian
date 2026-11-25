'use client';

// ==============================================================================
// COMPONENT: src/components/layout/Sidebar.tsx
// Navigasi Minimalis: Khusus Menu Tunggal Rekap & Analisis + Pusat Kendali Bot
// ==============================================================================

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from './BrandLogo';
import { LogOut, X, PieChart, Bot } from 'lucide-react';

interface SidebarProps {
  pendingCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({
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

  const isRekapActive = pathname === '/' || pathname.startsWith('/rekap');

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--surface-1)] border-r border-[var(--border-color)] w-64 select-none text-[var(--text-main)]">
      <div className="p-5 flex items-center justify-between border-b border-[var(--border-color)]">
        <Link href="/" className="flex items-center gap-3 group">
          <BrandLogo size="md" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-extrabold text-[var(--text-main)] tracking-tight">
                Keluarga Ajian
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-income)]" />
            </div>
            <span className="text-[10px] font-medium text-[var(--text-muted)] block">
              Financial Analytics
            </span>
          </div>
        </Link>

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

      <div className="flex-1 py-4 px-3 overflow-y-auto no-scrollbar">
        <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">
          MENU
        </span>
        <nav className="space-y-1">
          <Link
            href="/"
            onClick={onCloseMobile}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              isRekapActive
                ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-sm font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <PieChart className="w-4 h-4 shrink-0" />
            <span>Rekap &amp; Analisis</span>
          </Link>
        </nav>
      </div>

      <div className="p-3 border-t border-[var(--border-color)] space-y-2">
        <div className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[var(--text-main)]">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-[var(--accent-color)] shrink-0" />
            <span className="text-[11px] font-bold">Pusat Kendali Bot</span>
          </div>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            Seluruh transaksi, saldo, pagu, &amp; spam dikelola via Telegram:
            <code className="block mt-1 font-mono font-bold text-[10px] text-[var(--accent-color)]">/pengaturan</code>
          </p>
        </div>

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
      <aside className="hidden md:flex flex-col shrink-0 sticky top-0 h-screen z-30">
        {sidebarContent}
      </aside>

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
