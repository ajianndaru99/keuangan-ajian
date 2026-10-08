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
    if (percentage >= 90) return 'bg-[#DC3545]';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-[#198754]';
  };

  const getBadgeColor = () => {
    if (percentage >= 90) return 'text-[#DC3545] bg-[#fde8ea] border-[#DC3545]/30';
    if (percentage >= 70) return 'text-amber-800 bg-amber-100 border-amber-200';
    return 'text-[#198754] bg-[#e8f5e9] border-[#198754]/30';
  };

  return (
    <div className="rounded-3xl p-5 border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xs transition-all hover:scale-[1.01] text-[var(--text-main)]">
      {/* Header: Emoji Avatar + Title + Menu Action */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs border border-[var(--border-color)] bg-[var(--bg-main)] text-[#007a33]">
            <span>{item.emoji || '📁'}</span>
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight font-heading text-[var(--text-main)]">
              {item.name}
            </h3>
            <p className="text-[11px] font-medium text-[#007a33]">
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
              className="p-1.5 rounded-xl text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Target & Baris Nominal */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-[#007a33]">
          Target: <strong className="angka-keuangan text-[var(--text-main)]">{formatRupiah(item.budgetLimit)}</strong>
        </span>
        <span className={`text-[11px] font-semibold ${percentage >= 100 ? 'text-[#DC3545]' : 'text-[#007a33]'}`}>
          {percentage >= 100 ? 'Melebihi Limit' : `${formatRupiah(remaining)} sisa`}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="w-full h-2 rounded-full bg-[var(--bg-main)] overflow-hidden p-0.5 border border-[#E2E8F0] mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Split Stats: Sisa vs Terpakai */}
      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-[#E2E8F0] text-xs">
        <div>
          <span className="text-[10px] block font-medium text-[#007a33]">Terpakai Bulan Ini</span>
          <p className="font-extrabold mt-0.5 text-[#DC3545] angka-keuangan">
            {formatRupiah(item.spentAmount)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] block font-medium text-[#007a33]">Sisa Anggaran</span>
          <p className={`font-extrabold mt-0.5 angka-keuangan ${remaining > 0 ? 'text-[#198754]' : 'text-[#DC3545]'}`}>
            {formatRupiah(remaining)}
          </p>
        </div>
      </div>
    </div>
  );
}
