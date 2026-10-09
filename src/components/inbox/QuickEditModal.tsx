'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/QuickEditModal.tsx
// Formulir Koreksi Transaksi: Desain Profesional & Bersih
// ==============================================================================

import { useState } from 'react';
import { X, Check, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[var(--surface-3)] border border-[var(--border-color)] p-6 shadow-2xl animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--text-main)] text-base">
            Koreksi Transaksi
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-4)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rawNotification && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-muted)]">
            <p className="font-bold text-[var(--text-muted)] text-[10px] uppercase mb-1">
              Kutipan Notifikasi:
            </p>
            <p className="font-mono text-[11px] line-clamp-3 leading-relaxed text-[var(--text-main)]">{rawNotification}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Arah Transaksi */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Jenis Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'out'
                    ? 'bg-[var(--color-expense)]/15 text-[var(--color-expense)] border border-[var(--color-expense)]/40 shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-expense)]" />
                <span>Pengeluaran</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'in'
                    ? 'bg-[var(--color-income)]/15 text-[var(--color-income)] border border-[var(--color-income)]/40 shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--color-income)]" />
                <span>Pemasukan</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-base font-bold text-[var(--text-main)] angka-keuangan focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Merchant / Keterangan
            </label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Contoh: Kopi Kenangan / Token Listrik"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-[var(--text-main)] font-semibold"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-4)] text-[var(--text-main)] text-xs font-bold hover:bg-[var(--surface-2)] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white dark:text-[#121218] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
