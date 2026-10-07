'use client';

// ==============================================================================
// COMPONENT: src/components/budget/CategoryBudgetCard.tsx
// Kartu Anggaran Per Kategori mengadopsi referensi Foto 1 (Layar 2 & 3)
// ==============================================================================

import { formatRupiah } from '@/lib/utils';
import { MoreVertical } from 'lucide-react';

export interface CategoryBudgetItem {
  id: string;
  name: string;
  emoji: string;
  budgetLimit: number;
  spentAmount: number;
  periodName?: string;
}

interface CategoryBudgetCardProps {
  item: CategoryBudgetItem;
  onEdit?: (item: CategoryBudgetItem) => void;
}

export default function CategoryBudgetCard({
  item,
  onEdit,
}: CategoryBudgetCardProps) {
  const remaining = Math.max(0, item.budgetLimit - item.spentAmount);
  const percentage = item.budgetLimit > 0
    ? Math.min(100, Math.round((item.spentAmount / item.budgetLimit) * 100))
    : 0;

  // Variasi warna progress bar berdasarkan tingkat pemakaian
  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-rose-500 shadow-rose-400/40';
    if (percentage >= 70) return 'bg-amber-500 shadow-amber-400/40';
    return 'bg-emerald-500 shadow-emerald-400/40';
  };

  const getBadgeColor = () => {
    if (percentage >= 90) return 'text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50';
    if (percentage >= 70) return 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50';
    return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50';
  };

  return (
    <div className="rounded-3xl p-4 liquid-glass border border-white/90 dark:border-white/10 shadow-xs hover:shadow-md transition-all">
      {/* Header: Emoji Avatar + Title + Menu Action */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center text-xl shadow-xs border border-slate-200/60 dark:border-white/10">
            <span>{item.emoji || '📁'}</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
              {item.name}
            </h3>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {item.periodName || 'Bulan Ini'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mini Percentage Badge */}
          <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${getBadgeColor()}`}>
            {percentage}%
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              aria-label="Atur Anggaran"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Target & Baris Nominal */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          Target: {formatRupiah(item.budgetLimit)}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {percentage >= 100 ? 'Melebihi Limit' : `${formatRupiah(remaining)} sisa`}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden p-0.5 border border-slate-200/50 dark:border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out shadow-xs ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Split Stats: Sisa vs Terpakai */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 grid grid-cols-2 text-center divide-x divide-slate-100 dark:divide-white/5">
        <div className="pr-2">
          <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Sisa
          </span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {formatRupiah(remaining)}
          </span>
        </div>
        <div className="pl-2">
          <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Terpakai
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {formatRupiah(item.spentAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}
