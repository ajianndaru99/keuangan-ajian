'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/PromoSpamConfirmModal.tsx
// Dialog Konfirmasi Penandaan Notifikasi Promo / Spam / Gamifikasi
// - Mengabaikan transaksi dari pembukuan riil
// - Closed-loop rule learning: Menyimpan kata kunci promo ke database adaptif
// ==============================================================================

import { useState } from 'react';
import { X, ShieldAlert, FileText, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { MonexaTransactionRow } from '@/components/transactions/TransactionTable';
import { TransactionItem } from './TransactionCard';

interface PromoSpamConfirmModalProps {
  transaction: MonexaTransactionRow | TransactionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tx: MonexaTransactionRow | TransactionItem) => Promise<void>;
}

export default function PromoSpamConfirmModal({
  transaction,
  isOpen,
  onClose,
  onConfirm,
}: PromoSpamConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !transaction) return null;

  const rawNotification =
    'raw_notification' in transaction ? transaction.raw_notification : null;
  const merchantName = transaction.merchant || 'Transaksi Digital';
  const amountNumber = Number(transaction.amount || 0);

  const handleConfirmAction = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(transaction);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[var(--surface-3)] rounded-t-3xl sm:rounded-3xl border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--surface-3)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">
                Tandai Promo atau Spam
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Keluarkan transaksi palsu & latih filter sistem
              </p>
            </div>
          </div>

          {!isSubmitting && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-4)] transition-colors"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Konten Transaksi & Penjelasan */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Kartu Ringkasan Data Transaksi */}
          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--text-main)] truncate max-w-[200px]">
                {merchantName}
              </span>
              <span className="font-extrabold angka-keuangan text-expense">
                {amountNumber > 0 ? formatRupiah(amountNumber) : 'Rp 0'}
              </span>
            </div>

            {rawNotification && (
              <div className="p-2.5 rounded-xl bg-[var(--surface-3)] border border-[var(--border-color)]/70 text-[11px] font-mono text-[var(--text-muted)] leading-relaxed line-clamp-3 select-text">
                <div className="flex items-center gap-1 font-sans font-bold text-[10px] text-[var(--accent-color)] mb-1">
                  <FileText className="w-3 h-3" />
                  <span>Notifikasi Asli:</span>
                </div>
                {rawNotification}
              </div>
            )}
          </div>

          {/* Penjelasan Dampak Aksi */}
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Status Transaksi Diabaikan (Ignored)</strong>
                <p className="text-[var(--text-muted)] mt-0.5">
                  Transaksi ini tidak akan dihitung sebagai pengeluaran maupun pemasukan, serta dikeluarkan dari rekap bulanan keluarga.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 text-purple-600 dark:text-purple-400">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>Pembelajaran Otomatis (Closed-Loop Learning)</strong>
                <p className="text-[var(--text-muted)] mt-0.5">
                  Sistem mengekstrak kata kunci promo/iklan ini ke dalam daftar pencekalan agar notifikasi serupa ke depannya langsung ditolak di pintu masuk webhook.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Tombol Aksi */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--surface-3)]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleConfirmAction}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-xs"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Ya, Tandai Promo & Pelajari</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
