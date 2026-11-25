'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TransactionTable.tsx
// Tabel & Kartu Transaksi Responsif (Strictly Read-Only Monitor)
// ==============================================================================

import { useState } from 'react';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Building2,
  Copy,
  CheckCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Camera,
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
  parse_method?: 'regex' | 'ai_gemini' | 'manual' | 'vision';
}

interface TransactionTableProps {
  transactions: MonexaTransactionRow[];
  onSelectTransaction: (item: MonexaTransactionRow) => void;
}

export default function TransactionTable({
  transactions,
  onSelectTransaction,
}: TransactionTableProps) {
  const { isHideBalance } = usePrivacy();
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const [expandAllNotifs, setExpandAllNotifs] = useState(false);
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
        <h3 className="text-sm font-bold text-[var(--text-main)]">Tidak Ada Transaksi Ditemukan</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
          Tidak ada data transaksi yang cocok dengan filter tanggal atau tipe yang sedang aktif.
        </p>
      </div>
    );
  }

  const formatTableDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${day}-${month}-${year} (${hours}:${mins})`;
    } catch {
      return isoStr;
    }
  };

  const renderParseMethodBadge = (method?: 'regex' | 'ai_gemini' | 'manual' | 'vision') => {
    if (method === 'ai_gemini') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30">
          <Sparkles className="w-2.5 h-2.5" />
          AI
        </span>
      );
    }
    if (method === 'vision') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-600 dark:text-teal-300 border border-teal-500/30">
          <Camera className="w-2.5 h-2.5" />
          Struk
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30">
        {method === 'manual' ? 'Manual' : 'Regex'}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Desktop Table */}
      <div className="hidden md:block bg-[var(--surface-1)] rounded-3xl border border-[var(--border-color)] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-2)]/80 text-[var(--text-muted)] border-b border-[var(--border-color)] font-semibold select-none">
              <tr>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Waktu (WIB)</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Merchant / Keterangan</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Nominal</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 font-semibold whitespace-nowrap min-w-[260px]">
                  <div className="flex items-center justify-between gap-2">
                    <span>Isi Notifikasi Asli</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandAllNotifs(!expandAllNotifs);
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[var(--surface-3)] hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                    >
                      {expandAllNotifs ? 'Tutup Semua' : 'Buka Semua'}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-color)]">
              {transactions.map((tx) => {
                const isIncome = tx.direction === 'in';
                const isPending = tx.status === 'pending';
                const isExpanded = expandAllNotifs || expandedNotifId === tx.id;

                return (
                  <tr
                    key={tx.id}
                    className="hover:bg-[var(--surface-2)]/60 transition-colors cursor-pointer"
                    onClick={() => onSelectTransaction(tx)}
                  >
                    <td className="py-3.5 px-4 font-medium text-[var(--text-muted)] whitespace-nowrap angka-keuangan align-top">
                      {formatTableDate(tx.transaction_date)}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                            isIncome
                              ? 'bg-income/15 text-income border-income/30'
                              : 'bg-expense/15 text-expense border-expense/30'
                          }`}
                        >
                          {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <span className="font-bold text-[var(--text-main)] block truncate max-w-xs">
                            {tx.merchant || 'Transaksi Digital'}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                            <span>{tx.account_name || 'Rekening'}</span>
                            {tx.category_name && (
                              <>
                                <span>•</span>
                                <span className="text-[var(--accent-color)] font-medium">{tx.category_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-bold whitespace-nowrap angka-keuangan align-top">
                      <span className={isIncome ? 'text-income' : 'text-[var(--text-main)]'}>
                        {isIncome ? '+' : '-'} {formatMaskedRupiah(tx.amount, isHideBalance)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap align-top">
                      <div className="inline-flex items-center gap-1.5">
                        {renderParseMethodBadge(tx.parse_method)}
                        {isPending ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                            Pending
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Reconciled
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-md" onClick={(e) => e.stopPropagation()}>
                      {tx.raw_notification ? (
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-[11px] text-[var(--text-muted)] leading-relaxed ${
                                isExpanded ? 'whitespace-pre-wrap break-words font-mono' : 'line-clamp-2'
                              }`}
                            >
                              <FileText className="w-3 h-3 inline mr-1" />
                              {tx.raw_notification}
                            </p>
                            <button
                              type="button"
                              onClick={(e) => handleCopyNotif(e, tx.id, tx.raw_notification || '')}
                              className="p-1 text-[var(--text-muted)] hover:text-[var(--accent-color)] shrink-0"
                              title="Salin teks"
                            >
                              {copiedId === tx.id ? (
                                <CheckCheck className="w-3.5 h-3.5 text-income" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          {!expandAllNotifs && (
                            <button
                              type="button"
                              onClick={() => setExpandedNotifId(isExpanded ? null : tx.id)}
                              className="text-[10px] font-semibold text-[var(--accent-color)] hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>{isExpanded ? 'Sembunyikan' : 'Baca teks utuh'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-[11px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile View (Identik di Website & HP WebView) */}
      <div className="block md:hidden space-y-2.5">
        {transactions.map((tx) => {
          const isIncome = tx.direction === 'in';
          const isPending = tx.status === 'pending';

          return (
            <div
              key={`mobile-${tx.id}`}
              onClick={() => onSelectTransaction(tx)}
              className="p-3.5 rounded-xl border bg-[var(--surface-1)] border-[var(--border-color)] shadow-2xs space-y-2 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isIncome
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-[var(--text-main)] truncate">
                      {tx.merchant || 'Transaksi Digital'}
                    </h4>
                    <span className="text-[10px] text-[var(--text-muted)] block">
                      {formatTableDate(tx.transaction_date)}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`angka-keuangan text-xs sm:text-sm font-bold tracking-tight ${
                      isIncome ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
                    }`}
                  >
                    {isIncome ? '+' : '-'}
                    {formatMaskedRupiah(tx.amount, isHideBalance)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] font-medium flex items-center gap-1 border border-[var(--border-color)]/60">
                  <Building2 className="w-2.5 h-2.5 text-[var(--accent-color)]" />
                  <span>{tx.account_name || 'Rekening'}</span>
                </span>

                {tx.category_name && (
                  <span className="px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--accent-color)] font-medium border border-[var(--border-color)]/60">
                    {tx.category_name}
                  </span>
                )}

                {renderParseMethodBadge(tx.parse_method)}

                {isPending && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                    Pending
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
