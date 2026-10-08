'use client';

// ==============================================================================
// BUDGET PAGE: src/app/budget/page.tsx
// Halaman Atur Budget & Sisa Budget Murni (Tanpa Data Dummy)
// ==============================================================================

import { useState, useMemo, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import RemainingBudgetDonut from '@/components/budget/RemainingBudgetDonut';
import CategoryBudgetCard, { CategoryBudgetItem } from '@/components/budget/CategoryBudgetCard';
import CurvedDonutBreakdown, { BudgetSegment } from '@/components/budget/CurvedDonutBreakdown';
import SetBudgetModal from '@/components/budget/SetBudgetModal';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Plus, Sliders, PieChart, RefreshCw, FolderOpen } from 'lucide-react';

const defaultCategoryList = [
  { id: 'b1', name: 'Belanja Dapur', emoji: '🛒' },
  { id: 'b2', name: 'Makan & Jajan', emoji: '🍔' },
  { id: 'b3', name: 'Transportasi & Bensin', emoji: '🚗' },
  { id: 'b4', name: 'Tagihan & Utilitas', emoji: '⚡' },
  { id: 'b5', name: 'Kebutuhan Anak', emoji: '👶' },
  { id: 'b6', name: 'Kesehatan & Obat', emoji: '💊' },
  { id: 'b7', name: 'Liburan & Hiburan', emoji: '🏖️' },
  { id: 'b8', name: 'Belanja Online', emoji: '📦' },
  { id: 'b9', name: 'Lain-lain', emoji: '📝' },
];

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<CategoryBudgetItem[]>([]);
  const [activeTab, setActiveTab] = useState<'cards' | 'donut'>('cards');
  const [selectedForEdit, setSelectedForEdit] = useState<CategoryBudgetItem | null>(null);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Ambil data kategori & pengeluaran riil bulan berjalan dari database
  const fetchBudgetData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      // Inisialisasi awal bersih 0
      setBudgets(
        defaultCategoryList.map((cat) => ({
          id: cat.id,
          name: cat.name,
          emoji: cat.emoji,
          budgetLimit: 0,
          spentAmount: 0,
          periodName: 'Bulan Ini',
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

      // Hitung tanggal awal dan akhir bulan berjalan
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

      // Ambil transaksi pengeluaran bulan ini yang sudah direkonsiliasi
      const { data: txList } = await supabase
        .from('transactions')
        .select('category_id, amount, direction, status')
        .eq('household_id', profile.household_id)
        .eq('direction', 'out')
        .eq('status', 'reconciled')
        .gte('transaction_date', startOfMonth)
        .lte('transaction_date', endOfMonth);

      // Agregasi pengeluaran per category_id
      const spentMap: Record<string, number> = {};
      if (txList) {
        txList.forEach((tx) => {
          if (tx.category_id) {
            spentMap[tx.category_id] = (spentMap[tx.category_id] || 0) + Number(tx.amount || 0);
          }
        });
      }

      // Ambil kategori dari database
      const { data: catList } = await supabase
        .from('categories')
        .select('id, name, icon')
        .eq('household_id', profile.household_id)
        .eq('type', 'expense')
        .order('sort_order', { ascending: true });

      // Load saved limits from localStorage
      let savedLimits: Record<string, number> = {};
      try {
        const stored = localStorage.getItem(`budget_limits_${profile.household_id}`);
        if (stored) savedLimits = JSON.parse(stored);
      } catch (e) {
        console.warn('Gagal membaca budget limits:', e);
      }

      const activeCategories = (catList && catList.length > 0) ? catList : defaultCategoryList;

      const items: CategoryBudgetItem[] = activeCategories.map((c: any) => {
        const limit = savedLimits[c.id] || 0;
        const spent = spentMap[c.id] || 0;
        const iconEmoji = c.emoji || (c.icon === 'utensils' ? '🍔' : c.icon === 'shopping-cart' ? '🛒' : c.icon === 'zap' ? '⚡' : c.icon === 'fuel' ? '🚗' : c.icon === 'baby' ? '👶' : '📁');

        return {
          id: c.id,
          name: c.name,
          emoji: iconEmoji,
          budgetLimit: limit,
          spentAmount: spent,
          periodName: now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
        };
      });

      setBudgets(items);

      // Hitung pending count untuk navbar
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

  // Perhitungan total anggaran & terpakai
  const totalBudget = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.budgetLimit, 0);
  }, [budgets]);

  const totalSpent = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.spentAmount, 0);
  }, [budgets]);

  // Transformasi untuk Curved Donut Breakdown
  const donutSegments: BudgetSegment[] = useMemo(() => {
    const palette = ['#581c87', '#7e22ce', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'];
    // Filter kategori yang memiliki pengeluaran > 0 atau limit > 0
    const activeOnes = budgets.filter((b) => b.spentAmount > 0 || b.budgetLimit > 0);
    const source = activeOnes.length > 0 ? activeOnes : budgets;

    return source.map((b, idx) => ({
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
        localStorage.setItem('budget_limits_current', JSON.stringify(limitsMap));
      } catch (e) {
        console.warn('Gagal menyimpan budget limit:', e);
      }
      return updated;
    });
  };

  // Periode bulan ini
  const currentMonthPeriod = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `1 ${now.toLocaleString('id-ID', { month: 'short' })} - ${end.getDate()} ${now.toLocaleString('id-ID', { month: 'short', year: 'numeric' })}`;
  }, []);

  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* Top Navbar */}
      <Navbar
        userRole={userRole}
        displayName={displayName}
        pendingCount={pendingCount}
      />

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-4 space-y-4">
        {/* Header Title & Segment Switcher */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Atur Budget
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alokasi dan pengawasan batas pengeluaran keluarga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchBudgetData}
              title="Muat ulang budget"
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Segmented Switcher */}
            <div className="p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-white/10 flex items-center gap-1 shadow-inner">
              <button
                onClick={() => setActiveTab('cards')}
                className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'cards'
                    ? 'bg-white dark:bg-white/10 text-sky-700 dark:text-sky-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Daftar</span>
              </button>
              <button
                onClick={() => setActiveTab('donut')}
                className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'donut'
                    ? 'bg-white dark:bg-white/10 text-purple-700 dark:text-purple-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <PieChart className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Donut</span>
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
          /* 3. Daftar "Budget Kamu" Card Per Kategori */
          <div className="space-y-3">
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>Budget Kamu</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  {budgets.length} Kategori
                </span>
              </h2>

              {budgets.length > 0 && (
                <button
                  onClick={() => setSelectedForEdit(budgets[0])}
                  className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Atur Limit Budget</span>
                </button>
              )}
            </div>

            {budgets.length === 0 ? (
              <div className="text-center py-12 px-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 my-4 shadow-xs">
                <FolderOpen className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Belum Ada Kategori Budget
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  Kategori pengeluaran akan otomatis dimuat dari database keluarga Anda.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {budgets.map((item) => (
                  <CategoryBudgetCard
                    key={item.id}
                    item={item}
                    onEdit={(b) => setSelectedForEdit(b)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Edit Alokasi Budget */}
      <SetBudgetModal
        isOpen={selectedForEdit !== null}
        onClose={() => setSelectedForEdit(null)}
        item={selectedForEdit}
        onSave={handleSaveBudget}
      />
    </div>
  );
}
