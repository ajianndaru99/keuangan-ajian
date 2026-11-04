'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TableToolbar.tsx
// Toolbar Transaksi Gaya Foto 2: Filter All/In/Out, Kalender, Export, + Add
// ==============================================================================

import {
  Calendar,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ListFilter,
  Sparkles,
} from 'lucide-react';
import { DateRangeValue } from './DateRangePickerModal';

export type FlowFilterType = 'all' | 'pending' | 'income' | 'expense';

interface TableToolbarProps {
  currentFlow: FlowFilterType;
  onFlowChange: (flow: FlowFilterType) => void;
  dateRange: DateRangeValue;
  onOpenDateModal: () => void;
  onAddTransaction: () => void;
  onRunAiReconcile?: () => void;
  isAiReconciling?: boolean;
  aiRemainingQuota?: number;
  totalCount?: number;
  pendingCount?: number;
}

export default function TableToolbar({
  currentFlow,
  onFlowChange,
  dateRange,
  onOpenDateModal,
  onAddTransaction,
  onRunAiReconcile,
  isAiReconciling = false,
  aiRemainingQuota = 2,
  totalCount = 0,
  pendingCount = 0,
}: TableToolbarProps) {
  return (
    <div className="space-y-3 mb-4">
      {/* Baris Atas: Judul & 3 Tombol Aksi */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-[var(--text-main)] tracking-tight">
            Riwayat Transaksi
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Kelola arus kas digital keluarga ({totalCount} transaksi)
          </p>
        </div>

        {/* 3 Tombol Aksi: Kalender, Rekonsiliasi AI, dan Tambah Transaksi (Selalu 1 Baris Seimbang & Rapi di HP) */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
          {/* 1. Tombol Kalender */}
          <button
            onClick={onOpenDateModal}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-2xs min-w-0"
            title="Filter Tanggal Transaksi"
          >
            <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--accent-color)]" />
            <span className="truncate">{dateRange.label}</span>
          </button>

          {/* 2. Tombol Rekonsiliasi AI */}
          {onRunAiReconcile && (
            <button
              onClick={onRunAiReconcile}
              disabled={isAiReconciling}
              className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-2xs ${
                isAiReconciling
                  ? 'border-purple-500/40 bg-purple-500/10 text-purple-600 dark:text-purple-300 animate-pulse cursor-wait'
                  : aiRemainingQuota === 0
                  ? 'border-[var(--border-color)] bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                  : 'border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 hover:border-purple-500/50'
              }`}
              title={
                aiRemainingQuota === 0
                  ? 'Batas 2x per hari tercapai.'
                  : `Rekonsiliasi AI Gemini (Sisa: ${aiRemainingQuota}x)`
              }
            >
              <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isAiReconciling ? 'animate-spin' : 'text-purple-600 dark:text-purple-400'}`} />
              <span className="truncate">
                {isAiReconciling ? 'Audit...' : (
                  <>
                    <span className="hidden sm:inline">Rekonsiliasi </span>AI
                  </>
                )}
              </span>
              <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full shrink-0 ${
                aiRemainingQuota === 0
                  ? 'bg-zinc-500/20 text-zinc-500'
                  : aiRemainingQuota === 1
                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
              }`}>
                {aiRemainingQuota}x
              </span>
            </button>
          )}

          {/* 3. Tombol Tambah Transaksi */}
          <button
            onClick={onAddTransaction}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-[var(--accent-color)] hover:opacity-90 active:scale-95 text-white dark:text-[#0B0F17] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Tambah</span>
          </button>
        </div>
      </div>

      {/* Baris Bawah: Filter Pill All, Pending, Income, Expense (Scrollable Halus di HP) */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] w-max">
          {/* All */}
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

          {/* Pending Review */}
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

          {/* Income */}
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

          {/* Expense */}
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
