'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/BalanceCard.tsx
// Kartu Saldo Akun: Palet Pastel Soft, Bersih & Kontras Tulisan Jelas
// ==============================================================================

import { Building2, Smartphone, Calculator, Settings2 } from 'lucide-react';
import { formatMaskedRupiah } from '@/lib/privacy';
import { AccountData } from './ManageAccountModal';

export interface AccountBalanceItem extends AccountData {
  id: string;
  current_balance: number;
  reconciled_tx_count?: number;
}

interface BalanceCardProps {
  account: AccountBalanceItem;
  isHideBalance?: boolean;
  onOpenAdjust: (account: AccountBalanceItem) => void;
  onOpenEdit: (account: AccountBalanceItem) => void;
}

export default function BalanceCard({
  account,
  isHideBalance = false,
  onOpenAdjust,
  onOpenEdit,
}: BalanceCardProps) {
  const isBank = account.type === 'bank';
  const ownerLabel = account.owner === 'suami' ? 'Suami' : 'Istri';

  // Tema warna pastel cerah & teks tajam
  const getPastelTheme = () => {
    const n = (account.name || '').toLowerCase();
    if (n.includes('bca') || n.includes('bri')) {
      return {
        card: 'bg-sky-50/80 dark:bg-sky-950/25 border-sky-200 dark:border-sky-800/60',
        iconBg: 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700',
        badge: 'bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
        title: 'text-sky-950 dark:text-white',
        amount: 'text-sky-900 dark:text-sky-300',
      };
    }
    if (n.includes('mandiri') || n.includes('jago')) {
      return {
        card: 'bg-amber-50/80 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60',
        iconBg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700',
        badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        title: 'text-amber-950 dark:text-white',
        amount: 'text-amber-900 dark:text-amber-300',
      };
    }
    if (n.includes('gopay') || n.includes('dana')) {
      return {
        card: 'bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/60',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
        badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        title: 'text-emerald-950 dark:text-white',
        amount: 'text-emerald-900 dark:text-emerald-300',
      };
    }
    if (n.includes('ovo') || n.includes('shopee')) {
      return {
        card: 'bg-purple-50/80 dark:bg-purple-950/25 border-purple-200 dark:border-purple-800/60',
        iconBg: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
        badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        title: 'text-purple-950 dark:text-white',
        amount: 'text-purple-900 dark:text-purple-300',
      };
    }
    return {
      card: 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      badge: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      title: 'text-slate-900 dark:text-white',
      amount: 'text-slate-900 dark:text-white',
    };
  };

  const theme = getPastelTheme();

  return (
    <div
      className={`rounded-3xl p-5 transition-all border shadow-xs ${theme.card} ${
        !account.is_active ? 'opacity-60 saturate-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${theme.iconBg}`}>
            {isBank ? (
              <Building2 className="w-5 h-5" />
            ) : (
              <Smartphone className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className={`text-sm font-bold leading-tight truncate ${theme.title}`}>
                {account.name}
              </h4>
              {!account.is_active && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  Nonaktif
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mt-0.5">
              {isBank ? 'Rekening Bank' : 'Dompet Digital'}
            </span>
          </div>
        </div>

        {/* Badge Pemilik */}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${theme.badge}`}>
          {ownerLabel}
        </span>
      </div>

      {/* Saldo Terkini */}
      <div className="my-3 p-3.5 rounded-2xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/50 dark:border-white/5 shadow-2xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-0.5">
          Estimasi Saldo Riil
        </span>
        <p className={`text-lg font-black tracking-tight ${theme.amount}`}>
          {formatMaskedRupiah(account.current_balance, isHideBalance)}
        </p>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-1">
          Saldo Awal: {formatMaskedRupiah(account.initial_balance, isHideBalance)}
        </span>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
        <button
          onClick={() => onOpenAdjust(account)}
          className="flex-1 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white/90 dark:bg-white/5 hover:bg-white text-slate-800 dark:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
        >
          <Calculator className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>Koreksi Saldo</span>
        </button>

        <button
          onClick={() => onOpenEdit(account)}
          title="Pengaturan Akun"
          className="p-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
