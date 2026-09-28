'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/QuickEditModal.tsx
// Formulir edit cepat — Soft Pastel Liquid Glass
// ==============================================================================

import { useState } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

interface QuickEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (amount: number, merchant: string, direction: 'out' | 'in') => Promise<void>;
  initialAmount: number;
  initialMerchant: string;
  initialDirection: 'out' | 'in';
  rawNotification?: string;
}

export default function QuickEditModal({
  isOpen,
  onClose,
  onSave,
  initialAmount,
  initialMerchant,
  initialDirection,
  rawNotification,
}: QuickEditModalProps) {
  const [amountStr, setAmountStr] = useState(initialAmount > 0 ? initialAmount.toString() : '');
  const [merchant, setMerchant] = useState(initialMerchant);
  const [direction, setDirection] = useState<'out' | 'in'>(initialDirection);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = parseFloat(amountStr.replace(/[^\d]/g, '')) || 0;
    setLoading(true);
    await onSave(cleanAmount, merchant.trim() || 'Transaksi', direction);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl liquid-glass border border-white/80 dark:border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-amber-100/70 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50">
              <AlertCircle className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-800 dark:text-white text-base">
              Koreksi Transaksi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rawNotification && (
          <div className="mb-4 p-3 rounded-2xl liquid-pill bg-white/40 dark:bg-black/30 border border-white/60 dark:border-white/10 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-400 dark:text-slate-400 text-[10px] uppercase mb-1">
              Isi Notifikasi Asli:
            </p>
            <p className="italic line-clamp-3 leading-relaxed">"{rawNotification}"</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Arah Transaksi */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl liquid-pill bg-white/40 dark:bg-slate-800/40">
            <button
              type="button"
              onClick={() => setDirection('out')}
              className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                direction === 'out'
                  ? 'bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-sm shadow-rose-500/20'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              💸 Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setDirection('in')}
              className={`py-2 text-xs font-semibold rounded-xl transition-all ${
                direction === 'in'
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/20'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              💰 Pemasukan
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nominal (Rupiah)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={amountStr ? formatRupiah(amountStr) : ''}
              onChange={(e) => {
                const numeric = e.target.value.replace(/[^\d]/g, '');
                setAmountStr(numeric);
              }}
              placeholder="Rp 0"
              className="w-full px-4 py-3 rounded-2xl liquid-pill bg-white/60 dark:bg-black/30 border border-white/80 dark:border-white/10 text-base font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Merchant / Keterangan
            </label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Contoh: Kopi Kenangan / Token Listrik"
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/60 dark:bg-black/30 border border-white/80 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-800 dark:text-white"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl liquid-pill border border-white/80 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-white/80 dark:hover:bg-white/10 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 hover:from-sky-500 hover:to-indigo-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-sky-400/20 active:scale-95 transition-all disabled:opacity-50 border border-white/30"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
