'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionDetailModal.tsx
// Pop-up Modal Detail Transaksi: Tampilan Profesional, Bersih, & Ringkas
// Mendukung tinjauan lengkap, pemilihan kategori 1-tap, koreksi, dan verifikasi
// ==============================================================================

import { useState } from 'react';
import {
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CreditCard,
  User,
  FileText,
  Check,
  Edit3,
  Trash2,
  Copy,
  CheckCheck,
  Tag,
} from 'lucide-react';
import { formatRupiah, formatFullWIB } from '@/lib/utils';
import { TransactionItem } from './TransactionCard';
import { Category } from './CategoryChipList';

interface TransactionDetailModalProps {
  transaction: TransactionItem | null;
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onCategorize: (transactionId: string, categoryId: string) => Promise<void>;
  onIgnore: (transactionId: string) => Promise<void>;
  onEdit: (transaction: TransactionItem) => void;
}

export default function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
  categories,
  onCategorize,
  onIgnore,
  onEdit,
}: TransactionDetailModalProps) {
  const [selectedCatId, setSelectedCatId] = useState<string | null>(
    transaction?.category_id || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !transaction) return null;

  const isIncome = transaction.direction === 'in';
  const accountName = transaction.accounts?.name || 'Rekening';
  const ownerLabel = transaction.source_device === 'suami' ? 'Suami' : 'Istri';

  // Ekstrak nomor referensi jika ada
  const refMatch = transaction.raw_notification?.match(/\(Ref:\s*([^)]+)\)/i);
  const referenceNumber = refMatch ? refMatch[1] : null;

  const handleCopyRaw = () => {
    if (transaction.raw_notification) {
      navigator.clipboard.writeText(transaction.raw_notification);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmCategory = async (catId: string) => {
    setIsSubmitting(true);
    await onCategorize(transaction.id, catId);
    setIsSubmitting(false);
    onClose();
  };

  const handleIgnore = async () => {
    setIsSubmitting(true);
    await onIgnore(transaction.id);
    setIsSubmitting(false);
    onClose();
  };

  const targetCategories = categories.filter((c) =>
    isIncome ? c.type === 'income' : c.type === 'expense'
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[var(--surface-3)] rounded-t-3xl sm:rounded-3xl border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--surface-3)]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--text-muted)]">
              Detail Transaksi
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              transaction.status === 'pending'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                : 'bg-[var(--color-income)]/15 text-[var(--color-income)]'
            }`}>
              {transaction.status === 'pending' ? 'Menunggu Verifikasi' : 'Terkonfirmasi'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-4)] transition-colors"
            title="Tutup pop-up"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Isi Modal (Scrollable jika layar HP) */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Hero Section: Nominal & Merchant */}
          <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between mb-2">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isIncome
                    ? 'bg-[var(--color-income)]/10 text-[var(--color-income)] border border-[var(--color-income)]/30'
                    : 'bg-[var(--color-expense)]/10 text-[var(--color-expense)] border border-[var(--color-expense)]/30'
                }`}
              >
                {isIncome ? (
                  <>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--color-income)]" />
                    Pemasukan
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-expense)]" />
                    Pengeluaran
                  </>
                )}
              </span>

              {referenceNumber && (
                <span className="font-mono text-[11px] text-[var(--text-muted)] bg-[var(--surface-1)] px-2 py-0.5 rounded-md border border-[var(--border-color)]">
                  Ref: {referenceNumber}
                </span>
              )}
            </div>

            <div className="mt-1">
              <h2 className={`text-2xl font-extrabold tracking-tight angka-keuangan ${
                isIncome ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
              }`}>
                {isIncome ? '+' : '-'}{formatRupiah(transaction.amount)}
              </h2>
              <p className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                {transaction.merchant || 'Transaksi Digital'}
              </p>
            </div>
          </div>

          {/* Grid Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <CreditCard className="w-3.5 h-3.5" />
                <span className="font-medium">Akun / Rekening</span>
              </div>
              <p className="font-bold text-[var(--text-main)]">
                {accountName}
              </p>
            </div>

            <div className="p-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <User className="w-3.5 h-3.5" />
                <span className="font-medium">Pemilik</span>
              </div>
              <p className="font-bold text-[var(--text-main)]">
                {ownerLabel}
              </p>
            </div>

            <div className="col-span-2 p-3 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-medium">Waktu Transaksi</span>
              </div>
              <p className="font-bold text-[var(--text-main)] angka-keuangan">
                {formatFullWIB(transaction.transaction_date)}
              </p>
            </div>
          </div>

          {/* Notifikasi Asli (Audit Trail) */}
          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-[var(--text-muted)] flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Teks Notifikasi Asli:
              </span>
              <button
                type="button"
                onClick={handleCopyRaw}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-color)] hover:opacity-80 transition-colors"
                title="Salin teks notifikasi"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5 text-[var(--color-income)]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
            <p className="font-mono text-[11px] text-[var(--text-main)] bg-[var(--surface-1)] p-2.5 rounded-xl border border-[var(--border-color)] leading-relaxed whitespace-pre-wrap break-words">
              {transaction.raw_notification || '-'}
            </p>
          </div>

          {/* Pilih Kategori 1-Tap */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Tentukan Kategori:
              </label>
              {selectedCatId && (
                <span className="text-[11px] text-[var(--color-income)] font-bold">
                  {categories.find((c) => c.id === selectedCatId)?.name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {targetCategories.map((cat) => {
                const isSelected = selectedCatId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedCatId(cat.id);
                      handleConfirmCategory(cat.id);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border flex items-center justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] border-[var(--accent-color)] shadow-xs font-bold'
                        : 'bg-[var(--surface-2)] text-[var(--text-main)] border border-[var(--border-color)] hover:bg-[var(--surface-4)]'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white dark:text-[#121218]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Aksi */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--surface-3)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(transaction);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--text-main)] text-xs font-bold hover:bg-[var(--surface-4)] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Koreksi</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleIgnore}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-expense)]/30 bg-[var(--color-expense)]/10 text-[var(--color-expense)] hover:bg-[var(--color-expense)]/20 text-xs font-bold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Abaikan</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[var(--surface-4)] hover:bg-[var(--surface-2)] text-[var(--text-main)] text-xs font-bold transition-colors shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
