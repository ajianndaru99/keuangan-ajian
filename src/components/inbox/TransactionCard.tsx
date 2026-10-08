'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionCard.tsx
// Kartu Transaksi Inbox: Tampilan Finansial Profesional, Rapi, & Bersih
// - Tanpa simbol / emoji berlebihan
// - Keterangan terstruktur dengan kontras tajam
// - Klik kartu untuk membuka Pop-up Detail
// ==============================================================================

import { useState } from 'react';
import {
  AlertCircle,
  Edit3,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  User,
  Clock,
} from 'lucide-react';
import { formatRupiah, formatRelativeWIB } from '@/lib/utils';
import CategoryChipList, { Category } from './CategoryChipList';
import QuickEditModal from './QuickEditModal';

export interface TransactionItem {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  amount: number;
  direction: 'out' | 'in';
  merchant: string;
  raw_notification: string;
  source_device: 'suami' | 'istri';
  transaction_date: string;
  status: 'pending' | 'reconciled' | 'ignored';
  dedupe_hash: string;
  needs_review: boolean;
  created_at?: string;
  accounts?: {
    name: string;
    type: 'bank' | 'ewallet';
  };
}

interface TransactionCardProps {
  transaction: TransactionItem;
  categories: Category[];
  onCategorize: (transactionId: string, categoryId: string) => Promise<void>;
  onIgnore: (transactionId: string) => Promise<void>;
  onUpdate: (
    transactionId: string,
    amount: number,
    merchant: string,
    direction: 'out' | 'in'
  ) => Promise<void>;
  onOpenDetail?: (transaction: TransactionItem) => void;
}

export default function TransactionCard({
  transaction,
  categories,
  onCategorize,
  onIgnore,
  onUpdate,
  onOpenDetail,
}: TransactionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountName = transaction.accounts?.name || 'Rekening';
  const isFailedParse = transaction.amount === 0 || transaction.needs_review;
  const isIncome = transaction.direction === 'in';
  const ownerLabel = transaction.source_device === 'suami' ? 'Suami' : 'Istri';

  // Temukan nama kategori jika sudah ada (rekomendasi otomatis backend)
  const matchedCategory = categories.find((c) => c.id === transaction.category_id);

  const handleCategorize = async (categoryId: string) => {
    setIsSubmitting(true);
    await onCategorize(transaction.id, categoryId);
    setIsSubmitting(false);
  };

  const handleQuickApproveMatched = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (transaction.category_id) {
      await handleCategorize(transaction.category_id);
    }
  };

  const handleIgnore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSubmitting(true);
    await onIgnore(transaction.id);
    setIsSubmitting(false);
  };

  const handleSaveEdit = async (amount: number, merchant: string, direction: 'out' | 'in') => {
    await onUpdate(transaction.id, amount, merchant, direction);
  };

  // Bersihkan teks raw notification untuk pratinjau ringkas
  const cleanSummary = transaction.raw_notification
    ?.replace(/^\[Screenshot Vision\]\s*/i, '')
    ?.replace(/^\[Notifikasi\s*[^\]]+\]\s*/i, '')
    ?.replace(/\[notif_title\]\s*-\s*\[notif_text\]/i, 'Menunggu review detail bukti') || '-';

  // Ekstrak nomor referensi jika ada
  const refMatch = transaction.raw_notification?.match(/\(Ref:\s*([^)]+)\)/i);
  const referenceNumber = refMatch ? refMatch[1] : null;

  return (
    <>
      <div
        onClick={() => onOpenDetail?.(transaction)}
        className={`group rounded-2xl p-4 md:p-5 transition-all bg-white dark:bg-slate-900 border cursor-pointer ${
          isFailedParse
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm'
        }`}
      >
        {/* Banner Peringatan jika nominal 0 atau butuh review */}
        {isFailedParse && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between gap-2 px-3 py-1.5 mb-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs font-medium border border-amber-200 dark:border-amber-800/60"
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Nominal atau rincian transaksi perlu ditinjau kembali</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              <span>Koreksi</span>
            </button>
          </div>
        )}

        {/* =========================================================================
            TAMPILAN DESKTOP & TABLET (Horizontal Clean Layout)
            ========================================================================= */}
        <div className="hidden md:flex md:items-center md:justify-between md:gap-5">
          {/* Kolom 1: Indikator Arah, Merchant, Tanggal, Rekening, Pemilik */}
          <div className="flex items-start gap-3.5 w-64 lg:w-72 shrink-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                isIncome
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isIncome ? (
                <ArrowDownLeft className="w-4 h-4" />
              ) : (
                <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                className="text-sm font-bold text-slate-900 dark:text-white truncate"
                title={transaction.merchant || 'Transaksi Digital'}
              >
                {transaction.merchant || 'Transaksi Digital'}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeWIB(transaction.transaction_date)}
              </p>

              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <CreditCard className="w-2.5 h-2.5" />
                  {accountName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <User className="w-2.5 h-2.5" />
                  {ownerLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Kolom 2: Pratinjau Keterangan / Notifikasi */}
          <div className="flex-1 min-w-0 px-3 border-x border-slate-100 dark:border-slate-800">
            <div className="text-xs">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  Keterangan:
                </span>
                {referenceNumber && (
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    Ref: {referenceNumber}
                  </span>
                )}
              </div>
              <p className="text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                {cleanSummary}
              </p>
            </div>

            {matchedCategory && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <span>Rekomendasi:</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold">
                  {matchedCategory.name}
                </span>
              </div>
            )}
          </div>

          {/* Kolom 3: Nominal Transaksi */}
          <div className="w-36 lg:w-40 shrink-0 text-right pr-2">
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block mb-0.5 uppercase tracking-wide">
              {isIncome ? 'Masuk' : 'Keluar'}
            </span>
            {transaction.amount === 0 ? (
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                Perlu Cek
              </span>
            ) : isIncome ? (
              <span className="inline-flex items-center gap-0.5 text-base font-bold text-emerald-600 dark:text-emerald-400 tracking-tight">
                +{formatRupiah(transaction.amount)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-base font-bold text-slate-900 dark:text-white tracking-tight">
                -{formatRupiah(transaction.amount)}
              </span>
            )}
          </div>

          {/* Kolom 4: Tindakan & Kategori Cepat */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-64 lg:w-72 shrink-0 flex flex-col items-end gap-2 min-w-0"
          >
            {matchedCategory ? (
              <div className="w-full flex items-center gap-1.5">
                <button
                  onClick={handleQuickApproveMatched}
                  disabled={isSubmitting}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 truncate"
                  title={`Konfirmasi ke ${matchedCategory.name}`}
                >
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Konfirmasi ({matchedCategory.name})</span>
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                  title="Koreksi Transaksi"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleIgnore}
                  disabled={isSubmitting}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="Abaikan"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {/* Pilihan Kategori */}
            <div className="w-full min-w-0">
              <CategoryChipList
                categories={categories}
                transactionDirection={transaction.direction}
                onSelect={handleCategorize}
                selectedCategoryId={transaction.category_id}
                disabled={isSubmitting}
              />
            </div>

            {/* Link Aksi Cepat Bawah */}
            {!matchedCategory && (
              <div className="flex items-center gap-2.5 text-xs text-slate-400 dark:text-slate-500">
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Koreksi</span>
                </button>
                <span>•</span>
                <button
                  onClick={handleIgnore}
                  disabled={isSubmitting}
                  className="text-[11px] font-medium text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  Abaikan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            TAMPILAN PONSEL / HP (Compact Mobile View)
            ========================================================================= */}
        <div className="block md:hidden">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                  isIncome
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {isIncome ? (
                  <ArrowDownLeft className="w-4 h-4" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {transaction.merchant || 'Transaksi Digital'}
                </h3>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatRelativeWIB(transaction.transaction_date)}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              {transaction.amount === 0 ? (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200">
                  Cek
                </span>
              ) : isIncome ? (
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  +{formatRupiah(transaction.amount)}
                </span>
              ) : (
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  -{formatRupiah(transaction.amount)}
                </span>
              )}
            </div>
          </div>

          {/* Badges Baris 2 */}
          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {accountName}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {ownerLabel}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white">
              <span>Detail</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Pilihan Kategori di HP */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80"
          >
            <CategoryChipList
              categories={categories}
              transactionDirection={transaction.direction}
              onSelect={handleCategorize}
              selectedCategoryId={transaction.category_id}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>

      {/* Pop-up Modal Koreksi */}
      <QuickEditModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        onSave={handleSaveEdit}
        initialAmount={transaction.amount}
        initialMerchant={transaction.merchant}
        initialDirection={transaction.direction}
        rawNotification={transaction.raw_notification}
      />
    </>
  );
}
