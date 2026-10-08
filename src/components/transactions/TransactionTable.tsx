'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TransactionTable.tsx
// Tabel Transaksi Bersih & Elegan Mengadopsi Desain Monexa (Foto 2)
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

  if (transactions.length === 0) {
    return (
      <div className="rounded-3xl p-12 text-center bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-main)] text-[#007a33] flex items-center justify-center mx-auto mb-3 border border-[var(--border-color)]">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-[var(--text-main)]">
          Tidak Ada Transaksi Ditemukan
        </h3>
        <p className="text-xs text-[#007a33] mt-1 max-w-sm mx-auto">
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
    <div className="bg-[var(--bg-card)] rounded-3xl border border-[#E2E8F0] shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          {/* Header Tabel Monexa dengan Gridline Tipis #E2E8F0 */}
          <thead className="bg-[var(--bg-main)]/70 text-[#007a33] border-b border-[#E2E8F0] font-semibold select-none">
            <tr>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Date</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Name</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Total Amount</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Status</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Noted</th>
              <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>

          {/* Baris Data Transaksi Monexa dengan Garis Kisi Tipis #E2E8F0 */}
          <tbody className="divide-y divide-[#E2E8F0]">
            {transactions.map((tx) => {
              const isIncome = tx.direction === 'in';
              const isPending = tx.status === 'pending';

              return (
                <tr
                  key={tx.id}
                  className="hover:bg-[var(--bg-main)]/50 transition-colors group cursor-pointer"
                  onClick={() => onSelectTransaction(tx)}
                >
                  {/* 1. Transaction Date */}
                  <td className="py-3.5 px-4 font-medium text-[#007a33] whitespace-nowrap angka-keuangan">
                    {formatTableDate(tx.transaction_date)}
                  </td>

                  {/* 2. Transaction Name */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                          isIncome
                            ? 'bg-[#e8f5e9] text-[#198754] border-[#198754]/30'
                            : 'bg-[#fde8ea] text-[#DC3545] border-[#DC3545]/30'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="font-bold text-[#004d00] block truncate max-w-xs">
                          {tx.merchant || 'Transaksi Digital'}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <span>{tx.account_name || 'Rekening'}</span>
                          <span>•</span>
                          <span className="capitalize">{tx.source_device || 'Suami'}</span>
                          {tx.category_name && (
                            <>
                              <span>•</span>
                              <span className="text-[#007a33] font-medium">
                                {tx.category_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 3. Total Amount (Muted Red #DC3545 vs Hijau Teduh #198754) */}
                  <td className="py-3.5 px-4 font-bold tracking-tight whitespace-nowrap">
                    <span
                      className={`angka-keuangan font-bold ${
                        isIncome
                          ? 'text-[#198754]'
                          : 'text-[#DC3545]'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatMaskedRupiah(tx.amount, isHideBalance)}
                    </span>
                  </td>

                  {/* 4. Status Badge Kapsul */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Pending Review
                      </span>
                    ) : isIncome ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#e8f5e9] text-[#198754] border border-[#198754]/30">
                        Income
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#fde8ea] text-[#DC3545] border border-[#DC3545]/30">
                        Expense
                      </span>
                    )}
                  </td>

                  {/* 5. Noted / Keterangan Ringkas */}
                  <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 max-w-xs truncate whitespace-nowrap">
                    {tx.raw_notification ? (
                      <span title={tx.raw_notification} className="truncate block max-w-xs">
                        {tx.raw_notification.slice(0, 45)}
                        {tx.raw_notification.length > 45 ? '...' : ''}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">-</span>
                    )}
                  </td>

                  {/* 6. Action Menu Vertikal (⋮) */}
                  <td
                    className="py-3.5 px-4 text-right whitespace-nowrap relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        setActiveMenuId(activeMenuId === tx.id ? null : tx.id)
                      }
                      className="p-1.5 rounded-lg text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)] transition-colors"
                      title="Menu Aksi"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu Popover */}
                    {activeMenuId === tx.id && (
                      <div className="absolute right-4 top-10 w-44 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl z-30 p-1 animate-in fade-in zoom-in-95 duration-100 text-left">
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onSelectTransaction(tx);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)]/70 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#198754]" />
                          <span>Lihat Detail</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onEditTransaction(tx);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)]/70 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#007a33]" />
                          <span>Koreksi Data</span>
                        </button>

                        {onDeleteTransaction && (
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              onDeleteTransaction(tx.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
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
  );
}
