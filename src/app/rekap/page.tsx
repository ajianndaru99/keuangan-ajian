'use client';

// ==============================================================================
// ANALYTICS PAGE: src/app/rekap/page.tsx
// Halaman Analisis Finansial Penuh 1 Bulan & Deteksi Titik Tertinggi Penggunaan
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import MonthlyPeakSpendingChart, {
  DayUsageItem,
  PeakDayInsight,
  PeakTransactionItem,
} from '@/components/rekap/MonthlyPeakSpendingChart';
import CategoryExpensesChart, { CategoryExpenseItem } from '@/components/rekap/CategoryExpensesChart';
import { formatRupiah } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  RefreshCw,
  Wallet,
} from 'lucide-react';

export default function AnalyticsPage() {
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Offset Bulan (0 = Bulan Ini, -1 = Bulan Lalu, dst)
  const [monthOffset, setMonthOffset] = useState<number>(0);

  // State Transaksi Mentah Bulan Berjalan
  const [monthTransactions, setMonthTransactions] = useState<any[]>([]);

  // Hitung Tanggal Mulai dan Akhir Bulan Aktif
  const activeDateInfo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Hari terakhir bulan
    const totalDays = endDate.getDate();
    const monthName = startDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

    return {
      year,
      month,
      totalDays,
      monthName,
      startISO: new Date(year, month, 1, 0, 0, 0, 0).toISOString(),
      endISO: new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString(),
    };
  }, [monthOffset]);

  // Fetch Transaksi Bulan Ini dari Database
  const fetchAnalyticsData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setMonthTransactions([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) return;

      setUserRole(profile.role);
      setDisplayName(profile.display_name);

      // Ambil seluruh transaksi dalam 1 bulan penuh
      const { data: txList } = await supabase
        .from('transactions')
        .select(`
          id, amount, direction, merchant, transaction_date, status,
          categories (name)
        `)
        .eq('household_id', profile.household_id)
        .gte('transaction_date', activeDateInfo.startISO)
        .lte('transaction_date', activeDateInfo.endISO)
        .order('transaction_date', { ascending: true });

      if (txList) {
        setMonthTransactions(txList);
      } else {
        setMonthTransactions([]);
      }
    } catch (err) {
      console.warn('Gagal memuat analitik:', err);
      setMonthTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [activeDateInfo]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Agregasi Data Penggunaan Harian Selama 1 Bulan (1 s/d Total Hari)
  const { dailyData, peakInsight, totalExpense, totalIncome, netDifference, dailyAverage } = useMemo(() => {
    const expenseMap: Record<string, number> = {};
    const incomeMap: Record<string, number> = {};
    const txByDateMap: Record<string, PeakTransactionItem[]> = {};

    let sumExpense = 0;
    let sumIncome = 0;

    monthTransactions.forEach((tx) => {
      if (tx.status !== 'reconciled') return;

      const d = new Date(tx.transaction_date);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const amt = Number(tx.amount || 0);

      if (tx.direction === 'out') {
        expenseMap[dateKey] = (expenseMap[dateKey] || 0) + amt;
        sumExpense += amt;

        if (!txByDateMap[dateKey]) txByDateMap[dateKey] = [];
        txByDateMap[dateKey].push({
          id: tx.id,
          merchant: tx.merchant || 'Pengeluaran',
          amount: amt,
          categoryName: (tx.categories as any)?.name || 'Lainnya',
          direction: 'out',
        });
      } else {
        incomeMap[dateKey] = (incomeMap[dateKey] || 0) + amt;
        sumIncome += amt;
      }
    });

    // Cari Titik Tertinggi Penggunaan Total (Peak Day)
    let maxExpense = 0;
    let peakDateKey: string | null = null;

    Object.entries(expenseMap).forEach(([dKey, exp]) => {
      if (exp > maxExpense) {
        maxExpense = exp;
        peakDateKey = dKey;
      }
    });

    // Bangun Data Harian Lengkap untuk 1 Bulan Penuh
    const days: DayUsageItem[] = [];
    for (let day = 1; day <= activeDateInfo.totalDays; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(activeDateInfo.month + 1).padStart(2, '0');
      const fullDateStr = `${activeDateInfo.year}-${monthStr}-${dayStr}`;

      const exp = expenseMap[fullDateStr] || 0;
      const inc = incomeMap[fullDateStr] || 0;
      const isPeak = fullDateStr === peakDateKey && exp > 0;

      days.push({
        dayNumber: day,
        dateStr: fullDateStr,
        dayLabel: dayStr,
        expenseAmount: exp,
        incomeAmount: inc,
        isPeak,
      });
    }

    const avg = activeDateInfo.totalDays > 0 ? Math.round(sumExpense / activeDateInfo.totalDays) : 0;
    const pctAbove = avg > 0 && maxExpense > avg ? Math.round(((maxExpense - avg) / avg) * 100) : 0;

    let formattedPeakDate = '-';
    if (peakDateKey) {
      try {
        const pd = new Date(`${peakDateKey}T00:00:00`);
        formattedPeakDate = pd.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        formattedPeakDate = peakDateKey;
      }
    }

    const insight: PeakDayInsight = {
      dateStr: peakDateKey,
      formattedDate: formattedPeakDate,
      totalExpense: maxExpense,
      dailyAverage: avg,
      percentageAboveAverage: pctAbove,
      transactions: peakDateKey ? txByDateMap[peakDateKey] || [] : [],
    };

    return {
      dailyData: days,
      peakInsight: insight,
      totalExpense: sumExpense,
      totalIncome: sumIncome,
      netDifference: sumIncome - sumExpense,
      dailyAverage: avg,
    };
  }, [monthTransactions, activeDateInfo]);

  // Agregasi Kategori untuk Komposisi Pengeluaran
  const categoryBreakdown: CategoryExpenseItem[] = useMemo(() => {
    const catMap: Record<string, number> = {};
    let totalCatExpense = 0;

    monthTransactions.forEach((tx) => {
      if (tx.direction === 'out' && tx.status === 'reconciled') {
        const cName = (tx.categories as any)?.name || 'Lainnya';
        const amt = Number(tx.amount || 0);
        catMap[cName] = (catMap[cName] || 0) + amt;
        totalCatExpense += amt;
      }
    });

    return Object.entries(catMap)
      .map(([name, total]) => ({
        category_id: name,
        category_name: name,
        category_icon: 'tag',
        total_amount: total,
        percentage: totalCatExpense > 0 ? Number(((total / totalCatExpense) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount);
  }, [monthTransactions]);

  return (
    <AppShell userRole={userRole} displayName={displayName} pendingCount={0}>
      <div className="space-y-6">
        {/* Header Navigasi Periode 1 Bulan */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Analisis Finansial Bulanan (Analytics)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluasi mendalam pergerakan pengeluaran keluarga selama 1 bulan penuh
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xs">
              <button
                onClick={() => setMonthOffset((prev) => prev - 1)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-3 py-1 text-xs font-bold text-white">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{activeDateInfo.monthName}</span>
              </div>

              <button
                onClick={() => setMonthOffset((prev) => prev + 1)}
                disabled={monthOffset >= 0}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors"
                title="Bulan Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={fetchAnalyticsData}
              title="Refresh Analitik"
              className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4 KARTU METRIK UTAMA ANALITIK (WARNA PASTEL DI ATAS DARK) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* 1. Pengeluaran (Pastel Coral) */}
          <div className="p-4 rounded-3xl bg-rose-950/20 border border-rose-500/25 shadow-xs backdrop-blur-xs">
            <div className="flex items-center justify-between text-rose-300 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Pengeluaran</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-rose-300 tracking-tight">
              -{formatRupiah(totalExpense)}
            </p>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Akumulasi belanja & tagihan terverifikasi
            </span>
          </div>

          {/* 2. Pemasukan (Pastel Mint) */}
          <div className="p-4 rounded-3xl bg-emerald-950/20 border border-emerald-500/25 shadow-xs backdrop-blur-xs">
            <div className="flex items-center justify-between text-emerald-300 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Pemasukan</span>
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-emerald-300 tracking-tight">
              +{formatRupiah(totalIncome)}
            </p>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Gaji & transfer masuk terverifikasi
            </span>
          </div>

          {/* 3. Rata-rata Harian (Pastel Sky) */}
          <div className="p-4 rounded-3xl bg-sky-950/20 border border-sky-500/25 shadow-xs backdrop-blur-xs">
            <div className="flex items-center justify-between text-sky-300 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Rata-rata Pengeluaran</span>
              <TrendingDown className="w-4 h-4" />
            </div>
            <p className="text-xl font-black text-sky-300 tracking-tight">
              {formatRupiah(dailyAverage)}/hari
            </p>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Rata-rata belanja per hari ({activeDateInfo.totalDays} hari)
            </span>
          </div>

          {/* 4. Arus Kas Bersih (Pastel Lavender) */}
          <div className="p-4 rounded-3xl bg-purple-950/20 border border-purple-500/25 shadow-xs backdrop-blur-xs">
            <div className="flex items-center justify-between text-purple-300 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider">Arus Kas Bersih (Net)</span>
              <Wallet className="w-4 h-4" />
            </div>
            <p className={`text-xl font-black tracking-tight ${netDifference >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {netDifference >= 0 ? '+' : ''}{formatRupiah(netDifference)}
            </p>
            <span className="text-[10px] text-slate-400 mt-1 block">
              {netDifference >= 0 ? 'Surplus tabungan bulan ini' : 'Defisit kas bulan ini'}
            </span>
          </div>
        </div>

        {/* GRAFIK PENGGUNAAN 1 BULAN & ANALISIS TITIK TERTINGGI (PEAK DAY INSIGHT) */}
        <MonthlyPeakSpendingChart
          data={dailyData}
          peakInsight={peakInsight}
          monthName={activeDateInfo.monthName}
        />

        {/* KOMPOSISI PENGELUARAN PER KATEGORI BULAN INI */}
        {categoryBreakdown.length > 0 && (
          <div className="rounded-3xl p-6 bg-slate-900/60 border border-slate-800 shadow-sm backdrop-blur-xs">
            <h3 className="text-sm font-bold text-white mb-4">
              Porsi Pengeluaran per Kategori ({activeDateInfo.monthName})
            </h3>
            <CategoryExpensesChart categories={categoryBreakdown} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
