'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/BalanceCard.tsx
// Kartu Saldo Akun: Palet Pastel Soft & Bersih di atas Latar Gelap
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

  // Penentuan tema warna pastel berdasarkan nama bank / e-wallet
  const getPastelTheme = () => {
    const n = (account.name || '').toLowerCase();
    if (n.includes('bca') || n.includes('bri')) {
      return {
        card: 'bg-sky-950/25 border-sky-500/25',
        iconBg: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
        amount: 'text-sky-300',
      };
    }
    if (n.includes('mandiri') || n.includes('jago')) {
      return {
        card: 'bg-amber-950/25 border-amber-500/25',
        iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        amount: 'text-amber-300',
      };
    }
    if (n.includes('gopay') || n.includes('dana')) {
      return {
        card: 'bg-emerald-950/25 border-emerald-500/25',
        iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        amount: 'text-emerald-300',
      };
    }
    if (n.includes('ovo') || n.includes('shopee')) {
      return {
        card: 'bg-purple-950/25 border-purple-500/25',
        iconBg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        amount: 'text-purple-300',
      };
    }
    return {
      card: 'bg-slate-900/60 border-slate-700/50',
      iconBg: 'bg-slate-800 text-slate-300 border-slate-700',
      badge: 'bg-slate-800 text-slate-300 border-slate-700',
      amount: 'text-white',
    };
  };

  const theme = getPastelTheme();

  return (
    <div
      className={`rounded-3xl p-5 transition-all border shadow-sm backdrop-blur-xs ${theme.card} ${
        !account.is_active ? 'opacity-50 saturate-50' : ''
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
              <h4 className="text-sm font-bold text-white leading-tight truncate">
                {account.name}
              </h4>
              {!account.is_active && (
                <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                  Nonaktif
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
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
      <div className="my-3 p-3.5 rounded-2xl bg-slate-950/40 border border-white/5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
          Estimasi Saldo Riil
        </span>
        <p className={`text-lg font-black tracking-tight ${theme.amount}`}>
          {formatMaskedRupiah(account.current_balance, isHideBalance)}
        </p>
        <span className="text-[10px] text-slate-400 block mt-1">
          Saldo Awal: {formatMaskedRupiah(account.initial_balance, isHideBalance)}
        </span>
      </div>

      {/* Tombol Aksi */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <button
          onClick={() => onOpenAdjust(account)}
          className="flex-1 py-1.5 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Calculator className="w-3.5 h-3.5 text-slate-400" />
          <span>Koreksi Saldo</span>
        </button>

        <button
          onClick={() => onOpenEdit(account)}
          title="Pengaturan Akun"
          className="p-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
