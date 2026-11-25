'use client';

// ==============================================================================
// HALAMAN UTAMA (TUNGGAL): src/app/page.tsx
// Rekap & Analisis Finansial Keluarga (Grafik, Perputaran Keuangan, & Google Sheets)
// Website & Aplikasi HP identik (Strictly Read-Only — Kendali Penuh via Telegram)
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import CashflowRotationSection from '@/components/dashboard/CashflowRotationSection';
import MonthlyPeakSpendingChart, {
  DayUsageItem,
  PeakDayInsight,
  PeakTransactionItem,
} from '@/components/rekap/MonthlyPeakSpendingChart';
import CategoryExpensesChart, { CategoryExpenseItem } from '@/components/rekap/CategoryExpensesChart';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import { exportTransactionsToCsv, type ExportableTransaction } from '@/lib/export-excel';
import { syncAllHouseholdAccountBalances } from '@/lib/account-balance';
import {
  TARGET_BUDGET_CATEGORIES,
  isInternalTransferCategoryOrMerchant,
  matchTargetCategory,
} from '@/lib/budget/budget-guard';
import { deduplicateSimultaneousExpenses } from '@/lib/telegram/commands';
import type { TransactionItem } from '@/types/transaction';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Wallet,
  Download,
  FileSpreadsheet,
  Bot,
  Building2,
  Smartphone,
} from 'lucide-react';

interface AccountSummary {
  id: string;
  name: string;
  type: 'bank' | 'ewallet';
  current_balance: number;
}

export default function RekapAndAnalysisHomePage() {
  const { isHideBalance } = usePrivacy();
  const [displayName, setDisplayName] = useState<string>('Kepala Keluarga (Suami)');
  const [loading, setLoading] = useState(false);
  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [monthTransactions, setMonthTransactions] = useState<TransactionItem[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState(false);

  const activeDateInfo = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    return {
      year,
      month,
      totalDays: endDate.getDate(),
      monthName: startDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
      startISO: new Date(year, month, 1, 0, 0, 0, 0).toISOString(),
      endISO: new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString(),
    };
  }, [monthOffset]);

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
        .select('display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.household_id) return;
      setDisplayName(profile.display_name || 'Kepala Keluarga (Suami)');

      const [{ data: txList }, syncedAccounts, { data: settingRow }] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, account_id, category_id, amount, direction, merchant, raw_notification, source_device, transaction_date, status, accounts(name), categories(name)')
          .eq('household_id', profile.household_id)
          .gte('transaction_date', activeDateInfo.startISO)
          .lte('transaction_date', activeDateInfo.endISO)
          .order('transaction_date', { ascending: true }),
        syncAllHouseholdAccountBalances(supabase, profile.household_id),
        supabase
          .from('settings')
          .select('spreadsheet_url')
          .eq('household_id', profile.household_id)
          .maybeSingle(),
      ]);

      setAccounts(
        syncedAccounts
          .filter((a) => a.is_active)
          .map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            current_balance: a.current_balance,
          }))
      );
      setSpreadsheetUrl(settingRow?.spreadsheet_url || null);

      const rawList = (txList || []) as unknown as TransactionItem[];
      const reconciledOut = rawList.filter((t) => t.status === 'reconciled' && t.direction === 'out');
      const dedupedOut = await deduplicateSimultaneousExpenses(supabase, profile.household_id, reconciledOut as never[], null);
      const keepOutIds = new Set(dedupedOut.map((d) => d.id));

      setMonthTransactions(
        rawList.filter((t) => !(t.status === 'reconciled' && t.direction === 'out' && t.id && !keepOutIds.has(t.id)))
      );
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

  const totalBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.current_balance || 0), 0),
    [accounts]
  );

  const { dailyData, peakInsight, totalExpense, totalIncome, netDifference, dailyAverage, categoryChartData } =
    useMemo(() => {
      const expenseMap: Record<string, number> = {};
      const incomeMap: Record<string, number> = {};
      const txByDateMap: Record<string, PeakTransactionItem[]> = {};
      const catAgg = new Map<string, number>();
      TARGET_BUDGET_CATEGORIES.forEach((c) => catAgg.set(c.name, 0));

      let sumExpense = 0;
      let sumIncome = 0;

      monthTransactions.forEach((tx) => {
        if (tx.status !== 'reconciled') return;
        const catName = tx.categories?.name || '';
        if (isInternalTransferCategoryOrMerchant(catName, tx.merchant)) return;

        const d = new Date(tx.transaction_date);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const amt = Number(tx.amount || 0);

        if (tx.direction === 'out') {
          expenseMap[dateKey] = (expenseMap[dateKey] || 0) + amt;
          sumExpense += amt;
          const matchedCat = matchTargetCategory(catName || tx.merchant || '');
          catAgg.set(matchedCat.name, (catAgg.get(matchedCat.name) || 0) + amt);

          if (!txByDateMap[dateKey]) txByDateMap[dateKey] = [];
          txByDateMap[dateKey].push({
            id: tx.id,
            merchant: tx.merchant || 'Pengeluaran',
            amount: amt,
            categoryName: matchedCat.name,
            direction: 'out',
          });
        } else {
          incomeMap[dateKey] = (incomeMap[dateKey] || 0) + amt;
          sumIncome += amt;
        }
      });

      let maxExpense = 0;
      let peakDateKey: string | null = null;
      Object.entries(expenseMap).forEach(([dKey, exp]) => {
        if (exp > maxExpense) {
          maxExpense = exp;
          peakDateKey = dKey;
        }
      });

      const days: DayUsageItem[] = [];
      for (let day = 1; day <= activeDateInfo.totalDays; day++) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(activeDateInfo.month + 1).padStart(2, '0');
        const fullDateStr = `${activeDateInfo.year}-${monthStr}-${dayStr}`;
        const exp = expenseMap[fullDateStr] || 0;
        const inc = incomeMap[fullDateStr] || 0;

        days.push({
          dayNumber: day,
          dateStr: fullDateStr,
          dayLabel: dayStr,
          expenseAmount: exp,
          incomeAmount: inc,
          isPeak: fullDateStr === peakDateKey && exp > 0,
        });
      }

      const avg = activeDateInfo.totalDays > 0 ? Math.round(sumExpense / activeDateInfo.totalDays) : 0;
      const pctAbove = avg > 0 && maxExpense > avg ? Math.round(((maxExpense - avg) / avg) * 100) : 0;
      const formattedPeakDate = peakDateKey
        ? new Date(`${peakDateKey}T00:00:00`).toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : '-';

      const insight: PeakDayInsight = {
        dateStr: peakDateKey,
        formattedDate: formattedPeakDate,
        totalExpense: maxExpense,
        dailyAverage: avg,
        percentageAboveAverage: pctAbove,
        transactions: peakDateKey ? txByDateMap[peakDateKey] || [] : [],
      };

      const categoryChartData: CategoryExpenseItem[] = TARGET_BUDGET_CATEGORIES.map((c) => {
        const amt = catAgg.get(c.name) || 0;
        return {
          category_id: c.id,
          category_name: c.name,
          category_icon: c.emoji,
          total_amount: amt,
          percentage: sumExpense > 0 ? Math.round((amt / sumExpense) * 100) : 0,
        };
      }).filter((c) => c.total_amount > 0);

      return {
        dailyData: days,
        peakInsight: insight,
        totalExpense: sumExpense,
        totalIncome: sumIncome,
        netDifference: sumIncome - sumExpense,
        dailyAverage: avg,
        categoryChartData,
      };
    }, [monthTransactions, activeDateInfo]);

  const handleExportCsv = () => {
    const exportRows: ExportableTransaction[] = monthTransactions.map((tx) => ({
      id: tx.id,
      transaction_date: tx.transaction_date,
      direction: tx.direction,
      merchant: tx.merchant,
      amount: tx.amount,
      status: tx.status,
      source_device: 'suami',
      account_name: tx.accounts?.name || '-',
      category_name: tx.categories?.name || 'Lainnya',
    }));
    exportTransactionsToCsv(exportRows, activeDateInfo.monthName.replace(/\s+/g, '_'));
  };

  const handleManualSheetSync = async () => {
    setSyncingSheet(true);
    try {
      await fetch('/api/spreadsheet/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } finally {
      setSyncingSheet(false);
    }
  };

  return (
    <AppShell displayName={displayName}>
      <div className="space-y-6">
        {/* Header Kontrol Periode, Spreadsheet & CSV */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-main)]">
              Rekap &amp; Analisis Keuangan Keluarga
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Penjabaran grafik arus kas, perputaran keuangan &amp; 9 pos pengeluaran
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 min-w-[120px] text-center">{activeDateInfo.monthName}</span>
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m + 1)}
                className="p-1.5 rounded-lg hover:bg-[var(--surface-2)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Google Sheets</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleManualSheetSync}
              disabled={syncingSheet}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingSheet ? 'animate-spin' : ''}`} />
              <span>Sync Sheet</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent-color)] text-white dark:text-[#121218] text-xs font-bold"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* Saldo Kas Ringkas & Info Kontrol Telegram */}
        <section className="rounded-3xl p-4 sm:p-5 bg-[var(--surface-1)] border border-[var(--border-color)] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold text-[var(--text-muted)] block">
                Total Saldo Kas Aktif (Akun Tunggal Suami)
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] angka-keuangan">
                {formatMaskedRupiah(totalBalance, isHideBalance)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {accounts.map((acc) => (
                <span
                  key={acc.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs"
                >
                  {acc.type === 'bank' ? (
                    <Building2 className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  )}
                  <span className="text-[var(--text-muted)]">{acc.name}:</span>
                  <strong className="angka-keuangan text-[var(--text-main)]">
                    {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                  </strong>
                </span>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-700 dark:text-sky-300 flex items-center gap-2">
            <Bot className="w-4 h-4 shrink-0" />
            <span>
              Tampilan visual grafik saja. Transaksi, verifikasi, scan nota, dan seluruh pengaturan dilakukan via Telegram Bot (<code>/pengaturan</code>).
            </span>
          </div>
        </section>

        {/* 4 Kartu Ringkasan */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Pemasukan</span>
              <ArrowDownLeft className="w-4 h-4 text-[var(--color-income)]" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-[var(--color-income)] angka-keuangan mt-1">
              {formatMaskedRupiah(totalIncome, isHideBalance)}
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Pengeluaran Riil</span>
              <ArrowUpRight className="w-4 h-4 text-[var(--color-expense)]" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-[var(--color-expense)] angka-keuangan mt-1">
              {formatMaskedRupiah(totalExpense, isHideBalance)}
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Selisih Arus Kas</span>
              <Wallet className="w-4 h-4 text-[var(--accent-color)]" />
            </div>
            <p
              className={`text-base sm:text-lg font-extrabold angka-keuangan mt-1 ${
                netDifference >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
              }`}
            >
              {netDifference >= 0 ? '+' : ''}
              {formatMaskedRupiah(netDifference, isHideBalance)}
            </p>
          </div>

          <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Rata-rata Harian</span>
              <TrendingDown className="w-4 h-4 text-[var(--text-muted)]" />
            </div>
            <p className="text-base sm:text-lg font-extrabold text-[var(--text-main)] angka-keuangan mt-1">
              {formatMaskedRupiah(dailyAverage, isHideBalance)}
            </p>
          </div>
        </div>

        {/* Grafik Perputaran Keuangan */}
        <CashflowRotationSection
          transactions={monthTransactions}
          totalBalance={totalBalance}
          periodLabel={activeDateInfo.monthName}
        />

        {/* Grafik Pengeluaran Harian & 9 Kategori */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <MonthlyPeakSpendingChart
              data={dailyData}
              peakInsight={peakInsight}
              monthName={activeDateInfo.monthName}
              totalExpense={totalExpense}
              totalIncome={totalIncome}
              netDifference={netDifference}
              dailyAverage={dailyAverage}
              categoryBreakdown={categoryChartData}
              transactionCount={monthTransactions.length}
            />
          </div>
          <div>
            <CategoryExpensesChart categories={categoryChartData} />
          </div>
        </div>
        {loading && (
          <p className="text-[11px] text-[var(--text-muted)] text-center">Memuat data analitik...</p>
        )}
      </div>
    </AppShell>
  );
}
