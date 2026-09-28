'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/QuickEditModal.tsx
// Formulir edit cepat untuk nominal dan merchant (terutama transaksi amount 0)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Koreksi Transaksi
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rawNotification && (
          <div className="mb-4 p-3 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-400 dark:text-slate-400 text-[10px] uppercase mb-1">
              Isi Notifikasi Asli:
            </p>
            <p className="italic line-clamp-3 leading-relaxed">"{rawNotification}"</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Arah Transaksi */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setDirection('out')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                direction === 'out'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              💸 Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setDirection('in')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                direction === 'in'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
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
