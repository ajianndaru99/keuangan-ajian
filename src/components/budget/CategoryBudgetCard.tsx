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
  // Variasi warna progress bar berdasarkan tingkat pemakaian
  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-rose-500';
    if (percentage >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getBadgeColor = () => {
    if (percentage >= 90) return 'text-rose-800 bg-rose-100 border-rose-200';
    if (percentage >= 70) return 'text-amber-800 bg-amber-100 border-amber-200';
    return 'text-emerald-800 bg-emerald-100 border-emerald-200';
  };

  // Tema warna pastel cerah & teks tajam berdasarkan kategori
  const getCategoryTheme = () => {
    const n = item.name.toLowerCase();
    if (n.includes('dapur')) {
      return {
        card: 'bg-emerald-50/90 border-emerald-200/90 text-emerald-950',
        avatarBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        title: 'text-emerald-950',
        sub: 'text-emerald-700/80',
        statLabel: 'text-emerald-700/80',
        statVal: 'text-emerald-950',
      };
    }
    if (n.includes('makan') || n.includes('jajan')) {
      return {
        card: 'bg-rose-50/90 border-rose-200/90 text-rose-950',
        avatarBg: 'bg-rose-100 text-rose-800 border-rose-200',
        title: 'text-rose-950',
        sub: 'text-rose-700/80',
        statLabel: 'text-rose-700/80',
        statVal: 'text-rose-950',
      };
    }
    if (n.includes('transportasi') || n.includes('bensin')) {
      return {
        card: 'bg-amber-50/90 border-amber-200/90 text-amber-950',
        avatarBg: 'bg-amber-100 text-amber-800 border-amber-200',
        title: 'text-amber-950',
        sub: 'text-amber-700/80',
        statLabel: 'text-amber-700/80',
        statVal: 'text-amber-950',
      };
    }
    if (n.includes('tagihan') || n.includes('utilitas')) {
      return {
        card: 'bg-sky-50/90 border-sky-200/90 text-sky-950',
        avatarBg: 'bg-sky-100 text-sky-800 border-sky-200',
        title: 'text-sky-950',
        sub: 'text-sky-700/80',
        statLabel: 'text-sky-700/80',
        statVal: 'text-sky-950',
      };
    }
    if (n.includes('rumah')) {
      return {
        card: 'bg-purple-50/90 border-purple-200/90 text-purple-950',
        avatarBg: 'bg-purple-100 text-purple-800 border-purple-200',
        title: 'text-purple-950',
        sub: 'text-purple-700/80',
        statLabel: 'text-purple-700/80',
        statVal: 'text-purple-950',
      };
    }
    if (n.includes('jalan')) {
      return {
        card: 'bg-indigo-50/90 border-indigo-200/90 text-indigo-950',
        avatarBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        title: 'text-indigo-950',
        sub: 'text-indigo-700/80',
        statLabel: 'text-indigo-700/80',
        statVal: 'text-indigo-950',
      };
    }
    if (n.includes('mendadak')) {
      return {
        card: 'bg-pink-50/90 border-pink-200/90 text-pink-950',
        avatarBg: 'bg-pink-100 text-pink-800 border-pink-200',
        title: 'text-pink-950',
        sub: 'text-pink-700/80',
        statLabel: 'text-pink-700/80',
        statVal: 'text-pink-950',
      };
    }
    return {
      card: 'bg-slate-50/90 border-slate-200/90 text-slate-900',
      avatarBg: 'bg-slate-200 text-slate-800 border-slate-300',
      title: 'text-slate-900',
      sub: 'text-slate-600',
      statLabel: 'text-slate-600',
      statVal: 'text-slate-900',
    };
  };

  const theme = getCategoryTheme();

  return (
    <div className={`rounded-3xl p-5 border shadow-xs transition-all hover:scale-[1.01] ${theme.card}`}>
      {/* Header: Emoji Avatar + Title + Menu Action */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xs border ${theme.avatarBg}`}>
            <span>{item.emoji || '📁'}</span>
          </div>
          <div>
            <h3 className={`text-sm font-bold leading-tight ${theme.title}`}>
              {item.name}
            </h3>
            <p className={`text-[11px] font-medium ${theme.sub}`}>
              {item.periodName || 'Bulan Ini'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${getBadgeColor()}`}>
            {percentage}%
          </span>
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              aria-label="Atur Anggaran"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Target & Baris Nominal */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className={`text-xs font-bold ${theme.statVal}`}>
          Target: {formatRupiah(item.budgetLimit)}
        </span>
        <span className={`text-[11px] font-semibold ${theme.sub}`}>
          {percentage >= 100 ? 'Melebihi Limit' : `${formatRupiah(remaining)} sisa`}
        </span>
      </div>

      {/* Horizontal Progress Bar */}
      <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden p-0.5 border border-slate-300/40 mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Split Stats: Sisa vs Terpakai */}
      <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-200/60 text-xs">
        <div>
          <span className={`text-[10px] block font-medium ${theme.statLabel}`}>Terpakai Bulan Ini</span>
          <p className={`font-extrabold mt-0.5 ${theme.statVal}`}>
            {formatRupiah(item.spentAmount)}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-[10px] block font-medium ${theme.statLabel}`}>Sisa Anggaran</span>
          <p className={`font-extrabold mt-0.5 ${theme.statVal}`}>
            {formatRupiah(remaining)}
          </p>
        </div>
      </div>
    </div>
  );
}
