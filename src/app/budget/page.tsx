'use client';

// ==============================================================================
// BUDGET PAGE: src/app/budget/page.tsx
// Desktop Budget & Savings Monitor (Mode Monitor & Laptop)
// Seluruh konfigurasi pagu anggaran dikelola via Telegram (/pengaturan)
// ==============================================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import RemainingBudgetDonut from '@/components/budget/RemainingBudgetDonut';
import CategoryBudgetCard, { CategoryBudgetItem } from '@/components/budget/CategoryBudgetCard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { getMonthlyRange, getBudgetPeriodKey } from '@/lib/date-utils';
import { matchTargetCategory } from '@/lib/budget/budget-guard';
import { deduplicateSimultaneousExpenses } from '@/lib/telegram/commands';
import { RefreshCw, Bot, CheckCircle2 } from 'lucide-react';

const targetCategories = [
  { id: 'b-dapur', name: 'Belanja Dapur', emoji: '🛒' },
  { id: 'b-makan', name: 'Makan & Jajan', emoji: '🍔' },
  { id: 'b-trans', name: 'Transportasi/Bensin', emoji: '🚗' },
  { id: 'b-tagih', name: 'Tagihan & Utilitas', emoji: '⚡' },
  { id: 'b-rumah', name: 'Kebutuhan Rumah', emoji: '🏠' },
  { id: 'b-jalan', name: 'Jalan-jalan', emoji: '🏖️' },
  { id: 'b-darurat', name: 'Keperluan Mendadak', emoji: '🚨' },
  { id: 'b-lain', name: 'Lainnya', emoji: '📝' },
];

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<CategoryBudgetItem[]>([]);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [paydayDate, setPaydayDate] = useState<number>(1);
  const [cycleLabel, setCycleLabel] = useState<string>('');

  const fetchBudgetData = useCallback(async () => {
    const now = new Date();
    const periodMonthName = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

    let savedLimits: Record<string, number> = {};
    try {
      const stored = localStorage.getItem('budget_limits_v2');
      if (stored) savedLimits = JSON.parse(stored);
    } catch (e) {
      console.warn('Gagal membaca budget limits:', e);
    }

    if (!isSupabaseConfigured()) {
      setBudgets(
        targetCategories.map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          budgetLimit: savedLimits[c.id] || 0,
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
        .select('role, display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) return;

      setUserRole(profile.role);
      setDisplayName(profile.display_name);

      const { data: settingData } = await supabase
        .from('settings')
        .select('month_start_day')
        .eq('household_id', profile.household_id)
        .maybeSingle();

      const monthStartDay = settingData?.month_start_day || 1;
      setPaydayDate(monthStartDay);

      const dateRange = getMonthlyRange(0, monthStartDay);
      setCycleLabel(dateRange.label);

      const startOfCycle = dateRange.startDate.toISOString();
      const endOfCycle = dateRange.endDate.toISOString();

      const { data: txList } = await supabase
        .from('transactions')
        .select(`
          id, category_id, account_id, source_device, merchant, transaction_date, amount, direction, status,
          categories (name)
        `)
        .eq('household_id', profile.household_id)
        .eq('direction', 'out')
        .eq('status', 'reconciled')
        .not('merchant', 'ilike', 'Koreksi Saldo%')
        .not('merchant', 'ilike', 'Transfer Internal%')
        .gte('transaction_date', startOfCycle)
        .lte('transaction_date', endOfCycle);

      const periodMonthKey = getBudgetPeriodKey(now, monthStartDay);
      const { data: dbBudgets } = await supabase
        .from('category_budgets')
        .select('category_id, limit_amount')
        .eq('household_id', profile.household_id)
        .eq('period_month', periodMonthKey);

      if (dbBudgets && dbBudgets.length > 0) {
        dbBudgets.forEach((b: { category_id: string; limit_amount: number }) => {
          savedLimits[b.category_id] = Number(b.limit_amount);
        });
      }

      const spentByIdMap: Record<string, number> = {};
      if (txList) {
        const dedupedTxs = await deduplicateSimultaneousExpenses(
          supabase,
          profile.household_id,
          txList as any[],
          null
        );
        dedupedTxs.forEach((tx: any) => {
          const catName = tx.categories?.name || tx.category_id || '';
          const matchedTarget = matchTargetCategory(catName);
          spentByIdMap[matchedTarget.id] = (spentByIdMap[matchedTarget.id] || 0) + Number(tx.amount || 0);
        });
      }

      const items: CategoryBudgetItem[] = targetCategories.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        budgetLimit: savedLimits[c.id] || 0,
        spentAmount: spentByIdMap[c.id] || 0,
        periodName: periodMonthName,
      }));

      setBudgets(items);

      const { count: pendingTotal } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', profile.household_id)
        .eq('status', 'pending');

      setPendingCount(pendingTotal || 0);
    } catch (err) {
      console.warn('Gagal memuat budget:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBudgetData();

    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const channel = supabase
      .channel('realtime:budget_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'category_budgets' }, () => {
        fetchBudgetData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchBudgetData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
        fetchBudgetData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBudgetData]);

  const totalBudget = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.budgetLimit, 0);
  }, [budgets]);

  const totalSpent = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.spentAmount, 0);
  }, [budgets]);

  const daysRemaining = useMemo(() => {
    const now = new Date();
    const range = getMonthlyRange(0, paydayDate);
    const diffMs = range.endDate.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [paydayDate]);

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={pendingCount}
    >
      <div className="space-y-6">
        {/* Header Title Widescreen */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] tracking-tight">
                Batas Anggaran & Tabungan
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Mode Monitor Laptop
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Pengawasan batas kuota pengeluaran untuk 8 kategori utama keluarga • Siklus: {cycleLabel || 'Bulan Berjalan'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchBudgetData}
              title="Muat ulang data anggaran"
              className="p-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Banner Pusat Kendali Telegram Hub */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-main)]">
                Pengaturan Pagu Anggaran Dipusatkan di Telegram
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                Setel pagu pos belanja kapan saja via bot Telegram tanpa form bertumpuk di web. Cukup ketik perintah atau buka menu pengaturan interaktif:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-main)]">
              Menu: <strong className="text-[var(--accent-color)]">/pengaturan</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-main)]">
              Pagu: <code className="text-[var(--accent-color)]">set anggaran dapur 1,5jt</code>
            </div>
          </div>
        </div>

        {/* Side-by-Side Grid Desktop (4 Kolom Donut + 8 Kolom Kartu Kategori) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Kolom Kiri (4 Kolom): Donut Gauge & Ringkasan */}
          <div className="lg:col-span-4 space-y-4 sticky top-20">
            <RemainingBudgetDonut
              totalBudget={totalBudget}
              spentAmount={totalSpent}
              periodText={cycleLabel || 'Bulan Finansial'}
              daysRemaining={daysRemaining}
            />

            <div className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs text-[var(--text-muted)] space-y-2 shadow-xs">
              <div className="flex items-center justify-between font-medium">
                <span>Tanggal Gajian:</span>
                <strong className="text-[var(--text-main)]">Tanggal {paydayDate}</strong>
              </div>
              <div className="flex items-center justify-between font-medium">
                <span>Total Pagu Diset:</span>
                <strong className="text-[var(--text-main)]">{budgets.filter((b) => b.budgetLimit > 0).length} / 8 Pos</strong>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)] leading-relaxed">
                Jika kuota pos mencapai 100%, sistem bot Telegram otomatis mengirim peringatan darurat.
              </p>
            </div>
          </div>

          {/* Kolom Kanan (8 Kolom): Grid 8 Pos Anggaran Widescreen */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--text-main)] tracking-tight">
                8 Pos Pengeluaran Keluarga
              </h2>
              <span className="text-xs text-[var(--text-muted)]">
                Terpakai vs Batas Pagu
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {budgets.map((item) => (
                <CategoryBudgetCard
                  key={item.id}
                  item={item}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
