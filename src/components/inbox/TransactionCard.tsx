'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/TransactionCard.tsx
// Kartu transaksi Inbox dengan Tampilan Responsif:
// - Monitor / Layar Laptop: Keterangan lengkap menyamping (Horizontal Wide Layout)
// - Ponsel / HP: Tampilan ringkas, bersih, dan sederhana (Compact Mobile View)
// ==============================================================================

import { useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Building2,
  Smartphone,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Check,
  FileText,
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
}

export default function TransactionCard({
  transaction,
  categories,
  onCategorize,
  onIgnore,
  onUpdate,
}: TransactionCardProps) {
  const [showRawMobile, setShowRawMobile] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountName = transaction.accounts?.name || 'Rekening';
  const accountType = transaction.accounts?.type || 'bank';
  const isFailedParse = transaction.amount === 0 || transaction.needs_review;

  // Temukan nama kategori jika sudah ada (rekomendasi otomatis backend)
  const matchedCategory = categories.find((c) => c.id === transaction.category_id);

  const handleCategorize = async (categoryId: string) => {
    setIsSubmitting(true);
    await onCategorize(transaction.id, categoryId);
    setIsSubmitting(false);
  };

  const handleQuickApproveMatched = async () => {
    if (transaction.category_id) {
      await handleCategorize(transaction.category_id);
    }
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
    if (norm.includes('jago')) return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
    if (norm.includes('bca')) return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
    if (norm.includes('mandiri')) return 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
    if (norm.includes('bri')) return 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
    if (norm.includes('gopay') || norm.includes('gojek')) return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    if (norm.includes('shopee')) return 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800';
    if (norm.includes('dana')) return 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800';
    if (norm.includes('ovo')) return 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
    return 'liquid-pill text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-white/10';
  };

  const getAvatarIcon = (merchant: string, direction: 'out' | 'in') => {
    if (direction === 'in') return '💰';
    const m = merchant.toLowerCase();
    if (m.includes('netflix') || m.includes('spotify') || m.includes('youtube')) return '🎬';
    if (m.includes('kopi') || m.includes('makan') || m.includes('restoran') || m.includes('hokben') || m.includes('warung') || m.includes('gofood')) return '🍔';
    if (m.includes('indomaret') || m.includes('alfamart') || m.includes('superindo') || m.includes('sayur') || m.includes('buah') || m.includes('pasar') || m.includes('belanja')) return '🛒';
    if (m.includes('pertamina') || m.includes('spbu') || m.includes('bensin') || m.includes('goride') || m.includes('gocar') || m.includes('grab')) return '🚗';
    if (m.includes('pln') || m.includes('listrik') || m.includes('pulsa') || m.includes('paket data') || m.includes('internet')) return '⚡';
    if (m.includes('macbook') || m.includes('laptop') || m.includes('gadget') || m.includes('hape')) return '💻';
    return '💳';
  };

  // Bersihkan teks raw notification untuk tampilan ringkas
  const cleanSummary = transaction.raw_notification
    ?.replace(/^\[Screenshot Vision\]\s*/i, '')
    ?.replace(/\[notif_title\]\s*-\s*\[notif_text\]/i, 'Menunggu review detail bukti') || '-';

  // Ekstrak nomor referensi jika ada
  const refMatch = transaction.raw_notification?.match(/\(Ref:\s*([^)]+)\)/i);
  const referenceNumber = refMatch ? refMatch[1] : null;

  return (
    <>
      <div
        className={`rounded-3xl p-4 md:p-5 transition-all liquid-glass ${
          isFailedParse
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20'
            : 'border-white/90 dark:border-white/10 hover:border-sky-300/60 dark:hover:border-sky-500/30'
        }`}
      >
        {/* Banner Peringatan jika nominal 0 */}
        {isFailedParse && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 mb-3.5 rounded-2xl liquid-pill bg-amber-100/90 dark:bg-amber-900/30 text-amber-950 dark:text-amber-200 text-xs font-bold border border-amber-300 dark:border-amber-800/60">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Nominal belum terdeteksi otomatis dari struk</span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs active:scale-95 transition-all shadow-sm"
            >
              <Edit3 className="w-3 h-3" />
              <span>Koreksi</span>
            </button>
          </div>
        )}

        {/* =========================================================================
            1. TAMPILAN MONITOR / LAYAR LAPTOP (Horizontal Wide Layout Menyamping)
            ========================================================================= */}
        <div className="hidden md:flex md:items-center md:justify-between md:gap-5">
          {/* Kolom 1: Avatar, Merchant, Tanggal & Identitas Akun */}
          <div className="flex items-center gap-3.5 w-3/12 shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-white/90 dark:bg-white/10 flex items-center justify-center text-2xl shrink-0 shadow-xs border border-slate-200/60 dark:border-white/10">
              <span>{getAvatarIcon(transaction.merchant, transaction.direction)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white truncate leading-tight">
                {transaction.merchant || 'Transaksi Digital'}
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-0.5">
                {formatRelativeWIB(transaction.transaction_date)}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBrandBadge(accountName)}`}>
                  {accountType === 'bank' ? <Building2 className="w-2.5 h-2.5" /> : <Smartphone className="w-2.5 h-2.5" />}
                  {accountName}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    transaction.source_device === 'suami'
                      ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                      : 'bg-pink-50 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-800'
                  }`}
                >
                  {transaction.source_device === 'suami' ? '👨 Suami' : '👩 Istri'}
                </span>
              </div>
            </div>
          </div>

          {/* Kolom 2: Keterangan Lengkap Struk Menyamping (OCR Summary & Ref) */}
          <div className="flex-1 min-w-0 px-3 border-x border-slate-200/60 dark:border-white/5">
            <div className="p-2.5 rounded-2xl bg-white/60 dark:bg-black/20 border border-slate-200/70 dark:border-white/5 text-[11px]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-sky-500" />
                  Keterangan Bukti Screenshot:
                </span>
                {referenceNumber && (
                  <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400 font-semibold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                    Ref: {referenceNumber}
                  </span>
                )}
              </div>
              <p className="text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed font-medium">
                {cleanSummary}
              </p>
            </div>

            {/* Rekomendasi Kategori Otomatis */}
            {matchedCategory && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                <Sparkles className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>Kategori Terdeteksi Otomatis:</span>
                <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {matchedCategory.name}
                </span>
              </div>
            )}
          </div>

          {/* Kolom 3: Nominal Transaksi (Tengah Kanan) */}
          <div className="w-40 shrink-0 text-right pr-2">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 block mb-0.5">
              {transaction.direction === 'in' ? 'Total Masuk' : 'Total Keluar'}
            </span>
            {transaction.amount === 0 ? (
              <span className="text-xs font-black text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2.5 py-1 rounded-xl border border-amber-300">
                Perlu Cek
              </span>
            ) : transaction.direction === 'in' ? (
              <span className="inline-flex items-center gap-0.5 text-base font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                +{formatRupiah(transaction.amount)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-base font-black text-rose-600 dark:text-rose-400 tracking-tight">
                <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                -{formatRupiah(transaction.amount)}
              </span>
            )}
          </div>

          {/* Kolom 4: Tindakan & Kategori 1-Tap Menyamping */}
          <div className="w-72 shrink-0 flex flex-col items-end gap-2">
            {/* Tombol Konfirmasi Cepat jika kategori otomatis sudah cocok */}
            {matchedCategory ? (
              <div className="w-full flex items-center gap-2">
                <button
                  onClick={handleQuickApproveMatched}
                  disabled={isSubmitting}
                  className="flex-1 py-1.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 border border-white/20"
                  title={`Konfirmasi ke ${matchedCategory.name}`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Konfirmasi ({matchedCategory.name})</span>
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-xl liquid-pill text-slate-600 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300 transition-colors border border-slate-200/80 dark:border-white/10"
                  title="Koreksi Nominal"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleIgnore}
                  disabled={isSubmitting}
                  className="p-1.5 rounded-xl liquid-pill text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 transition-colors border border-slate-200/80 dark:border-white/10"
                  title="Abaikan"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {/* Pilihan Kategori Alternatif */}
            <div className="w-full">
              <CategoryChipList
                categories={categories}
                transactionDirection={transaction.direction}
                onSelect={handleCategorize}
                selectedCategoryId={transaction.category_id}
                disabled={isSubmitting}
              />
            </div>

            {/* Aksi Tambahan jika belum ada auto-kategori */}
            {!matchedCategory && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[11px] font-bold text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center gap-0.5"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Koreksi</span>
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  onClick={handleIgnore}
                  disabled={isSubmitting}
                  className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  Abaikan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            2. TAMPILAN PONSEL / HP (Compact & Simple Mobile View)
            ========================================================================= */}
        <div className="block md:hidden">
          {/* Baris 1: Merchant & Nominal */}
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-2xl bg-white/90 dark:bg-white/10 flex items-center justify-center text-xl shrink-0 shadow-xs border border-slate-200/60 dark:border-white/10">
                <span>{getAvatarIcon(transaction.merchant, transaction.direction)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900 dark:text-white truncate leading-tight">
                  {transaction.merchant || 'Transaksi Digital'}
                </h3>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  {formatRelativeWIB(transaction.transaction_date)}
                </p>
              </div>
            </div>

            {/* Nominal */}
            <div className="text-right shrink-0">
              {transaction.amount === 0 ? (
                <span className="text-xs font-black text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 rounded-lg border border-amber-300">
                  Cek
                </span>
              ) : transaction.direction === 'in' ? (
                <span className="inline-flex items-center gap-0.5 text-sm font-black text-emerald-600 dark:text-emerald-400">
                  +{formatRupiah(transaction.amount)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-sm font-black text-rose-600 dark:text-rose-400">
                  -{formatRupiah(transaction.amount)}
                </span>
              )}
            </div>
          </div>

          {/* Baris 2: Badges Akun & Pemilik */}
          <div className="flex items-center justify-between gap-2 text-xs mb-2.5 pt-1.5 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getBrandBadge(accountName)}`}>
                {accountName}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  transaction.source_device === 'suami'
                    ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800/50'
                    : 'bg-pink-50 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300 border-pink-200 dark:border-pink-800/50'
                }`}
              >
                {transaction.source_device === 'suami' ? '👨 Suami' : '👩 Istri'}
              </span>
              {matchedCategory && (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200">
                  <Sparkles className="w-2.5 h-2.5" />
                  {matchedCategory.name}
                </span>
              )}
            </div>

            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-bold text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-0.5"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          {/* Toggle Pesan Asli (Hanya di Mobile agar tidak memakan ruang) */}
          <div className="mb-2.5">
            <button
              onClick={() => setShowRawMobile(!showRawMobile)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {showRawMobile ? (
                <>
                  <span>Sembunyikan detail struk</span>
                  <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  <span>Lihat detail struk</span>
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>

            {showRawMobile && (
              <div className="mt-1.5 p-2 rounded-xl liquid-pill bg-white/70 dark:bg-black/30 text-[10px] font-mono text-slate-800 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 break-words leading-relaxed select-text">
                {transaction.raw_notification}
              </div>
            )}
          </div>

          {/* Baris 3: Kategori 1-Tap & Tombol Abaikan */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-white/10 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CategoryChipList
                categories={categories}
                transactionDirection={transaction.direction}
                onSelect={handleCategorize}
                selectedCategoryId={transaction.category_id}
                disabled={isSubmitting}
              />
            </div>
            <button
              onClick={handleIgnore}
              disabled={isSubmitting}
              className="shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold text-slate-500 hover:text-rose-600 liquid-pill border border-slate-200/80 dark:border-white/10"
            >
              Abaikan
            </button>
          </div>
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
