'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/MonthlyPeakSpendingChart.tsx
// Grafik Penggunaan 1 Bulan & Analisis Titik Tertinggi (Peak Day Insight)
// ==============================================================================

import { useState, useEffect, useMemo } from 'react';
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
  RefreshCw,
  Lightbulb,
  ShieldCheck,
  Loader2,
  Bot,
} from 'lucide-react';
import type { FinancialAIAnalysisResult } from '@/lib/ai/financial-advisor';

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
  totalExpense?: number;
  totalIncome?: number;
  netDifference?: number;
  dailyAverage?: number;
  categoryBreakdown?: Array<{
    category_name?: string;
    total_amount?: number;
    name?: string;
    amount?: number;
    percentage: number;
  }>;
  transactionCount?: number;
}

function CustomBarTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item: DayUsageItem = payload[0].payload;
    return (
      <div className="p-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xl text-xs min-w-[160px] text-[var(--text-main)]">
        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-color)]/70 mb-1.5">
          <span className="font-extrabold text-[var(--text-main)]">Tgl {item.dayNumber}</span>
          {item.isPeak && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Titik Tertinggi
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[#DC3545] font-bold">
            <span>Pengeluaran:</span>
            <span className="angka-keuangan">{formatRupiah(item.expenseAmount)}</span>
          </div>
          {item.incomeAmount > 0 && (
            <div className="flex items-center justify-between text-[#198754] font-bold">
              <span>Pemasukan:</span>
              <span className="angka-keuangan">{formatRupiah(item.incomeAmount)}</span>
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
  totalExpense,
  totalIncome,
  netDifference,
  dailyAverage,
  categoryBreakdown,
  transactionCount,
}: MonthlyPeakSpendingChartProps) {
  const [analysisResult, setAnalysisResult] = useState<FinancialAIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Muat cache analisis AI dari sessionStorage bila sudah pernah diminta pada periode ini
  useEffect(() => {
    try {
      const cacheKey = `gemini_fin_analysis_${monthName}`;
      const saved = sessionStorage.getItem(cacheKey);
      if (saved) {
        setAnalysisResult(JSON.parse(saved));
      } else {
        setAnalysisResult(null);
      }
    } catch {
      // Abaikan jika storage terbatas
    }
  }, [monthName]);

  // Handler on-demand: Hanya mengirim request bila pengguna menekan tombol analisis
  const handleRequestAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    const calcExpense = totalExpense ?? peakInsight.totalExpense;
    const calcIncome = totalIncome ?? 0;
    const calcNet = netDifference ?? (calcIncome - calcExpense);
    const calcDailyAvg = dailyAverage ?? peakInsight.dailyAverage;

    const payload = {
      monthName,
      totalExpense: calcExpense,
      totalIncome: calcIncome,
      netDifference: calcNet,
      dailyAverage: calcDailyAvg,
      peakInsight: {
        dateStr: peakInsight.dateStr,
        formattedDate: peakInsight.formattedDate,
        totalExpense: peakInsight.totalExpense,
        dailyAverage: peakInsight.dailyAverage,
        percentageAboveAverage: peakInsight.percentageAboveAverage,
        transactions: peakInsight.transactions || [],
      },
      topCategories: (categoryBreakdown || []).map((c) => ({
        name: c.name || c.category_name || 'Lainnya',
        amount: c.amount || c.total_amount || 0,
        percentage: c.percentage || 0,
      })),
      transactionCount: transactionCount ?? (peakInsight.transactions?.length || 0),
    };

    try {
      const res = await fetch('/api/rekap/ai-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Gagal memproses analisis.`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        setAnalysisResult(json.data);
        try {
          sessionStorage.setItem(`gemini_fin_analysis_${monthName}`, JSON.stringify(json.data));
        } catch {}
      } else {
        throw new Error(json.error || 'Respons analisis tidak valid.');
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Terjadi kesalahan saat memanggil Gemini Flash.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const hasExpenseData = useMemo(() => {
    return data.some((d) => d.expenseAmount > 0);
  }, [data]);

  return (
    <div className="space-y-4">
      {/* 1. KARTU GRAFIK 1 BULAN (BERSIH DENGAN GRIDLINE TIPIS #E2E8F0) */}
      <div className="rounded-3xl p-6 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="text-base font-extrabold text-[var(--text-main)] tracking-tight">
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
              <span>Titik Tertinggi: <strong className="angka-keuangan">{formatRupiah(peakInsight.totalExpense)}</strong></span>
            </div>
          )}
        </div>

        {/* Visualisasi Grafik Batang Recharts dengan Gridline #E2E8F0 */}
        <div className="h-64 w-full -ml-2 my-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
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
                        ? '#DC3545' // Warna Merah Bata Muted #DC3545 untuk Hari Pengeluaran Biasa
                        : '#f1f5f9' // Warna Soft Gray untuk hari nol pengeluaran
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Informasi Grafik */}
        <div className="flex items-center justify-center gap-6 pt-3 border-t border-[#E2E8F0] text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-amber-500 shadow-xs" />
            <span className="text-slate-700 font-bold">Titik Pengeluaran Tertinggi (Peak)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-[#DC3545]" />
            <span className="text-slate-600 font-medium">Hari Pengeluaran Biasa</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-md bg-slate-200" />
            <span className="text-slate-500 font-medium">Nol Pengeluaran</span>
          </div>
        </div>
      </div>

      {/* 2. KARTU PENJELASAN CERDAS KENAPA PENGELUARAN TERTINGGI PADA HARI ITU */}
      <div className="rounded-3xl p-6 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-[var(--text-main)] tracking-tight">
                Analisis Mendalam: Kenapa Pengeluaran Tertinggi pada Hari Itu?
              </h4>
              <span className="text-xs text-[var(--text-muted)] dark:text-[#a3e6d8] font-medium">
                Evaluasi faktor pemicu lonjakan pengeluaran keluarga di bulan {monthName}
              </span>
            </div>
          </div>

          {/* Tombol On-Demand Gemini Flash */}
          <div className="flex items-center gap-2 shrink-0">
            {analysisResult ? (
              <button
                onClick={handleRequestAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] hover:bg-[var(--bg-card)] text-xs font-bold text-[var(--text-main)] transition-all shadow-2xs disabled:opacity-50"
                title="Perbarui analisis dengan transaksi terbaru"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#007a33] dark:text-[#a3e6d8] ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>Analisis Ulang</span>
              </button>
            ) : (
              <button
                onClick={handleRequestAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#007a33] hover:bg-[#005a26] text-white text-xs font-bold transition-all shadow-sm active:scale-98 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Minta Analisis AI Gemini</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* FAKTA DATA: Ringkasan Pengeluaran Tertinggi */}
        {hasExpenseData && peakInsight.dateStr ? (
          <div className="space-y-4 pt-1">
            {/* Ringkasan Fakta Angka */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/80 shadow-2xs space-y-2">
              <p className="text-xs text-[var(--text-main)] leading-relaxed">
                Puncak pengeluaran keluarga pada bulan ini jatuh pada{' '}
                <strong className="text-[#007a33] dark:text-[#a3e6d8] font-extrabold underline">
                  {peakInsight.formattedDate}
                </strong>{' '}
                dengan total pengeluaran mencapai{' '}
                <strong className="text-[#DC3545] font-extrabold angka-keuangan">
                  {formatRupiah(peakInsight.totalExpense)}
                </strong>
                .
              </p>

              {peakInsight.percentageAboveAverage > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] dark:text-[#a3e6d8]">
                  <ArrowUpRight className="w-4 h-4 text-[#DC3545] shrink-0" />
                  <span>
                    Angka ini{' '}
                    <strong className="text-[#DC3545] font-extrabold angka-keuangan">
                      +{peakInsight.percentageAboveAverage}%
                    </strong>{' '}
                    lebih tinggi dari rata-rata harian ({formatRupiah(peakInsight.dailyAverage)}/hari).
                  </span>
                </div>
              )}
            </div>

            {/* Rincian Transaksi Pemicu Lonjakan */}
            <div>
              <span className="text-xs font-bold text-[var(--text-main)] block mb-2.5">
                Daftar Transaksi Pemicu Lonjakan pada Tanggal Tersebut:
              </span>

              {peakInsight.transactions.length > 0 ? (
                <div className="space-y-2">
                  {peakInsight.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70 flex items-center justify-between gap-3 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-[#fde8ea] text-[#DC3545] dark:bg-rose-950/40 dark:text-rose-300 border border-[#DC3545]/20 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-[var(--text-main)] block truncate">
                            {tx.merchant}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] dark:text-[#a3e6d8] font-medium">
                            {tx.categoryName || 'Pengeluaran'}
                          </span>
                        </div>
                      </div>

                      <span className="font-extrabold text-[#DC3545] shrink-0 angka-keuangan">
                        -{formatRupiah(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] dark:text-[#a3e6d8] italic">
                  Transaksi tercatat secara akumulatif pada hari tersebut.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Empty State: Belum ada transaksi */
          <div className="p-4 rounded-2xl bg-[var(--bg-main)]/50 border border-amber-200/70 dark:border-amber-700/60 text-xs text-[var(--text-main)] shadow-2xs space-y-1">
            <div className="flex items-center gap-2 text-[#198754] font-bold mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Arus Kas Sangat Terkendali</span>
            </div>
            <p className="text-[var(--text-muted)] dark:text-[#a3e6d8] leading-relaxed">
              Belum terdeteksi titik lonjakan pengeluaran pada periode {monthName} karena belum ada transaksi pengeluaran yang dicatat. Saat transaksi baru masuk di tab Transactions, sistem akan otomatis mengidentifikasi hari puncak dan merincikan alasannya di sini.
            </p>
          </div>
        )}

        {/* ========================================================
            MODUL REAL AI GEMINI FLASH: KOTAK HASIL ANALISIS ON-DEMAND
            ======================================================== */}
        <div className="pt-2 border-t border-[var(--border-color)]/60">
          {/* Status Loading */}
          {isAnalyzing && (
            <div className="p-5 rounded-2xl bg-[var(--bg-main)] border border-emerald-400/30 flex flex-col items-center justify-center text-center space-y-2 animate-pulse">
              <div className="w-10 h-10 rounded-2xl bg-[#007a33]/15 text-[#007a33] dark:text-[#a3e6d8] flex items-center justify-center">
                <Sparkles className="w-5 h-5 animate-spin" />
              </div>
              <h5 className="text-xs font-bold text-[var(--text-main)]">
                Google Gemini Flash sedang menganalisis keuangan keluarga...
              </h5>
              <p className="text-[11px] text-[var(--text-muted)] dark:text-[#a3e6d8]/80 max-w-sm">
                Mengevaluasi transaksi pemicu lonjakan, menghitung rasio arus kas, dan merumuskan saran penghematan khusus untuk {monthName}.
              </p>
            </div>
          )}

          {/* Status Error */}
          {analysisError && !isAnalyzing && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Gagal Menganalisis Keuangan</p>
                  <p className="text-[11px] opacity-90 mt-0.5">{analysisError}</p>
                </div>
              </div>
              <button
                onClick={handleRequestAnalysis}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] shrink-0"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Belum Diminta: Tampilkan Ajakan Hemat Kredit */}
          {!analysisResult && !isAnalyzing && (
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-dashed border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-[var(--text-main)]">
                    Analisis Real AI Gemini Flash Tersedia
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] dark:text-[#a3e6d8]/80 mt-0.5">
                    Hanya menganalisis saat Anda meminta tombol di kanan atas untuk menghemat kredit AI.
                  </p>
                </div>
              </div>
              <button
                onClick={handleRequestAnalysis}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#007a33] hover:bg-[#005a26] text-white font-bold text-xs shrink-0 transition-colors shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Minta Analisis Sekarang</span>
              </button>
            </div>
          )}

          {/* HASIL ANALISIS REAL AI GEMINI FLASH */}
          {analysisResult && !isAnalyzing && (
            <div className="p-5 rounded-2xl bg-[var(--bg-main)] border border-emerald-400/40 shadow-xs space-y-4">
              {/* Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-color)]/70">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#007a33]/15 text-[#007a33] dark:text-[#a3e6d8] border border-[#007a33]/20">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span>Dianalisis oleh {analysisResult.modelUsed}</span>
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] dark:text-[#a3e6d8]/70">
                    {new Date(analysisResult.generatedAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    WIB
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      analysisResult.cashFlowStatus === 'surplus' || analysisResult.cashFlowStatus === 'healthy'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : analysisResult.cashFlowStatus === 'balanced'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>
                      {analysisResult.cashFlowStatus === 'surplus'
                        ? 'Kas Surplus'
                        : analysisResult.cashFlowStatus === 'healthy'
                        ? 'Kas Sehat'
                        : analysisResult.cashFlowStatus === 'balanced'
                        ? 'Kas Seimbang'
                        : 'Kas Defisit'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Headline */}
              <h5 className="text-sm font-extrabold text-[var(--text-main)] tracking-tight">
                {analysisResult.headline}
              </h5>

              {/* Uraian 1: Evaluasi Puncak Hari Tertinggi */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider block">
                  Kenapa Hari Tersebut Tertinggi?
                </span>
                <p className="text-xs text-[var(--text-main)] leading-relaxed bg-[var(--bg-card)]/50 p-3 rounded-xl border border-[var(--border-color)]/70">
                  {analysisResult.peakAnalysis}
                </p>
              </div>

              {/* Uraian 2: Evaluasi Arus Kas */}
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-[var(--text-main)] uppercase tracking-wider block">
                  Kondisi Arus Kas Bulan Ini:
                </span>
                <p className="text-xs text-[var(--text-muted)] dark:text-[#a3e6d8] leading-relaxed bg-[var(--bg-card)]/50 p-3 rounded-xl border border-[var(--border-color)]/70">
                  {analysisResult.cashFlowEvaluation}
                </p>
              </div>

              {/* Uraian 3: Saran & Rekomendasi Penghematan */}
              {analysisResult.actionableTips && analysisResult.actionableTips.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-main)]">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Saran Praktis untuk Keluarga:</span>
                  </div>
                  <ul className="space-y-1.5 pl-1">
                    {analysisResult.actionableTips.map((tip, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-[var(--text-main)] flex items-start gap-2 bg-[var(--bg-card)]/40 p-2.5 rounded-xl border border-[var(--border-color)]/60"
                      >
                        <span className="w-4 h-4 rounded-full bg-[#007a33]/15 text-[#007a33] dark:text-[#a3e6d8] text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Highlight Peluang Hemat */}
              {analysisResult.savingsOpportunity && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200">
                  <strong className="font-bold block mb-0.5">💡 Rekomendasi Penghematan Terbesar:</strong>
                  <span className="leading-relaxed text-[11px]">
                    {analysisResult.savingsOpportunity}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
