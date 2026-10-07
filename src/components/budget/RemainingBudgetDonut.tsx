'use client';

// ==============================================================================
// COMPONENT: src/components/budget/RemainingBudgetDonut.tsx
// Widget Donut Ring Sisa Budget mengadopsi referensi Foto 1 (Layar 2 & 3)
// ==============================================================================

import { formatRupiah } from '@/lib/utils';
import { Calendar, Clock } from 'lucide-react';

interface RemainingBudgetDonutProps {
  totalBudget: number;
  spentAmount: number;
  periodText?: string;
  daysRemaining?: number;
}

export default function RemainingBudgetDonut({
  totalBudget = 5000000,
  spentAmount = 2200000,
  periodText = '1 Sep - 30 Sep 2026',
  daysRemaining = 18,
}: RemainingBudgetDonutProps) {
  const remaining = Math.max(0, totalBudget - spentAmount);
  const percentageSpent = totalBudget > 0 ? Math.min(100, Math.round((spentAmount / totalBudget) * 100)) : 0;
  const percentageRemaining = 100 - percentageSpent;

  // Dimensi SVG Donut
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  // Offset untuk menampilkan bagian tersisa (hijau/cyan) atau terpakai
  const strokeDashoffset = circumference - (percentageRemaining / 100) * circumference;

  return (
    <div className="rounded-3xl p-6 liquid-glass border border-white/90 dark:border-white/10 shadow-sm relative overflow-hidden flex flex-col items-center text-center">
      {/* Glow ambient background */}
      <div className="absolute -top-12 -left-12 w-36 h-36 rounded-full bg-sky-400/15 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-12 -right-12 w-36 h-36 rounded-full bg-emerald-400/15 blur-2xl pointer-events-none" />

      <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        Sisa Budget Keseluruhan
      </h2>

      {/* Circular Progress Gauge */}
      <div className="relative w-56 h-56 flex items-center justify-center my-1">
        <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="budgetRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          {/* Background Ring */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="14"
            className="text-slate-100 dark:text-slate-800"
          />
          {/* Active Progress Ring */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="transparent"
            stroke="url(#budgetRingGradient)"
            strokeWidth="14"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Sisa Budget
          </span>
          <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mt-0.5">
            {formatRupiah(remaining)}
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            Tersisa dari {formatRupiah(totalBudget)}
          </span>

          {/* Sisa Hari Pill */}
          {daysRemaining !== undefined && (
            <span className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/40 shadow-xs">
              <Clock className="w-3 h-3 text-sky-500" />
              {daysRemaining} hari lagi
            </span>
          )}
        </div>
      </div>

      {/* Date Range Footer */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        <span>{periodText}</span>
        <span className="text-slate-300 dark:text-slate-700">•</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {percentageRemaining}% tersedia
        </span>
      </div>
    </div>
  );
}
