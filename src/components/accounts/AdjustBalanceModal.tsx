'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/AdjustBalanceModal.tsx
// Modal Rekonsiliasi / Koreksi Saldo Manual vs m-Banking
// ==============================================================================

import { useState } from 'react';
import { X, Check, Calculator, ArrowRight } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: {
    id: string;
    name: string;
    type: 'bank' | 'ewallet';
    owner: 'suami' | 'istri';
    currentBalance: number;
  } | null;
  onAdjust: (accountId: string, targetBalance: number, notes: string) => Promise<void>;
}

export default function AdjustBalanceModal({
  isOpen,
  onClose,
  account,
  onAdjust,
}: AdjustBalanceModalProps) {
  const [targetStr, setTargetStr] = useState('');
  const [notes, setNotes] = useState('Koreksi Saldo vs m-Banking');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !account) return null;

  const targetAmount = parseFloat(targetStr.replace(/[^\d]/g, '')) || 0;
  const currentAmount = account.currentBalance;
  const diff = targetAmount - currentAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onAdjust(account.id, targetAmount, notes.trim() || 'Koreksi Saldo Manual');
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl liquid-glass border border-white/80 dark:border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-sky-100/70 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200/50">
              <Calculator className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base leading-none">
                Koreksi Saldo {account.name}
              </h3>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Milik: {account.owner === 'suami' ? '👨 Suami' : '👩 Istri'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Saldo Saat Ini di Sistem */}
        <div className="mb-4 p-3 rounded-2xl liquid-pill bg-white/70 dark:bg-black/30 border border-slate-200/80 dark:border-white/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-0.5">
            Saldo Tercatat di Sistem
          </span>
          <p className="text-base font-black text-slate-900 dark:text-white">
            {formatRupiah(currentAmount)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Saldo Asli di Rekening / m-Banking
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={targetStr ? formatRupiah(targetStr) : ''}
              onChange={(e) => {
                const numeric = e.target.value.replace(/[^\d]/g, '');
                setTargetStr(numeric);
              }}
              placeholder="Contoh: Rp 2.500.000"
              className="w-full px-4 py-3 rounded-2xl liquid-pill bg-white/80 dark:bg-black/30 border border-white/90 dark:border-white/10 text-base font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {/* Kalkulasi Selisih Penyesuaian */}
          {targetStr && (
            <div className="p-3 rounded-2xl liquid-pill border border-slate-200/80 dark:border-white/10 text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-600 dark:text-slate-400">Selisih Penyesuaian:</span>
                <span className={diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {diff >= 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                {diff >= 0
                  ? 'Akan dicatat otomatis sebagai penyesuaian saldo masuk (surplus).'
                  : 'Akan dicatat otomatis sebagai penyesuaian saldo keluar (selisih biaya/bunga).'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Keterangan / Catatan
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Rekonsiliasi akhir bulan"
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/80 dark:bg-black/30 border border-white/90 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-800 dark:text-white font-medium"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl liquid-pill border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-white/80 dark:hover:bg-white/10 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !targetStr}
              className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 active:scale-95 transition-all disabled:opacity-50 border border-white/30"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Menyimpan...' : 'Simpan Koreksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
