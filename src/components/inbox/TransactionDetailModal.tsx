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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              Detail Transaksi
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
              {transaction.status === 'pending' ? 'Menunggu Verifikasi' : 'Terkonfirmasi'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Tutup pop-up"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Isi Modal (Scrollable jika layar HP) */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Hero Section: Nominal & Merchant */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between mb-2">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  isIncome
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isIncome ? (
                  <>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Pemasukan
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    Pengeluaran
                  </>
                )}
              </span>

              {referenceNumber && (
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                  Ref: {referenceNumber}
                </span>
              )}
            </div>

            <div className="mt-1">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {isIncome ? '+' : '-'}{formatRupiah(transaction.amount)}
              </h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                {transaction.merchant || 'Transaksi Digital'}
              </p>
            </div>
          </div>

          {/* Grid Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-1">
                <CreditCard className="w-3.5 h-3.5" />
                <span className="font-medium">Akun / Rekening</span>
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {accountName}
              </p>
            </div>

            <div className="p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-1">
                <User className="w-3.5 h-3.5" />
                <span className="font-medium">Pemilik</span>
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {ownerLabel}
              </p>
            </div>

            <div className="col-span-2 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-1">
                <Calendar className="w-3.5 h-3.5" />
                <span className="font-medium">Waktu Transaksi</span>
              </div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {formatFullWIB(transaction.transaction_date)}
              </p>
            </div>
          </div>

          {/* Notifikasi Asli (Audit Trail) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Teks Notifikasi Asli:
              </span>
              <button
                type="button"
                onClick={handleCopyRaw}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                title="Salin teks notifikasi"
              >
                {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
            <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 leading-relaxed whitespace-pre-wrap break-words">
              {transaction.raw_notification || '-'}
            </p>
          </div>

          {/* Pilih Kategori 1-Tap */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                Tentukan Kategori:
              </label>
              {selectedCatId && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
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
                    className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition-all border flex items-center justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm'
                        : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Aksi */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(transaction);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Koreksi</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleIgnore}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Abaikan</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
