'use client';

// ==============================================================================
// BUDGET PAGE: src/app/budget/page.tsx
// Monitor Pagu Anggaran 9 Kategori Keluarga (Read-Only, Kontrol via Telegram)
// ==============================================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import RemainingBudgetDonut from '@/components/budget/RemainingBudgetDonut';
import CategoryBudgetCard, { CategoryBudgetItem } from '@/components/budget/CategoryBudgetCard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getMonthlyRange, getBudgetPeriodKey } from '@/lib/date-utils';
import {
  TARGET_BUDGET_CATEGORIES,
  matchTargetCategory,
  isInternalTransferCategoryOrMerchant,
} from '@/lib/budget/budget-guard';
import { deduplicateSimultaneousExpenses } from '@/lib/telegram/commands';
import { RefreshCw, Bot } from 'lucide-react';

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<CategoryBudgetItem[]>([]);
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [paydayDate, setPaydayDate] = useState<number>(1);
  const [cycleLabel, setCycleLabel] = useState<string>('');

  const fetchBudgetData = useCallback(async () => {
    const now = new Date();
    const periodMonthName = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

    if (!isSupabaseConfigured()) {
      setBudgets(
        TARGET_BUDGET_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          budgetLimit: 0,
          spentAmount: 0,
          periodName: periodMonthName,
        }))
      );
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

      if (!profile) return;
      setDisplayName(profile.display_name || 'Kepala Keluarga (Suami)');

      const { data: settingData } = await supabase
        .from('settings')
        .select('month_start_day')
        .eq('household_id', profile.household_id)
        .maybeSingle();

      const monthStartDay = settingData?.month_start_day || 1;
      setPaydayDate(monthStartDay);

      const dateRange = getMonthlyRange(0, monthStartDay);
      setCycleLabel(dateRange.label);
      const periodMonthKey = getBudgetPeriodKey(dateRange.startDate, monthStartDay);

      const [{ data: txList }, { data: dbBudgets }, { count: pendCount }] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, amount, merchant, category_id, account_id, source_device, transaction_date, categories(name), accounts(name)')
          .eq('household_id', profile.household_id)
          .eq('direction', 'out')
          .eq('status', 'reconciled')
          .gte('transaction_date', dateRange.startDate.toISOString())
          .lte('transaction_date', dateRange.endDate.toISOString()),
        supabase
          .from('category_budgets')
          .select('category_id, limit_amount')
          .eq('household_id', profile.household_id)
          .eq('period_month', periodMonthKey),
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', profile.household_id)
          .eq('status', 'pending'),
      ]);

      setPendingCount(pendCount || 0);

      const budgetLimitMap: Record<string, number> = {};
      (dbBudgets || []).forEach((b: { category_id: string; limit_amount: number }) => {
        budgetLimitMap[b.category_id] = Number(b.limit_amount || 0);
      });

      const filteredTxs = (txList || []).filter((t: Record<string, unknown>) => {
        const cats = t.categories as { name?: string } | Array<{ name?: string }> | null;
        const catName = Array.isArray(cats) ? cats[0]?.name : cats?.name;
        return !isInternalTransferCategoryOrMerchant(catName, String(t.merchant || ''));
      });

      const validTxs = await deduplicateSimultaneousExpenses(
        supabase,
        profile.household_id,
        filteredTxs as never[],
        null
      );

      const spentMap: Record<string, number> = {};
      for (const tx of validTxs) {
        const catName = tx.categories?.name || tx.merchant || '';
        if (isInternalTransferCategoryOrMerchant(catName, tx.merchant)) continue;
        const matched = matchTargetCategory(catName);
        spentMap[matched.id] = (spentMap[matched.id] || 0) + Number(tx.amount || 0);
      }

      setBudgets(
        TARGET_BUDGET_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          budgetLimit: budgetLimitMap[c.id] || 0,
          spentAmount: spentMap[c.id] || 0,
          periodName: dateRange.label,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  const totals = useMemo(() => {
    const limit = budgets.reduce((s, b) => s + b.budgetLimit, 0);
    const spent = budgets.reduce((s, b) => s + b.spentAmount, 0);
    return { limit, spent };
  }, [budgets]);

  return (
    <AppShell userRole="suami" displayName={displayName} pendingCount={pendingCount}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-main)]">
              Anggaran Belanja (9 Pos)
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Siklus Gajian Tanggal {paydayDate} ({cycleLabel || 'Bulan Ini'})
            </p>
          </div>
          <button
            type="button"
            onClick={fetchBudgetData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-2)] self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
          <Bot className="w-4 h-4 shrink-0" />
          <span>
            Mode tampilan saja. Atur batas pagu tiap kategori lewat Telegram: ketik <code>/pengaturan</code> &rarr; <strong>Anggaran</strong> atau <code>set anggaran jajan 300rb</code>.
          </span>
        </div>

        <RemainingBudgetDonut
          totalBudget={totals.limit}
          spentAmount={totals.spent}
          periodText={cycleLabel || 'Siklus Aktif'}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((item) => (
            <CategoryBudgetCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
