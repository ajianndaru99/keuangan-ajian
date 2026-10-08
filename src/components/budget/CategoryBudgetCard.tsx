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
    if (percentage >= 90) return 'bg-rose-500 shadow-rose-400/40';
    if (percentage >= 70) return 'bg-amber-500 shadow-amber-400/40';
    return 'bg-emerald-500 shadow-emerald-400/40';
  };

  const getBadgeColor = () => {
    if (percentage >= 90) return 'text-rose-300 bg-rose-950/60 border-rose-800/80';
    if (percentage >= 70) return 'text-amber-300 bg-amber-950/60 border-amber-800/80';
    return 'text-emerald-300 bg-emerald-950/60 border-emerald-800/80';
  };

  // Tema warna pastel berdasarkan nama kategori
  const getCategoryPastelClass = () => {
    const n = item.name.toLowerCase();
    if (n.includes('dapur')) return 'bg-emerald-950/25 border-emerald-500/25';
    if (n.includes('makan') || n.includes('jajan')) return 'bg-amber-950/25 border-amber-500/25';
    if (n.includes('transportasi') || n.includes('bensin')) return 'bg-sky-950/25 border-sky-500/25';
    if (n.includes('tagihan') || n.includes('utilitas')) return 'bg-yellow-950/25 border-yellow-500/25';
    if (n.includes('rumah')) return 'bg-indigo-950/25 border-indigo-500/25';
    if (n.includes('jalan')) return 'bg-purple-950/25 border-purple-500/25';
    if (n.includes('mendadak')) return 'bg-rose-950/25 border-rose-500/25';
    return 'bg-slate-900/60 border-slate-700/50';
  };

  return (
    <div className={`rounded-3xl p-5 border shadow-sm backdrop-blur-xs transition-all hover:scale-[1.01] ${getCategoryPastelClass()}`}>
      {/* Header: Emoji Avatar + Title + Menu Action */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center text-xl shadow-xs border border-white/10">
            <span>{item.emoji || '📁'}</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">
              {item.name}
            </h3>
            <p className="text-[11px] font-medium text-slate-400">
              {item.periodName || 'Bulan Ini'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${getBadgeColor()}`}>
            {percentage}%
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              aria-label="Atur Anggaran"
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Target & Baris Nominal */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-bold text-slate-300">
          Target: {formatRupiah(item.budgetLimit)}
        </span>
        <span className="text-[11px] font-semibold text-slate-400">
          {percentage >= 100 ? 'Melebihi Limit' : `${formatRupiah(remaining)} sisa`}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="w-full h-2 rounded-full bg-slate-950/60 overflow-hidden p-0.5 border border-white/5 mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Split Stats: Sisa vs Terpakai */}
      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-white/10 text-xs">
        <div>
          <span className="text-[10px] text-slate-400 block">Terpakai Bulan Ini</span>
          <p className="font-bold text-white mt-0.5">
            {formatRupiah(item.spentAmount)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 block">Sisa Anggaran</span>
          <p className={`font-bold mt-0.5 ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatRupiah(remaining)}
          </p>
        </div>
      </div>
    </div>
  );
}
