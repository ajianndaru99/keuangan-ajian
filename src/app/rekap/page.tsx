'use client';

// ==============================================================================
// REKAP PAGE: src/app/rekap/page.tsx
// Halaman Rekapitulasi Mingguan & Bulanan (Fase 4 - Inti Sistem)
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import PeriodNavigator from '@/components/rekap/PeriodNavigator';
import FinancialSummaryCard from '@/components/rekap/FinancialSummaryCard';
import FinancialSpeedometerArc from '@/components/rekap/FinancialSpeedometerArc';
import CategoryExpensesChart, { CategoryExpenseItem } from '@/components/rekap/CategoryExpensesChart';
import DailyTrendChart, { DailyTrendItem } from '@/components/rekap/DailyTrendChart';
import {
  getWeeklyRange,
  getMonthlyRange,
  calculateComparison,
  DateRange,
} from '@/lib/date-utils';
import {
  RefreshCw,
  FolderOpen,
} from 'lucide-react';

export default function RekapPage() {
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly');
  const [offset, setOffset] = useState<number>(0);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri'>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [, setIsCloudConnected] = useState(false);

  // State Akun untuk Filter
  const [accounts, setAccounts] = useState<any[]>([]);

  // State Data Rekap Murni (Dimulai dari 0, tanpa data dummy)
  const [summary, setSummary] = useState({
    totalExpense: 0,
    totalIncome: 0,
    netDifference: 0,
    pendingCount: 0,
    pendingExpense: 0,
  });

  const [previousExpense, setPreviousExpense] = useState(0);
  const [categories, setCategories] = useState<CategoryExpenseItem[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrendItem[]>([]);

  // Hitung rentang tanggal periode saat ini & periode sebelumnya
  const currentRange: DateRange = useMemo(() => {
    return periodType === 'weekly'
      ? getWeeklyRange(offset)
      : getMonthlyRange(offset, 1);
  }, [periodType, offset]);

  const previousRange: DateRange = useMemo(() => {
    return periodType === 'weekly'
      ? getWeeklyRange(offset - 1)
      : getMonthlyRange(offset - 1, 1);
  }, [periodType, offset]);

  // Kalkulasi perbandingan dengan periode lalu
  const comparison = useMemo(() => {
    return calculateComparison(summary.totalExpense, previousExpense);
  }, [summary.totalExpense, previousExpense]);

  // Ambil data rekap dari Supabase via RPC
  const fetchRekapData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsCloudConnected(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsCloudConnected(false);
        setSummary({
          totalExpense: 0,
          totalIncome: 0,
          netDifference: 0,
          pendingCount: 0,
          pendingExpense: 0,
        });
        setPreviousExpense(0);
        setCategories([]);
        setDailyTrend([]);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) {
        setIsCloudConnected(false);
        return;
      }

      setUserRole(profile.role);
      setDisplayName(profile.display_name);

      // Ambil daftar akun untuk dropdown filter
      const { data: accList } = await supabase
        .from('accounts')
        .select('id, name, owner, type')
        .eq('household_id', profile.household_id)
        .eq('is_active', true);

      if (accList) setAccounts(accList);

      const ownerParam = filterOwner === 'all' ? null : filterOwner;
      const accountParam = selectedAccountId === 'all' ? null : selectedAccountId;
      const startISO = currentRange.startDate.toISOString();
      const endISO = currentRange.endDate.toISOString();
      const prevStartISO = previousRange.startDate.toISOString();
      const prevEndISO = previousRange.endDate.toISOString();

      // 1. RPC: Summary Periode Saat Ini
      const { data: sumData } = await supabase.rpc('get_financial_summary', {
        p_household_id: profile.household_id,
        p_start_date: startISO,
        p_end_date: endISO,
        p_owner: ownerParam,
        p_account_id: accountParam,
      });

      if (sumData && sumData.length > 0) {
        const item = sumData[0];
        setSummary({
          totalExpense: Number(item.total_expense || 0),
          totalIncome: Number(item.total_income || 0),
          netDifference: Number(item.net_difference || 0),
          pendingCount: Number(item.pending_count || 0),
          pendingExpense: Number(item.pending_expense || 0),
        });
        setIsCloudConnected(true);
      }

      // 2. RPC: Summary Periode Sebelumnya (untuk komparasi)
      const { data: prevSumData } = await supabase.rpc('get_financial_summary', {
        p_household_id: profile.household_id,
        p_start_date: prevStartISO,
        p_end_date: prevEndISO,
        p_owner: ownerParam,
        p_account_id: accountParam,
      });

      if (prevSumData && prevSumData.length > 0) {
        setPreviousExpense(Number(prevSumData[0].total_expense || 0));
      }

      // 3. RPC: Pengeluaran per Kategori
      const { data: catData } = await supabase.rpc('get_category_expenses', {
        p_household_id: profile.household_id,
        p_start_date: startISO,
        p_end_date: endISO,
        p_owner: ownerParam,
        p_account_id: accountParam,
      });

      if (catData) {
        setCategories(
          catData.map((c: any) => ({
            category_id: c.category_id,
            category_name: c.category_name,
            category_icon: c.category_icon || 'tag',
            total_amount: Number(c.total_amount || 0),
            percentage: Number(c.percentage || 0),
          }))
        );
      }

      // 4. RPC: Tren Harian
      const { data: trendData } = await supabase.rpc('get_daily_financial_trend', {
        p_household_id: profile.household_id,
        p_start_date: startISO,
        p_end_date: endISO,
        p_owner: ownerParam,
        p_account_id: accountParam,
      });

      if (trendData) {
        setDailyTrend(
          trendData.map((d: any) => ({
            period_date: d.period_date,
            expense_amount: Number(d.expense_amount || 0),
            income_amount: Number(d.income_amount || 0),
          }))
        );
      }
    } catch (err) {
      console.warn('Gagal memuat rekap:', err);
    } finally {
      setLoading(false);
    }
  }, [
    currentRange,
    previousRange,
    filterOwner,
    selectedAccountId,
  ]);

  useEffect(() => {
    fetchRekapData();
  }, [fetchRekapData]);

  // Handler pergantian jenis periode (reset offset ke 0)
  const handleTogglePeriodType = (type: 'weekly' | 'monthly') => {
    setPeriodType(type);
    setOffset(0);
  };

  return (
    <>
      <Navbar
        userRole={userRole}
        displayName={displayName}
        pendingCount={summary.pendingCount}
      />

      <main className="flex-1 pb-28 max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 pt-3.5">
        {/* Navigasi Periode Mingguan & Bulanan */}
        <PeriodNavigator
          periodType={periodType}
          onTogglePeriodType={handleTogglePeriodType}
          dateRange={currentRange}
          offset={offset}
          onPrev={() => setOffset((prev) => prev - 1)}
          onNext={() => setOffset((prev) => prev + 1)}
          onReset={() => setOffset(0)}
        />

        {/* Filter Bar: Pemilik & Akun */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3.5 py-0.5 pr-4">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'all'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-transparent shadow-md shadow-sky-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            Gabungan
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'suami'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-transparent shadow-md shadow-sky-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            👨 Suami
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'istri'
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent shadow-md shadow-pink-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            👩 Istri
          </button>

          {/* Filter Akun Dropdown */}
          {accounts.length > 0 && (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-3 py-1.5 rounded-2xl liquid-pill text-xs font-bold text-slate-800 dark:text-white border border-slate-200/80 dark:border-white/10 focus:outline-none"
            >
              <option value="all" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                Semua Akun
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                  {acc.name} ({acc.owner === 'suami' ? 'Suami' : 'Istri'})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={fetchRekapData}
            title="Refresh rekap"
            className="p-2 rounded-2xl liquid-pill text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ml-auto shrink-0 transition-all border border-slate-200/80 dark:border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Speedometer Radial Arc Gauge */}
        <div className="mb-3.5">
          <FinancialSpeedometerArc
            monthlyLimit={periodType === 'weekly' ? 2000000 : 8000000}
            currentSpending={summary.totalExpense}
            totalNetWorth={
              accounts.length > 0
                ? accounts.reduce((acc, a) => acc + Number(a.balance ?? a.current_balance ?? a.initial_balance ?? 0), 0)
                : Math.max(0, summary.netDifference)
            }
            selectedPeriod={periodType === 'weekly' ? 'weekly' : 'monthly'}
            onPeriodChange={(p) => {
              if (p === 'weekly') handleTogglePeriodType('weekly');
              else handleTogglePeriodType('monthly');
            }}
            onExportReport={() => window.print()}
          />
        </div>

        {/* Ringkasan Finansial Periode & Perbandingan */}
        <FinancialSummaryCard
          totalExpense={summary.totalExpense}
          totalIncome={summary.totalIncome}
          netDifference={summary.netDifference}
          pendingCount={summary.pendingCount}
          pendingExpense={summary.pendingExpense}
          comparison={comparison}
          periodLabel={currentRange.label}
        />

        {/* Grafik Batang Pengeluaran per Kategori & Top 5 */}
        <CategoryExpensesChart categories={categories} />

        {/* Grafik Tren Harian dalam Periode */}
        <DailyTrendChart data={dailyTrend} />

        {/* Empty State jika tidak ada data sama sekali */}
        {summary.totalExpense === 0 && summary.totalIncome === 0 && (
          <div className="text-center py-12 px-6 rounded-3xl liquid-glass border border-white/80 dark:border-white/10 my-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-sky-100/80 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3 shadow-sm border border-sky-200 dark:border-sky-800/40">
              <FolderOpen className="w-7 h-7" />
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Belum Ada Transaksi di Periode Ini
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Transaksi yang dikategorikan di Inbox pada rentang waktu ini akan langsung direkap otomatis di sini.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
