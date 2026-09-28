'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/PeriodNavigator.tsx
// Navigasi & Toggle Periode Rekapitulasi (Mingguan / Bulanan)
// ==============================================================================

import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from 'lucide-react';
import { DateRange } from '@/lib/date-utils';

interface PeriodNavigatorProps {
  periodType: 'weekly' | 'monthly';
  onTogglePeriodType: (type: 'weekly' | 'monthly') => void;
  dateRange: DateRange;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
}

export default function PeriodNavigator({
  periodType,
  onTogglePeriodType,
  dateRange,
  offset,
  onPrev,
  onNext,
  onReset,
}: PeriodNavigatorProps) {
  return (
    <div className="rounded-3xl p-3.5 mb-3.5 liquid-glass transition-all border border-white/80 dark:border-white/10 shadow-sm">
      {/* Toggle Tab: Mingguan vs Bulanan */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl liquid-pill bg-white/40 dark:bg-slate-800/40 mb-3">
        <button
          type="button"
          onClick={() => onTogglePeriodType('weekly')}
          className={`py-2 text-xs font-black rounded-xl transition-all ${
            periodType === 'weekly'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/25'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          📅 Rekap Mingguan
        </button>
        <button
          type="button"
          onClick={() => onTogglePeriodType('monthly')}
          className={`py-2 text-xs font-black rounded-xl transition-all ${
            periodType === 'monthly'
              ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/25'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          🗓️ Rekap Bulanan
        </button>
      </div>

      {/* Baris Navigasi Periode */}
      <div className="flex items-center justify-between gap-2 px-1">
        <button
          onClick={onPrev}
          title="Periode Sebelumnya"
          className="p-2 rounded-2xl liquid-pill hover:bg-white text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all border border-slate-200/80 dark:border-white/10 active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-center flex-1 min-w-0">
          <div className="flex items-center justify-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-xs font-black text-slate-900 dark:text-white truncate">
              {dateRange.label}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
            {dateRange.subLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {offset !== 0 && (
            <button
              onClick={onReset}
              title="Kembali ke Periode Sekarang"
              className="p-2 rounded-2xl liquid-pill hover:bg-white text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-all border border-slate-200/80 dark:border-white/10 active:scale-95 text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onNext}
            title="Periode Berikutnya"
            className="p-2 rounded-2xl liquid-pill hover:bg-white text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-all border border-slate-200/80 dark:border-white/10 active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
