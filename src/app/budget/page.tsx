'use client';

// ==============================================================================
// BUDGET PAGE: src/app/budget/page.tsx
// Halaman Atur Budget & Sisa Budget mengadopsi referensi Foto 1 & Foto 3
// ==============================================================================

import { useState, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import RemainingBudgetDonut from '@/components/budget/RemainingBudgetDonut';
import CategoryBudgetCard, { CategoryBudgetItem } from '@/components/budget/CategoryBudgetCard';
import CurvedDonutBreakdown, { BudgetSegment } from '@/components/budget/CurvedDonutBreakdown';
import SetBudgetModal from '@/components/budget/SetBudgetModal';
import { Plus, Sliders, PieChart, Sparkles } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

// Data alokasi anggaran bawaan keluarga
const initialBudgets: CategoryBudgetItem[] = [
  {
    id: 'b1',
    name: 'Makan & Minum',
    emoji: '🍔',
    budgetLimit: 2500000,
    spentAmount: 1450000,
    periodName: 'September 2026',
  },
  {
    id: 'b2',
    name: 'Belanja Dapur',
    emoji: '🛒',
    budgetLimit: 3000000,
    spentAmount: 2100000,
    periodName: 'September 2026',
  },
  {
    id: 'b3',
    name: 'Transportasi & Bensin',
    emoji: '🚗',
    budgetLimit: 1200000,
    spentAmount: 650000,
    periodName: 'September 2026',
  },
  {
    id: 'b4',
    name: 'Tagihan & Utilitas',
    emoji: '⚡',
    budgetLimit: 1500000,
    spentAmount: 1350000,
    periodName: 'September 2026',
  },
  {
    id: 'b5',
    name: 'Kesehatan & Obat',
    emoji: '💊',
    budgetLimit: 800000,
    spentAmount: 250000,
    periodName: 'September 2026',
  },
  {
    id: 'b6',
    name: 'Liburan & Hiburan',
    emoji: '🏖️',
    budgetLimit: 1000000,
    spentAmount: 200000,
    periodName: 'September 2026',
  },
];

export default function BudgetPage() {
  const [budgets, setBudgets] = useState<CategoryBudgetItem[]>(initialBudgets);
  const [activeTab, setActiveTab] = useState<'cards' | 'donut'>('cards');
  const [selectedForEdit, setSelectedForEdit] = useState<CategoryBudgetItem | null>(null);

  // Perhitungan total anggaran & terpakai
  const totalBudget = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.budgetLimit, 0);
  }, [budgets]);

  const totalSpent = useMemo(() => {
    return budgets.reduce((acc, b) => acc + b.spentAmount, 0);
  }, [budgets]);

  // Transformasi untuk Curved Donut Breakdown (Foto 3)
  const donutSegments: BudgetSegment[] = useMemo(() => {
    const palette = ['#581c87', '#7e22ce', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'];
    return budgets.map((b, idx) => ({
      id: b.id,
      name: b.name,
      amount: b.spentAmount,
      color: palette[idx % palette.length],
      icon: b.emoji,
    }));
  }, [budgets]);

  const handleSaveBudget = (id: string, newLimit: number) => {
    setBudgets((prev) =>
      prev.map((item) => (item.id === id ? { ...item, budgetLimit: newLimit } : item))
    );
  };

  return (
    <div className="flex flex-col min-h-screen pb-24">
      {/* Top Navbar */}
      <Navbar userRole="suami" pendingCount={2} />

      <main className="flex-1 px-4 py-4 space-y-4">
        {/* Header Title & Segment Switcher (Foto 1) */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Atur Budget
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Alokasi dan pengawasan batas pengeluaran keluarga
            </p>
          </div>

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

        {/* 1. Sisa Budget Circular Donut Gauge (Foto 1 Layar 2 & 3) */}
        <RemainingBudgetDonut
          totalBudget={totalBudget}
          spentAmount={totalSpent}
          periodText="1 Sep - 30 Sep 2026"
          daysRemaining={2}
        />

        {/* 2. Donut Breakdown Kapsul Melengkung (Foto 3) */}
        {activeTab === 'donut' ? (
          <CurvedDonutBreakdown
            totalBudget={totalBudget}
            segments={donutSegments}
            onViewAnalytics={() => setActiveTab('cards')}
          />
        ) : (
          /* 3. Daftar "Budget Kamu" Card Per Kategori (Foto 1 Layar 2 & 3) */
          <div className="space-y-3">
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>Budget Kamu</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                  {budgets.length} Kategori
                </span>
              </h2>

              <button
                onClick={() => setSelectedForEdit(budgets[0])}
                className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+Tambah Budget</span>
              </button>
            </div>

            <div className="space-y-3">
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
