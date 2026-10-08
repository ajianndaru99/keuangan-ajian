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

  return (
    <div
      className={`rounded-3xl p-5 transition-all border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xs ${
        !account.is_active ? 'opacity-60 saturate-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border border-[var(--border-color)] bg-[var(--bg-main)] text-[#007a33]">
            {isBank ? (
              <Building2 className="w-5 h-5" />
            ) : (
              <Smartphone className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold leading-tight truncate text-[var(--text-main)]">
                {account.name}
              </h4>
              {!account.is_active && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]/70">
                  Nonaktif
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-[#007a33] block mt-0.5">
              {isBank ? 'Rekening Bank' : 'Dompet Digital'}
            </span>
          </div>
        </div>

        {/* Badge Pemilik */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border border-[var(--border-color)]/80 bg-[var(--bg-main)] text-[#007a33] shrink-0">
          {ownerLabel}
        </span>
      </div>

      {/* Saldo Terkini */}
      <div className="my-3 p-3.5 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/80 shadow-2xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#007a33] block mb-0.5">
          Estimasi Saldo Riil
        </span>
        <p className="text-lg font-black tracking-tight text-[var(--text-main)] angka-keuangan">
          {formatMaskedRupiah(account.current_balance, isHideBalance)}
        </p>
        <span className="text-[10px] text-[#007a33] block mt-1 angka-keuangan">
          Saldo Awal: {formatMaskedRupiah(account.initial_balance, isHideBalance)}
        </span>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color)]/60">
        <button
          onClick={() => onOpenAdjust(account)}
          className="flex-1 py-1.5 px-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-card)] text-[#007a33] hover:text-[#004d00] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Koreksi Saldo</span>
        </button>

        <button
          onClick={() => onOpenEdit(account)}
          title="Pengaturan Akun"
          className="p-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-card)] text-[#007a33] hover:text-[#004d00] transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
