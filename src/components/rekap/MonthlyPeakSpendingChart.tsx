'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/MonthlyPeakSpendingChart.tsx
// Grafik Penggunaan 1 Bulan & Analisis Titik Tertinggi (Peak Day Insight)
// ==============================================================================

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from 'recharts';
import { formatRupiah } from '@/lib/utils';
import {
  TrendingUp,
  AlertCircle,
  Receipt,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';

export interface DayUsageItem {
  dayNumber: number;
  dateStr: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "01", "02"
  expenseAmount: number;
  incomeAmount: number;
  isPeak: boolean;
}

export interface PeakTransactionItem {
  id: string;
  merchant: string;
  amount: number;
  categoryName?: string;
  direction: 'out' | 'in';
}

export interface PeakDayInsight {
  dateStr: string | null;
  formattedDate: string;
  totalExpense: number;
  dailyAverage: number;
  percentageAboveAverage: number;
  transactions: PeakTransactionItem[];
}

interface MonthlyPeakSpendingChartProps {
  data: DayUsageItem[];
  peakInsight: PeakDayInsight;
  monthName: string;
}

function CustomBarTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item: DayUsageItem = payload[0].payload;
    return (
      <div className="p-3 rounded-2xl bg-white border border-slate-200 shadow-xl text-xs min-w-[160px]">
        <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-1.5">
          <span className="font-extrabold text-slate-900">Tgl {item.dayNumber}</span>
          {item.isPeak && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Titik Tertinggi
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-rose-600 font-bold">
            <span>Pengeluaran:</span>
            <span>{formatRupiah(item.expenseAmount)}</span>
          </div>
          {item.incomeAmount > 0 && (
            <div className="flex items-center justify-between text-emerald-600 font-bold">
              <span>Pemasukan:</span>
              <span>{formatRupiah(item.incomeAmount)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default function MonthlyPeakSpendingChart({
  data,
  peakInsight,
  monthName,
}: MonthlyPeakSpendingChartProps) {
  const hasExpenseData = useMemo(() => {
    return data.some((d) => d.expenseAmount > 0);
  }, [data]);

  return (
    <div className="space-y-4">
      {/* 1. KARTU GRAFIK 1 BULAN (BERSIH & PASTEL) */}
      <div className="rounded-3xl p-6 bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                Grafik Penggunaan Selama 1 Bulan ({monthName})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Visualisasi pengeluaran harian dari tanggal 1 sampai akhir bulan dengan penanda hari tertinggi
            </p>
          </div>

          {peakInsight.dateStr && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Titik Tertinggi: {formatRupiah(peakInsight.totalExpense)}</span>
            </div>
          )}
        </div>

        {/* Visualisasi Grafik Batang Recharts */}
        <div className="h-64 w-full -ml-2 my-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="dayLabel"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => {
                  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}jt`;
                  if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                  return '0';
                }}
              />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="expenseAmount" radius={[6, 6, 0, 0]} maxBarSize={24}>
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.isPeak && entry.expenseAmount > 0
                        ? '#f59e0b' // Warna Emas Amber untuk Titik Tertinggi
                        : entry.expenseAmount > 0
                        ? '#fb7185' // Warna Pastel Coral untuk hari dengan transaksi
                        : '#f1f5f9' // Warna Soft Gray untuk hari nol pengeluaran
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Informasi Grafik */}
        <div className="flex items-center justify-center gap-6 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-amber-500 shadow-xs" />
            <span className="text-slate-700 font-bold">Titik Pengeluaran Tertinggi (Peak)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-rose-400" />
            <span className="text-slate-600 font-medium">Hari Pengeluaran Biasa</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-slate-200" />
            <span className="text-slate-500 font-medium">Nol Pengeluaran</span>
          </div>
        </div>
      </div>

      {/* 2. KARTU PENJELASAN CERDAS KENAPA GRAFIK TINGGI PADA HARI ITU (PASTEL AMBER WARM) */}
      <div className="rounded-3xl p-6 bg-amber-50/90 border border-amber-200/90 shadow-xs">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-extrabold text-amber-950 tracking-tight">
              Analisis Mendalam: Kenapa Pengeluaran Tertinggi pada Hari Itu?
            </h4>
            <span className="text-xs text-amber-800/80 font-medium">
              Evaluasi faktor pemicu lonjakan pengeluaran keluarga di bulan {monthName}
            </span>
          </div>
        </div>

        {hasExpenseData && peakInsight.dateStr ? (
          <div className="space-y-4 pt-1">
            {/* Ringkasan Fakta */}
            <div className="p-4 rounded-2xl bg-white/90 border border-amber-200/70 shadow-2xs space-y-2">
              <p className="text-xs text-slate-800 leading-relaxed">
                Puncak pengeluaran keluarga pada bulan ini jatuh pada{' '}
                <strong className="text-amber-900 font-extrabold underline">
                  {peakInsight.formattedDate}
                </strong>{' '}
                dengan total pengeluaran mencapai{' '}
                <strong className="text-rose-600 font-extrabold">
                  {formatRupiah(peakInsight.totalExpense)}
                </strong>
                .
              </p>

              {peakInsight.percentageAboveAverage > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Angka ini{' '}
                    <strong className="text-rose-600 font-extrabold">
                      +{peakInsight.percentageAboveAverage}%
                    </strong>{' '}
                    lebih tinggi dari rata-rata harian ({formatRupiah(peakInsight.dailyAverage)}/hari).
                  </span>
                </div>
              )}
            </div>

            {/* Rincian Transaksi Pemicu Lonjakan */}
            <div>
              <span className="text-xs font-bold text-amber-950 block mb-2.5">
                Daftar Transaksi Pemicu Lonjakan pada Tanggal Tersebut:
              </span>

              {peakInsight.transactions.length > 0 ? (
                <div className="space-y-2">
                  {peakInsight.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-2xl bg-white/90 border border-amber-200/70 flex items-center justify-between gap-3 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate">
                            {tx.merchant}
                          </span>
                          <span className="text-[11px] text-indigo-600 font-medium">
                            {tx.categoryName || 'Pengeluaran'}
                          </span>
                        </div>
                      </div>

                      <span className="font-extrabold text-rose-600 shrink-0">
                        -{formatRupiah(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Transaksi tercatat secara akumulatif pada hari tersebut.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Empty State: Belum ada transaksi */
          <div className="p-4 rounded-2xl bg-white/90 border border-amber-200/70 text-xs text-slate-700 shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-emerald-600 font-bold mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Arus Kas Sangat Terkendali</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Belum terdeteksi titik lonjakan pengeluaran pada periode {monthName} karena belum ada transaksi pengeluaran yang dicatat. Saat transaksi baru masuk di tab Transactions, sistem akan otomatis mengidentifikasi hari puncak dan merincikan alasannya di sini.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
