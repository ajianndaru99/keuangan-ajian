'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/AdjustBalanceModal.tsx
// Modal Rekonsiliasi / Koreksi Saldo Manual vs m-Banking
// ==============================================================================

import { useState } from 'react';
import { X, Check, Calculator } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05140f]/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
              <Calculator className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-bold text-[var(--text-main)] text-base leading-none">
                Koreksi Saldo {account.name}
              </h3>
              <span className="text-[11px] font-semibold text-[#007a33]">
                Milik: {account.owner === 'suami' ? '👨 Suami' : '👩 Istri'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info Saldo Saat Ini di Sistem */}
        <div className="mb-4 p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#007a33] block mb-0.5">
            Saldo Tercatat di Sistem
          </span>
          <p className="text-base font-extrabold text-[var(--text-main)] angka-keuangan">
            {formatRupiah(currentAmount)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
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
              className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] text-base font-bold text-[var(--text-main)] angka-keuangan focus:outline-none focus:ring-1 focus:ring-[#007a33]"
            />
          </div>

          {/* Kalkulasi Selisih Penyesuaian */}
          {targetStr && (
            <div className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)] text-xs">
              <div className="flex items-center justify-between font-bold">
                <span className="text-[#007a33]">Selisih Penyesuaian:</span>
                <span className={`angka-keuangan font-bold ${diff >= 0 ? 'text-[#198754]' : 'text-[#DC3545]'}`}>
                  {diff >= 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`}
                </span>
              </div>
              <p className="text-[10px] text-[#007a33] mt-1 leading-relaxed">
                {diff >= 0
                  ? 'Akan dicatat otomatis sebagai penyesuaian saldo masuk (surplus).'
                  : 'Akan dicatat otomatis sebagai penyesuaian saldo keluar (selisih biaya/bunga).'}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Keterangan / Catatan
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Rekonsiliasi akhir bulan"
              className="w-full px-4 py-2.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-1 focus:ring-[#007a33] text-[var(--text-main)] font-semibold"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[#007a33] font-bold text-xs hover:bg-[var(--bg-main)]/80 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !targetStr}
              className="flex-1 py-3 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-50 text-[var(--bg-main)] font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
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
