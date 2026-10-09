'use client';

// ==============================================================================
// COMPONENT: src/components/budget/CategoryBudgetCard.tsx
// Kartu Anggaran Per Kategori: Desain Pastel Soft di atas Latar Gelap
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
    if (percentage >= 90) return 'bg-expense';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-income';
  };

  const getBadgeColor = () => {
    if (percentage >= 90) return 'text-expense bg-expense/15 border-expense/30';
    if (percentage >= 70) return 'text-amber-500 bg-amber-500/15 border-amber-500/30';
    return 'text-income bg-income/15 border-income/30';
  };

  return (
    <div className="rounded-3xl p-5 border border-[var(--border-color)] bg-[var(--surface-1)] shadow-xs transition-all hover:scale-[1.01] text-[var(--text-main)]">
      {/* Header: Emoji Avatar + Title + Menu Action */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs border border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--accent-color)]">
            <span>{item.emoji || '📁'}</span>
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight font-heading text-[var(--text-main)]">
              {item.name}
            </h3>
            <p className="text-[11px] font-medium text-[var(--text-muted)]">
              {item.periodName || 'Bulan Ini'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border angka-keuangan ${getBadgeColor()}`}>
            {percentage}%
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              aria-label="Atur Anggaran"
              className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Target & Baris Nominal */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-[var(--text-muted)]">
          Target: <strong className="angka-keuangan text-[var(--text-main)]">{formatRupiah(item.budgetLimit)}</strong>
        </span>
        <span className={`text-[11px] font-semibold ${percentage >= 100 ? 'text-expense' : 'text-[var(--text-muted)]'}`}>
          {percentage >= 100 ? 'Melebihi Limit' : `${formatRupiah(remaining)} sisa`}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="w-full h-2 rounded-full bg-[var(--surface-2)] overflow-hidden p-0.5 border border-[var(--border-color)] mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Split Stats: Sisa vs Terpakai */}
      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-[var(--border-color)] text-xs">
        <div>
          <span className="text-[10px] block font-medium text-[var(--text-muted)]">Terpakai Bulan Ini</span>
          <p className="font-extrabold mt-0.5 text-expense angka-keuangan">
            {formatRupiah(item.spentAmount)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] block font-medium text-[var(--text-muted)]">Sisa Anggaran</span>
          <p className={`font-extrabold mt-0.5 angka-keuangan ${remaining > 0 ? 'text-income' : 'text-expense'}`}>
            {formatRupiah(remaining)}
          </p>
        </div>
      </div>
    </div>
  );
}
