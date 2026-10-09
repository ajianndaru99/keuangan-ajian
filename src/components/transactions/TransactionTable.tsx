'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TransactionTable.tsx
// Tabel & Kartu Transaksi Responsif:
// - Layar Monitor/Desktop: Tampilan Tabel Monexa Lengkap 6 Kolom
// - Layar HP Android: Tampilan Kartu Mobile Adaptif Vertikal (Bebas Geser Horizontal)
// - Penayangan Notifikasi Bank Utuh & Tombol Salin Teks
// ==============================================================================

import { useState } from 'react';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import {
  MoreVertical,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Building2,
  Smartphone,
  Tag,
  CheckCircle2,
  Trash2,
  Edit3,
  Copy,
  CheckCheck,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface MonexaTransactionRow {
  id: string;
  transaction_date: string;
  merchant: string | null;
  amount: number;
  direction: 'in' | 'out';
  status: 'reconciled' | 'pending' | 'ignored';
  source_device?: 'suami' | 'istri';
  account_name?: string;
  account_type?: 'bank' | 'ewallet';
  category_name?: string;
  raw_notification?: string | null;
  needs_review?: boolean;
}

interface TransactionTableProps {
  transactions: MonexaTransactionRow[];
  onSelectTransaction: (item: MonexaTransactionRow) => void;
  onEditTransaction: (item: MonexaTransactionRow) => void;
  onDeleteTransaction?: (id: string) => void;
  onQuickCategorize?: (id: string) => void;
}

export default function TransactionTable({
  transactions,
  onSelectTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onQuickCategorize,
}: TransactionTableProps) {
  const { isHideBalance } = usePrivacy();
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyNotif = (e: React.MouseEvent, id: string, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (transactions.length === 0) {
    return (
      <div className="rounded-3xl p-8 sm:p-12 text-center bg-[var(--surface-1)] border border-[var(--border-color)] shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)] flex items-center justify-center mx-auto mb-3 border border-[var(--border-color)]">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-[var(--text-main)]">
          Tidak Ada Transaksi Ditemukan
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
          Tidak ada data transaksi yang cocok dengan filter tanggal atau tipe yang sedang aktif.
        </p>
      </div>
    );
  }

  // Format Tanggal ala Foto 2: e.g. 23-04-2026 (12:30pm)
  const formatTableDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      let hours = d.getHours();
      const mins = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12 || 12;

      return `${day}-${month}-${year} (${hours}:${mins}${ampm})`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-3">
      {/* =========================================================================
          1. TAMPILAN MONITOR / LAPTOP / DESKTOP (Tabel Monexa 6 Kolom)
          ========================================================================= */}
      <div className="hidden md:block bg-[var(--surface-1)] rounded-3xl border border-[var(--border-color)] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-2)]/80 text-[var(--text-muted)] border-b border-[var(--border-color)] font-semibold select-none">
              <tr>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Date</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Name</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Total Amount</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap min-w-[200px]">Noted & Notifikasi</th>
                <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-color)]">
              {transactions.map((tx) => {
                const isIncome = tx.direction === 'in';
                const isPending = tx.status === 'pending';
                const isExpanded = expandedNotifId === tx.id;

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-[var(--surface-2)]/60 transition-colors group cursor-pointer"
                    onClick={() => onSelectTransaction(tx)}
                  >
                    {/* 1. Transaction Date */}
                    <td className="py-3.5 px-4 font-medium text-[var(--text-muted)] whitespace-nowrap angka-keuangan align-top">
                      {formatTableDate(tx.transaction_date)}
                    </td>

                    {/* 2. Transaction Name */}
                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                            isIncome
                              ? 'bg-income/15 text-income border-income/30'
                              : 'bg-expense/15 text-expense border-expense/30'
                          }`}
                        >
                          {isIncome ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="font-bold text-[var(--text-main)] block truncate max-w-xs">
                            {tx.merchant || 'Transaksi Digital'}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                            <span>{tx.account_name || 'Rekening'}</span>
                            <span>•</span>
                            <span className="capitalize">{tx.source_device || 'Suami'}</span>
                            {tx.category_name && (
                              <>
                                <span>•</span>
                                <span className="text-[var(--text-accent-italic)] font-medium">
                                  {tx.category_name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. Total Amount */}
                    <td className="py-3.5 px-4 font-bold tracking-tight whitespace-nowrap align-top">
                      <span
                        className={`angka-keuangan font-bold ${
                          isIncome ? 'text-income' : 'text-expense'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatMaskedRupiah(tx.amount, isHideBalance)}
                      </span>
                    </td>

                    {/* 4. Status Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Pending Review
                        </span>
                      ) : isIncome ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-income/15 text-income border border-income/30">
                          Income
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-expense/15 text-expense border border-expense/30">
                          Expense
                        </span>
                      )}
                    </td>

                    {/* 5. Noted & Notifikasi (Full/Expandable) */}
                    <td className="py-3.5 px-4 align-top max-w-sm">
                      {tx.raw_notification ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--text-muted)] font-mono text-[11px] break-words line-clamp-2">
                              {!isExpanded && tx.raw_notification.length > 60
                                ? `${tx.raw_notification.slice(0, 60)}...`
                                : tx.raw_notification}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyNotif(e, tx.id, tx.raw_notification!)}
                              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors shrink-0"
                              title="Salin notifikasi lengkap"
                            >
                              {copiedId === tx.id ? (
                                <CheckCheck className="w-3.5 h-3.5 text-income" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {tx.raw_notification.length > 60 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedNotifId(isExpanded ? null : tx.id);
                              }}
                              className="text-[10px] font-semibold text-[var(--accent-color)] hover:underline inline-flex items-center gap-0.5"
                            >
                              {isExpanded ? (
                                <>
                                  <span>Tutup teks</span>
                                  <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  <span>Lihat teks utuh</span>
                                  <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-[11px]">-</span>
                      )}
                    </td>

                    {/* 6. Action Menu */}
                    <td
                      className="py-3.5 px-4 text-right whitespace-nowrap relative align-top"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          setActiveMenuId(activeMenuId === tx.id ? null : tx.id)
                        }
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
                        title="Menu Aksi"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {activeMenuId === tx.id && (
                        <div className="absolute right-4 top-10 w-44 rounded-2xl bg-[var(--surface-4)] border border-[var(--border-color)] shadow-xl z-30 p-1 animate-in fade-in zoom-in-95 duration-100 text-left">
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              onSelectTransaction(tx);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-income" />
                            <span>Lihat Detail</span>
                          </button>

                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              onEditTransaction(tx);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                            <span>Koreksi Data</span>
                          </button>

                          {onDeleteTransaction && (
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                onDeleteTransaction(tx.id);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus Transaksi</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          2. TAMPILAN HP ANDROID (Mobile Transaction Cards Khusus Ponsel)
          ========================================================================= */}
      <div className="block md:hidden space-y-3">
        {transactions.map((tx) => {
          const isIncome = tx.direction === 'in';
          const isPending = tx.status === 'pending';

          return (
            <div
              key={`mobile-${tx.id}`}
              onClick={() => onSelectTransaction(tx)}
              className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-2xs space-y-3 active:scale-[0.99] transition-transform cursor-pointer"
            >
              {/* Baris 1: Ikon + Merchant & Waktu + Nominal Besar */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isIncome
                        ? 'bg-income/15 text-income border-income/30'
                        : 'bg-expense/15 text-expense border-expense/30'
                    }`}
                  >
                    {isIncome ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text-main)] truncate">
                      {tx.merchant || 'Transaksi Digital'}
                    </h4>
                    <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                      {formatTableDate(tx.transaction_date)}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`angka-keuangan text-sm font-extrabold tracking-tight ${
                      isIncome ? 'text-income' : 'text-expense'
                    }`}
                  >
                    {isIncome ? '+' : '-'}
                    {formatMaskedRupiah(tx.amount, isHideBalance)}
                  </span>
                </div>
              </div>

              {/* Baris 2: Chips Metadata (Akun, Pemilik, Kategori, Status) */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-color)] font-semibold flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5 text-[var(--accent-color)]" />
                  <span>{tx.account_name || 'Rekening'}</span>
                </span>

                <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-color)] font-semibold capitalize">
                  {tx.source_device || 'Suami'}
                </span>

                {tx.category_name && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--surface-2)] text-[var(--text-accent-italic)] border border-[var(--border-color)] font-bold">
                    {tx.category_name}
                  </span>
                )}

                {isPending ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 font-bold ml-auto">
                    Pending
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ml-auto ${
                      isIncome
                        ? 'bg-income/15 text-income border border-income/30'
                        : 'bg-expense/15 text-expense border border-expense/30'
                    }`}
                  >
                    {isIncome ? 'Pemasukan' : 'Pengeluaran'}
                  </span>
                )}
              </div>

              {/* Baris 3: Teks Notifikasi Lengkap (Full Box Khusus HP) */}
              {tx.raw_notification && (
                <div
                  className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] overflow-hidden text-[11px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-2.5 py-1 bg-[var(--surface-3)] border-b border-[var(--border-color)] text-[10px] text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--accent-color)] flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      <span>Notifikasi Bank Asli</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopyNotif(e, tx.id, tx.raw_notification!)}
                      className="font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] inline-flex items-center gap-1"
                    >
                      {copiedId === tx.id ? (
                        <>
                          <CheckCheck className="w-3 h-3 text-income" />
                          <span className="text-income">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="p-2.5 font-mono text-[11px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap break-words select-text">
                    {tx.raw_notification}
                  </p>
                </div>
              )}

              {/* Baris 4: Aksi Cepat Ramah Jempol */}
              <div
                className="flex items-center gap-2 pt-1 border-t border-[var(--border-color)]/60"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onSelectTransaction(tx)}
                  className="flex-1 py-2 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-bold text-[var(--text-main)] border border-[var(--border-color)] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-income" />
                  <span>Detail Lengkap</span>
                </button>

                <button
                  type="button"
                  onClick={() => onEditTransaction(tx)}
                  className="py-2 px-3 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-bold text-[var(--text-main)] border border-[var(--border-color)] flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>Koreksi</span>
                </button>

                {onDeleteTransaction && (
                  <button
                    type="button"
                    onClick={() => onDeleteTransaction(tx.id)}
                    className="p-2 rounded-xl text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Hapus Transaksi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
