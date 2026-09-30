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

  const getBrandBadge = (name: string) => {
    const norm = name.toLowerCase();
    if (norm.includes('jago')) {
      return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/80 font-black';
    }
    if (norm.includes('bca')) {
      return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80 font-black';
    }
    if (norm.includes('mandiri')) {
      return 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/80 font-black';
    }
    if (norm.includes('bri')) {
      return 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80 font-black';
    }
    if (norm.includes('gopay') || norm.includes('gojek')) {
      return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/80 font-black';
    }
    if (norm.includes('shopee')) {
      return 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/80 font-black';
    }
    if (norm.includes('dana')) {
      return 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/80 font-black';
    }
    if (norm.includes('ovo')) {
      return 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80 font-black';
    }
    return 'liquid-pill text-slate-900 dark:text-slate-100 border-slate-200/80 dark:border-white/10 font-bold';
  };

  // Avatar icon dinamis seperti Foto 1
  const getAvatarIcon = (merchant: string, direction: 'out' | 'in') => {
    if (direction === 'in') return '💰';
    const m = merchant.toLowerCase();
    if (m.includes('netflix') || m.includes('spotify') || m.includes('youtube')) return '🎬';
    if (m.includes('kopi') || m.includes('makan') || m.includes('restoran') || m.includes('hokben') || m.includes('warung') || m.includes('gofood')) return '🍔';
    if (m.includes('indomaret') || m.includes('alfamart') || m.includes('superindo') || m.includes('belanja')) return '🛒';
    if (m.includes('pertamina') || m.includes('spbu') || m.includes('bensin') || m.includes('goride') || m.includes('gocar') || m.includes('grab')) return '🚗';
    if (m.includes('pln') || m.includes('listrik') || m.includes('pulsa') || m.includes('paket data') || m.includes('internet')) return '⚡';
    if (m.includes('macbook') || m.includes('laptop') || m.includes('gadget') || m.includes('hape')) return '💻';
    return '💳';
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

        {/* Baris 1: Avatar Kategori + Merchant + Nominal (Foto 1 Layar 1) */}
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Avatar Lingkaran Pastel */}
            <div className="w-11 h-11 rounded-2xl bg-white/90 dark:bg-white/10 flex items-center justify-center text-xl shrink-0 shadow-xs border border-slate-200/60 dark:border-white/10">
              <span>{getAvatarIcon(transaction.merchant, transaction.direction)}</span>
            </div>

            {/* Nama Merchant & Tanggal */}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate leading-tight">
                {transaction.merchant || 'Transaksi Digital'}
              </h3>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {formatRelativeWIB(transaction.transaction_date)}
              </p>
            </div>
          </div>

          {/* Nominal di Kanan dengan Warna Kontras (Foto 1) */}
          <div className="text-right shrink-0">
            {transaction.amount === 0 ? (
              <span className="text-xs font-black text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 rounded-xl border border-amber-300 dark:border-amber-800/60">
                Rp 0 (Cek)
              </span>
            ) : transaction.direction === 'in' ? (
              <span className="inline-flex items-center gap-0.5 text-sm font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                +{formatRupiah(transaction.amount)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-sm font-black text-rose-600 dark:text-rose-400 tracking-tight">
                -{formatRupiah(transaction.amount)}
              </span>
            )}
          </div>
        </div>

        {/* Baris 2: Badge Akun / Bank (Logo Pill) & Pemilik */}
        <div className="flex items-center justify-between gap-2 text-xs mb-3 pt-2 border-t border-slate-100/80 dark:border-white/5">
          <div className="flex items-center gap-1.5">
            {/* Badge Akun Bank / E-Wallet Berwarna Khas Brand */}
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] border ${getBrandBadge(accountName)}`}>
              {accountType === 'bank' ? (
                <Building2 className="w-3 h-3" />
              ) : (
                <Smartphone className="w-3 h-3" />
              )}
              {accountName}
            </span>

            {/* Badge Pemilik HP */}
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                transaction.source_device === 'suami'
                  ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800/50'
                  : 'bg-pink-50 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300 border-pink-200 dark:border-pink-800/50'
              }`}
            >
              {transaction.source_device === 'suami' ? '👨 Suami' : '👩 Istri'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center gap-0.5"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>
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
