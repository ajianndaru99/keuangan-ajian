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
      <div className="rounded-3xl p-12 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 shadow-2xs">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          Tidak Ada Transaksi Ditemukan
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
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
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          {/* Header Tabel Monexa */}
          <thead className="bg-slate-50/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 font-semibold select-none">
            <tr>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Date</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Transaction Name</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Total Amount</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Status</th>
              <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Noted</th>
              <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Action</th>
            </tr>
          </thead>

          {/* Baris Data Transaksi Monexa */}
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {transactions.map((tx) => {
              const isIncome = tx.direction === 'in';
              const isPending = tx.status === 'pending';

              return (
                <tr
                  key={tx.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                  onClick={() => onSelectTransaction(tx)}
                >
                  {/* 1. Transaction Date */}
                  <td className="py-3.5 px-4 font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatTableDate(tx.transaction_date)}
                  </td>

                  {/* 2. Transaction Name (Ikon Bundar Pastel + Nama Merchant + Sumber Akun) */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                          isIncome
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/80'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 dark:text-white block truncate max-w-xs">
                          {tx.merchant || 'Transaksi Digital'}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                          <span>{tx.account_name || 'Rekening'}</span>
                          <span>•</span>
                          <span className="capitalize">{tx.source_device || 'Suami'}</span>
                          {tx.category_name && (
                            <>
                              <span>•</span>
                              <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                {tx.category_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 3. Total Amount */}
                  <td className="py-3.5 px-4 font-bold tracking-tight whitespace-nowrap">
                    <span
                      className={
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }
                    >
                      {isIncome ? '+' : '-'}
                      {formatMaskedRupiah(tx.amount, isHideBalance)}
                    </span>
                  </td>

                  {/* 4. Status Badge Kapsul Pastel */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {isPending ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Pending Review
                      </span>
                    ) : isIncome ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80">
                        Income
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80">
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
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Menu Aksi"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu Popover */}
                    {activeMenuId === tx.id && (
                      <div className="absolute right-4 top-10 w-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-30 p-1 animate-in fade-in zoom-in-95 duration-100 text-left">
                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onSelectTransaction(tx);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Lihat Detail</span>
                        </button>

                        <button
                          onClick={() => {
                            setActiveMenuId(null);
                            onEditTransaction(tx);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
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
