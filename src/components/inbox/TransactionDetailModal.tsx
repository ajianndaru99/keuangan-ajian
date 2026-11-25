'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionDetailModal.tsx
// Modal Inspeksi Detail Transaksi Read-Only (Teks Notifikasi Asli & Metadata)
// ==============================================================================

import { useState } from 'react';
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CreditCard,
  FileText,
  Copy,
  CheckCheck,
  Tag,
  Bot,
} from 'lucide-react';
import { formatRupiah, formatFullWIB } from '@/lib/utils';
import type { TransactionItem } from '@/types/transaction';

interface TransactionDetailModalProps {
  transaction: TransactionItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
}: TransactionDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !transaction) return null;

  const isIncome = transaction.direction === 'in';
  const accountName = transaction.accounts?.name || 'Rekening';
  const categoryName = transaction.categories?.name || 'Lainnya';

  const handleCopyRaw = () => {
    if (transaction.raw_notification) {
      navigator.clipboard.writeText(transaction.raw_notification);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-[var(--surface-1)] border border-[var(--border-color)] p-5 sm:p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isIncome
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}
            >
              {isIncome ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[var(--text-main)] truncate">
                {transaction.merchant || 'Transaksi'}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Status: <strong className="uppercase">{transaction.status}</strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)]">
          <span className="text-[11px] font-semibold text-[var(--text-muted)] block">
            {isIncome ? 'Dana Masuk' : 'Pengeluaran'}
          </span>
          <span
            className={`text-2xl font-extrabold angka-keuangan ${
              isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-main)]'
            }`}
          >
            {isIncome ? '+' : '-'} {formatRupiah(transaction.amount)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-[var(--surface-2)]/70 border border-[var(--border-color)] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <div>
              <span className="text-[10px] text-[var(--text-muted)] block">Waktu Transaksi</span>
              <span className="font-semibold text-[var(--text-main)]">
                {formatFullWIB(transaction.transaction_date)}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--surface-2)]/70 border border-[var(--border-color)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <div>
              <span className="text-[10px] text-[var(--text-muted)] block">Rekening</span>
              <span className="font-semibold text-[var(--text-main)]">{accountName}</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--surface-2)]/70 border border-[var(--border-color)] flex items-center gap-2 sm:col-span-2">
            <Tag className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <div>
              <span className="text-[10px] text-[var(--text-muted)] block">Kategori Anggaran</span>
              <span className="font-semibold text-[var(--text-main)]">{categoryName}</span>
            </div>
          </div>
        </div>

        {transaction.raw_notification && (
          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)]/60 border border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--text-muted)] inline-flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Isi Notifikasi Lengkap
              </span>
              <button
                type="button"
                onClick={handleCopyRaw}
                className="text-[11px] font-semibold text-[var(--accent-color)] inline-flex items-center gap-1"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>
            </div>
            <p className="text-xs text-[var(--text-main)] whitespace-pre-wrap break-words leading-relaxed font-mono">
              {transaction.raw_notification}
            </p>
          </div>
        )}

        <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-700 dark:text-sky-300 flex items-center gap-2">
          <Bot className="w-4 h-4 shrink-0" />
          <span>Perubahan kategori, nominal, status, atau blokir spam dilakukan langsung melalui Telegram Bot.</span>
        </div>
      </div>
    </div>
  );
}
