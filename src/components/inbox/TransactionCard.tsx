'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionCard.tsx
// Kartu transaksi Inbox — Soft Pastel Liquid Glass dengan Kontras Tajam & Jelas
// ==============================================================================

import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
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
        className={`rounded-3xl p-4 transition-all liquid-glass ${
          isFailedParse
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20'
            : 'border-white/90 dark:border-white/10'
        }`}
      >
        {/* Banner Peringatan jika parsing nominal gagal */}
        {isFailedParse && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 mb-3 rounded-2xl liquid-pill bg-amber-100/90 dark:bg-amber-900/30 text-amber-950 dark:text-amber-200 text-xs font-bold border border-amber-300 dark:border-amber-800/60">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Nominal belum terdeteksi otomatis</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs active:scale-95 transition-all shadow-sm shadow-amber-500/25 border border-white/30"
            >
              <Edit3 className="w-3 h-3" />
              <span>Koreksi</span>
            </button>
          </div>
        )}

        {/* Baris 1: Sumber Akun, Pemilik HP & Waktu */}
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <div className="flex items-center gap-1.5">
            {/* Badge Akun */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full liquid-pill text-slate-900 dark:text-slate-100 font-bold text-[11px] border border-slate-200/80 dark:border-white/10">
              {accountType === 'bank' ? (
                <Building2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              ) : (
                <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              )}
              {accountName}
            </span>

            {/* Badge Pemilik HP */}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                transaction.source_device === 'suami'
                  ? 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-300 border-sky-300/80 dark:border-sky-800/50'
                  : 'bg-pink-100 text-pink-900 dark:bg-pink-950/50 dark:text-pink-300 border-pink-300/80 dark:border-pink-800/50'
              }`}
            >
              {transaction.source_device === 'suami' ? '👨 Suami' : '👩 Istri'}
            </span>
          </div>

          {/* Waktu Notifikasi */}
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {formatRelativeWIB(transaction.transaction_date)}
          </span>
        </div>

        {/* Baris 2: Merchant & Nominal */}
        <div className="flex items-baseline justify-between gap-3 my-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black text-slate-900 dark:text-white truncate">
              {transaction.merchant || 'Transaksi Digital'}
            </h3>
          </div>

          <div className="text-right shrink-0">
            {transaction.amount === 0 ? (
              <span className="text-xs font-black text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 rounded-xl border border-amber-300 dark:border-amber-800/60">
                Rp 0 (Cek)
              </span>
            ) : transaction.direction === 'in' ? (
              <span className="inline-flex items-center gap-0.5 text-base font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                +{formatRupiah(transaction.amount)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-base font-black text-rose-600 dark:text-rose-400 tracking-tight">
                <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                {formatRupiah(transaction.amount)}
              </span>
            )}
          </div>
        </div>

        {/* Baris 3: Teks Pesan Asli (Collapsible) */}
        <div className="mb-3">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            {showRaw ? (
              <>
                <span>Sembunyikan pesan asli</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Lihat pesan asli</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          {showRaw && (
            <div className="mt-2 p-2.5 rounded-2xl liquid-pill bg-white/70 dark:bg-black/30 text-[11px] font-mono text-slate-800 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 break-words leading-relaxed select-text">
              {transaction.raw_notification}
            </div>
          )}
        </div>

        {/* Baris 4: Deretan Tombol Kategori 1-Tap & Tombol Abaikan */}
        <div className="pt-3 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CategoryChipList
              categories={categories}
              transactionDirection={transaction.direction}
              onSelect={handleCategorize}
              disabled={isSubmitting}
            />
          </div>

          {/* Tombol Abaikan */}
          <button
            onClick={handleIgnore}
            disabled={isSubmitting}
            title="Abaikan transaksi ini"
            className="shrink-0 px-3 py-1.5 rounded-2xl text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 liquid-pill border border-slate-200/80 dark:border-white/10 transition-all disabled:opacity-50"
          >
            Abaikan
          </button>
        </div>
      </div>

      {/* Modal Koreksi Cepat */}
      <QuickEditModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        initialAmount={transaction.amount}
        initialMerchant={transaction.merchant}
        initialDirection={transaction.direction}
        rawNotification={transaction.raw_notification}
        onSave={handleSaveEdit}
      />
    </>
  );
}
