'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionCard.tsx
// Kartu transaksi pada halaman Inbox dengan kategorisasi 1-tap & edit cepat
// ==============================================================================

import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Edit2,
  Building2,
  Smartphone,
  ArrowUpRight,
  ArrowDownLeft,
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
}

export default function TransactionCard({
  transaction,
  categories,
  onCategorize,
  onIgnore,
  onUpdate,
}: TransactionCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountName = transaction.accounts?.name || 'Rekening';
  const accountType = transaction.accounts?.type || 'bank';
  const isFailedParse = transaction.amount === 0 || transaction.needs_review;

  const handleCategorize = async (categoryId: string) => {
    setIsSubmitting(true);
    await onCategorize(transaction.id, categoryId);
    setIsSubmitting(false);
  };

  const handleIgnore = async () => {
    setIsSubmitting(true);
    await onIgnore(transaction.id);
    setIsSubmitting(false);
  };

  const handleSaveEdit = async (amount: number, merchant: string, direction: 'out' | 'in') => {
    await onUpdate(transaction.id, amount, merchant, direction);
  };

  return (
    <>
      <div
        className={`rounded-2xl p-4 transition-all border ${
          isFailedParse
            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60 shadow-sm'
            : 'bg-white dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/60 shadow-sm hover:shadow-md'
        }`}
      >
        {/* Banner Peringatan jika parsing gagal */}
        {isFailedParse && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 mb-3 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Nominal belum terbaca dari notifikasi</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-600 text-white font-semibold text-[11px] hover:bg-amber-700 active:scale-95 transition-all"
            >
              <Edit2 className="w-3 h-3" />
              Koreksi
            </button>
          </div>
        )}

        {/* Baris Atas: Akun, Pemilik HP, dan Waktu */}
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <div className="flex items-center gap-1.5">
            {/* Badge Akun */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/80 text-slate-800 dark:text-slate-200 font-semibold text-[11px]">
              {accountType === 'bank' ? (
                <Building2 className="w-3 h-3 text-indigo-500" />
              ) : (
                <Smartphone className="w-3 h-3 text-emerald-500" />
              )}
              {accountName}
            </span>

            {/* Badge Pemilik HP */}
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                transaction.source_device === 'suami'
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60'
                  : 'bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200/60 dark:border-pink-900/60'
              }`}
            >
              {transaction.source_device === 'suami' ? '👨 Suami' : '👩 Istri'}
            </span>
          </div>

          {/* Waktu Notifikasi */}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatRelativeWIB(transaction.transaction_date)}
          </span>
        </div>

        {/* Baris Tengah: Merchant & Nominal */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-1">
              {transaction.merchant || 'Transaksi Digital'}
            </h2>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-indigo-500 transition-colors"
            >
              <span>{showRaw ? 'Sembunyikan pesan notifikasi' : 'Lihat pesan asli'}</span>
              {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="text-right shrink-0">
            <div
              className={`inline-flex items-center gap-0.5 text-base font-extrabold tracking-tight ${
                transaction.direction === 'in'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {transaction.direction === 'in' ? (
                <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
              ) : (
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>{formatRupiah(transaction.amount)}</span>
            </div>
          </div>
        </div>

        {/* Accordion Notifikasi Asli */}
        {showRaw && (
          <div className="mb-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
            {transaction.raw_notification}
          </div>
        )}

        {/* Baris Bawah: Deretan Tombol Kategori (1-Tap Categorization) & Tombol Abaikan */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-2">
          <div className="flex-1 overflow-hidden">
            <CategoryChipList
              categories={categories}
              transactionDirection={transaction.direction}
              onSelect={handleCategorize}
              disabled={isSubmitting}
            />
          </div>

          <button
            onClick={handleIgnore}
            disabled={isSubmitting}
            title="Abaikan transaksi ini"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all shrink-0"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal Koreksi Cepat jika dibutuhkan */}
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
