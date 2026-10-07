'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/FinancialSummaryCard.tsx
// Ringkasan Total Pengeluaran, Pemasukan, Selisih, & Transaksi Pending
// ==============================================================================

import { ArrowDownLeft, TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

interface FinancialSummaryCardProps {
  totalExpense: number;
  totalIncome: number;
  netDifference: number;
  pendingCount: number;
  pendingExpense: number;
  comparison: {
    diff: number;
    absDiff: number;
    percent: number;
    isIncrease: boolean;
    isEqual: boolean;
  } | null;
  periodLabel: string;
}

export default function FinancialSummaryCard({
  totalExpense,
  totalIncome,
  netDifference,
  pendingCount,
  pendingExpense,
  comparison,
  periodLabel,
}: FinancialSummaryCardProps) {
  const isSurplus = netDifference >= 0;

  return (
    <div className="rounded-3xl p-5 mb-3.5 liquid-glass transition-all border border-white/80 dark:border-white/10 shadow-[0_12px_36px_rgba(100,116,139,0.08)] relative overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
            Pengeluaran {periodLabel}
          </span>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight leading-none mt-1">
            {formatRupiah(totalExpense)}
          </p>

          {/* Badge Perbandingan dengan Periode Sebelumnya */}
          {comparison && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  comparison.isEqual
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : comparison.isIncrease
                    ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                }`}
              >
                {comparison.isEqual ? (
                  <>
                    <Minus className="w-3 h-3" />
                    <span>Sama dengan periode lalu</span>
                  </>
                ) : comparison.isIncrease ? (
                  <>
                    <TrendingUp className="w-3 h-3" />
                    <span>+{comparison.percent}% ({formatRupiah(comparison.absDiff)}) vs lalu</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-3 h-3" />
                    <span>-{comparison.percent}% ({formatRupiah(comparison.absDiff)}) vs lalu</span>
                  </>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Status Arus Kas */}
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase">
            Arus Kas
          </span>
          <span
            className={`inline-block px-2.5 py-1 rounded-xl text-xs font-black mt-1 ${
              isSurplus
                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            {isSurplus ? 'Surplus' : 'Defisit'}
          </span>
        </div>
      </div>

      {/* Grid: Pemasukan & Selisih */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10">
        <div className="p-2.5 rounded-2xl liquid-pill bg-white/70 dark:bg-white/5 border border-white/90 dark:border-white/10">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              Total Pemasukan
            </span>
          </div>
          <p className="text-xs font-black text-slate-900 dark:text-white truncate">
            {formatRupiah(totalIncome)}
          </p>
        </div>

        <div className="p-2.5 rounded-2xl liquid-pill bg-white/70 dark:bg-white/5 border border-white/90 dark:border-white/10">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
              Selisih (Net)
            </span>
          </div>
          <p
            className={`text-xs font-black truncate ${
              isSurplus
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isSurplus ? `+${formatRupiah(netDifference)}` : `-${formatRupiah(Math.abs(netDifference))}`}
          </p>
        </div>
      </div>

      {/* Notice Transaksi Pending yang Belum Masuk Hitungan */}
      {pendingCount > 0 && (
        <div className="mt-3 p-2.5 rounded-2xl liquid-pill bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-start gap-2 text-amber-950 dark:text-amber-200 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-tight">
            <span className="font-bold">Info Transaksi Pending: </span>
            Terdapat <strong>{pendingCount} transaksi pending</strong> (estimasi {formatRupiah(pendingExpense)}) yang belum diverifikasi dan belum masuk ke rekap ini.
          </div>
        </div>
      )}
    </div>
  );
}
