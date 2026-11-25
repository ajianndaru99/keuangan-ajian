'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TableToolbar.tsx
// Toolbar Filter Read-Only: All/Pending/Masuk/Keluar + Filter Kalender
// ==============================================================================

import {
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  ListFilter,
} from 'lucide-react';
import { DateRangeValue } from './DateRangePickerModal';

export type FlowFilterType = 'all' | 'pending' | 'income' | 'expense';

interface TableToolbarProps {
  currentFlow: FlowFilterType;
  onFlowChange: (flow: FlowFilterType) => void;
  dateRange: DateRangeValue;
  onOpenDateModal: () => void;
  totalCount?: number;
  pendingCount?: number;
}

export default function TableToolbar({
  currentFlow,
  onFlowChange,
  dateRange,
  onOpenDateModal,
  totalCount = 0,
  pendingCount = 0,
}: TableToolbarProps) {
  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-main)] tracking-tight">
            Riwayat Transaksi
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Monitor arus kas otomatis ({totalCount} transaksi) — edit penuh via Telegram
          </p>
        </div>

        <button
          onClick={onOpenDateModal}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-2xs self-start sm:self-auto"
          title="Filter Tanggal Transaksi"
        >
          <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--accent-color)]" />
          <span className="truncate">{dateRange.label}</span>
        </button>
      </div>

      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] w-max">
          <button
            onClick={() => onFlowChange('all')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentFlow === 'all'
                ? 'bg-[var(--surface-2)] text-[var(--text-main)] shadow-2xs font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Semua</span>
          </button>

          <button
            onClick={() => onFlowChange('pending')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentFlow === 'pending'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Pending</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onFlowChange('income')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentFlow === 'income'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Masuk</span>
          </button>

          <button
            onClick={() => onFlowChange('expense')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              currentFlow === 'expense'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
