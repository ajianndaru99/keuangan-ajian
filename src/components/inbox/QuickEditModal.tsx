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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05140f]/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--text-main)] text-base">
            Koreksi Transaksi
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#007a33] hover:text-[#004d00] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rawNotification && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--bg-main)]/60 border border-[var(--border-color)] text-xs text-[#007a33]">
            <p className="font-bold text-[#007a33] text-[10px] uppercase mb-1">
              Kutipan Notifikasi:
            </p>
            <p className="font-mono text-[11px] line-clamp-3 leading-relaxed text-[var(--text-main)]">{rawNotification}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Arah Transaksi */}
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Jenis Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'out'
                    ? 'bg-[#fde8ea] text-[#DC3545] border border-[#DC3545]/40 shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[#DC3545]" />
                <span>Pengeluaran</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'in'
                    ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/40 shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-[#198754]" />
                <span>Pemasukan</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-base font-bold text-[var(--text-main)] angka-keuangan focus:outline-none focus:ring-1 focus:ring-[#007a33]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Merchant / Keterangan
            </label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Contoh: Kopi Kenangan / Token Listrik"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-1 focus:ring-[#007a33] text-[var(--text-main)] font-semibold"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[#007a33] text-xs font-bold hover:bg-[var(--bg-main)]/80 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
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
