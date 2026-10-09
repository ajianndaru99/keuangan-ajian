'use client';

// ==============================================================================
// BUDGET PAGE: src/app/budget/page.tsx
// Halaman Atur Budget & Sisa Budget (Savings) - 8 Kategori Spesifik
// ==============================================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import RemainingBudgetDonut from '@/components/budget/RemainingBudgetDonut';
import CategoryBudgetCard, { CategoryBudgetItem } from '@/components/budget/CategoryBudgetCard';
import CurvedDonutBreakdown, { BudgetSegment } from '@/components/budget/CurvedDonutBreakdown';
import SetBudgetModal from '@/components/budget/SetBudgetModal';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Plus, Sliders, PieChart, RefreshCw } from 'lucide-react';

// 8 Kategori spesifik yang ditentukan pengguna
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
  const [activeTab, setActiveTab] = useState<'cards' | 'donut'>('cards');
  const [selectedForEdit, setSelectedForEdit] = useState<CategoryBudgetItem | null>(null);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Ambil data pengeluaran riil bulan berjalan dari database
  const fetchBudgetData = useCallback(async () => {
    const now = new Date();
    const periodMonthName = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

    // Load saved limits from localStorage
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

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

      // Ambil transaksi pengeluaran bulan ini yang sudah direkonsiliasi
      const { data: txList } = await supabase
        .from('transactions')
        .select(`
          category_id, amount, direction, status,
          categories (name)
        `)
        .eq('household_id', profile.household_id)
        .eq('direction', 'out')
        .eq('status', 'reconciled')
        .gte('transaction_date', startOfMonth)
        .lte('transaction_date', endOfMonth);

      // Hitung pengeluaran per kategori berdasarkan pencocokan nama
      const spentByNameMap: Record<string, number> = {};
      if (txList) {
        txList.forEach((tx: any) => {
          const catName = tx.categories?.name || '';
          if (catName) {
            // Cocokkan ke salah satu dari 8 kategori
            let matchedKey = 'Lainnya';
            for (const tc of targetCategories) {
              if (catName.toLowerCase().includes(tc.name.toLowerCase()) || tc.name.toLowerCase().includes(catName.toLowerCase())) {
                matchedKey = tc.name;
                break;
              }
            }
            spentByNameMap[matchedKey] = (spentByNameMap[matchedKey] || 0) + Number(tx.amount || 0);
          }
        });
      }

      const items: CategoryBudgetItem[] = targetCategories.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        budgetLimit: savedLimits[c.id] || 0,
        spentAmount: spentByNameMap[c.name] || 0,
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
  }, [fetchBudgetData]);

  const totalBudget = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.budgetLimit, 0);
  }, [budgets]);

  const totalSpent = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.spentAmount, 0);
  }, [budgets]);

  const donutSegments: BudgetSegment[] = useMemo(() => {
    const palette = ['#10b981', '#f59e0b', '#0ea5e9', '#eab308', '#6366f1', '#a855f7', '#f43f5e', '#64748b'];
    return budgets.map((b, idx) => ({
      id: b.id,
      name: b.name,
      amount: b.spentAmount > 0 ? b.spentAmount : b.budgetLimit,
      color: palette[idx % palette.length],
      icon: b.emoji,
    }));
  }, [budgets]);

  const handleSaveBudget = (id: string, newLimit: number) => {
    setBudgets((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, budgetLimit: newLimit } : item));
      try {
        const limitsMap = updated.reduce((acc, item) => {
          acc[item.id] = item.budgetLimit;
          return acc;
        }, {} as Record<string, number>);
        localStorage.setItem('budget_limits_v2', JSON.stringify(limitsMap));
      } catch (e) {
        console.warn('Gagal menyimpan budget limit:', e);
      }
      return updated;
    });
  };

  const currentMonthPeriod = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `1 ${now.toLocaleString('id-ID', { month: 'short' })} - ${end.getDate()} ${now.toLocaleString('id-ID', { month: 'short', year: 'numeric' })}`;
  }, []);

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={pendingCount}
    >
      <div className="space-y-5">
        {/* Header Title & Segment Switcher */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              <span className="font-extrabold text-[var(--text-main)]">Batas</span>{' '}
              <span className="font-semibold italic text-[var(--text-accent-italic)]">Anggaran & Tabungan</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Pengawasan batas kuota pengeluaran untuk 8 kategori utama keluarga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchBudgetData}
              title="Muat ulang budget"
              className="p-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Segmented Switcher */}
            <div className="p-1 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] flex items-center gap-1 shadow-xs">
              <button
                onClick={() => setActiveTab('cards')}
                className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'cards'
                    ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Daftar Kartu</span>
              </button>
              <button
                onClick={() => setActiveTab('donut')}
                className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'donut'
                    ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Donut Breakdown</span>
              </button>
            </div>
          </div>
        </div>

        {/* 1. Sisa Budget Circular Donut Gauge */}
        <RemainingBudgetDonut
          totalBudget={totalBudget}
          spentAmount={totalSpent}
          periodText={currentMonthPeriod}
          daysRemaining={Math.max(1, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate())}
        />

        {/* 2. Donut Breakdown Kapsul Melengkung */}
        {activeTab === 'donut' ? (
          <CurvedDonutBreakdown
            totalBudget={totalBudget}
            segments={donutSegments}
            onViewAnalytics={() => setActiveTab('cards')}
          />
        ) : (
          /* 3. Daftar Kartu 8 Kategori Bersih */
          <div className="space-y-3">
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-1.5">
                <span>8 Kategori Anggaran Keluarga</span>
              </h2>

              <button
                onClick={() => setSelectedForEdit(budgets[0])}
                className="text-xs font-bold text-[#007a33] hover:text-[#004d00] flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Atur Limit Target</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {budgets.map((item) => (
                <CategoryBudgetCard
                  key={item.id}
                  item={item}
                  onEdit={(b) => setSelectedForEdit(b)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal Edit Alokasi Budget */}
      <SetBudgetModal
        isOpen={selectedForEdit !== null}
        onClose={() => setSelectedForEdit(null)}
        item={selectedForEdit}
        onSave={handleSaveBudget}
      />
    </AppShell>
  );
}
