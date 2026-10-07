'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/BalanceCard.tsx
// Kartu Saldo Akun dengan Soft Pastel Liquid Glass & Aksi Koreksi
// ==============================================================================

import { Building2, Smartphone, Calculator, Settings2 } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { AccountData } from './ManageAccountModal';

export interface AccountBalanceItem extends AccountData {
  id: string;
  current_balance: number;
  reconciled_tx_count?: number;
}

interface BalanceCardProps {
  account: AccountBalanceItem;
  onOpenAdjust: (account: AccountBalanceItem) => void;
  onOpenEdit: (account: AccountBalanceItem) => void;
}

export default function BalanceCard({
  account,
  onOpenAdjust,
  onOpenEdit,
}: BalanceCardProps) {
  const isBank = account.type === 'bank';

  return (
    <div
      className={`rounded-3xl p-4 transition-all liquid-glass relative overflow-hidden ${
        !account.is_active ? 'opacity-60 saturate-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm border border-white/50 ${
              isBank
                ? 'bg-gradient-to-tr from-sky-400 to-blue-500 shadow-sky-400/20'
                : 'bg-gradient-to-tr from-emerald-400 to-teal-500 shadow-emerald-400/20'
            }`}
          >
            {isBank ? (
              <Building2 className="w-5 h-5 drop-shadow-sm" />
            ) : (
              <Smartphone className="w-5 h-5 drop-shadow-sm" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                {account.name}
              </h4>
              {!account.is_active && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  Nonaktif
                </span>
              )}
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
              {isBank ? 'Rekening Bank' : 'Dompet Digital'}
            </span>
          </div>
        </div>

        {/* Badge Pemilik */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
            account.owner === 'suami'
              ? 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-300 border-sky-300/80 dark:border-sky-800/50'
              : 'bg-pink-100 text-pink-900 dark:bg-pink-950/50 dark:text-pink-300 border-pink-300/80 dark:border-pink-800/50'
          }`}
        >
          {account.owner === 'suami' ? '👨 Suami' : '👩 Istri'}
        </span>
      </div>

      {/* Saldo Terkini */}
      <div className="my-3 p-3 rounded-2xl liquid-pill bg-white/70 dark:bg-black/30 border border-slate-200/80 dark:border-white/10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-0.5">
          Estimasi Saldo Saat Ini
        </span>
        <p className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
          {formatRupiah(account.current_balance)}
        </p>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mt-1">
          Saldo Awal: {formatRupiah(account.initial_balance)}
        </span>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-white/10">
        <button
          onClick={() => onOpenAdjust(account)}
          className="flex-1 py-2 px-3 rounded-2xl liquid-pill bg-white/80 dark:bg-white/10 hover:bg-sky-50 text-sky-800 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/50 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
        >
          <Calculator className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Koreksi Saldo</span>
        </button>

        <button
          onClick={() => onOpenEdit(account)}
          title="Pengaturan Akun"
          className="p-2 rounded-2xl liquid-pill border border-slate-200/80 dark:border-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10 transition-all"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
