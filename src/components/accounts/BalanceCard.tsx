'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/BalanceCard.tsx
// Kartu Saldo Akun: Desain Finansial Minimalis & Sensor Saldo
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

  return (
    <div
      className={`rounded-2xl p-4 transition-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs ${
        !account.is_active ? 'opacity-60 saturate-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {isBank ? (
              <Building2 className="w-4 h-4" />
            ) : (
              <Smartphone className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                {account.name}
              </h4>
              {!account.is_active && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
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
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
          {ownerLabel}
        </span>
      </div>

      {/* Saldo Terkini */}
      <div className="my-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
          Estimasi Saldo
        </span>
        <p className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
          {formatMaskedRupiah(account.current_balance, isHideBalance)}
        </p>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block mt-1">
          Saldo Awal: {formatMaskedRupiah(account.initial_balance, isHideBalance)}
        </span>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
        <button
          onClick={() => onOpenAdjust(account)}
          className="flex-1 py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Calculator className="w-3.5 h-3.5 text-slate-500" />
          <span>Koreksi Saldo</span>
        </button>

        <button
          onClick={() => onOpenEdit(account)}
          title="Pengaturan Akun"
          className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
