'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/TableToolbar.tsx
// Toolbar Transaksi Gaya Foto 2: Filter All/In/Out, Kalender, Export, + Add
// ==============================================================================

import {
  Calendar,
  Download,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ListFilter,
} from 'lucide-react';
import { DateRangeValue } from './DateRangePickerModal';

export type FlowFilterType = 'all' | 'income' | 'expense';

interface TableToolbarProps {
  currentFlow: FlowFilterType;
  onFlowChange: (flow: FlowFilterType) => void;
  dateRange: DateRangeValue;
  onOpenDateModal: () => void;
  onExport: () => void;
  onAddTransaction: () => void;
  totalCount?: number;
}

export default function TableToolbar({
  currentFlow,
  onFlowChange,
  dateRange,
  onOpenDateModal,
  onExport,
  onAddTransaction,
  totalCount = 0,
}: TableToolbarProps) {
  return (
    <div className="space-y-4 mb-4">
      {/* Baris Atas: Judul Subseksi & Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            My Transactions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kelola dan pantau seluruh arus kas digital keluarga ({totalCount} transaksi)
          </p>
        </div>

        {/* Tombol Aksi Kanan (Mobile & Desktop) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tombol Kalender */}
          <button
            onClick={onOpenDateModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            title="Filter Tanggal"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <span>{dateRange.label}</span>
          </button>

          {/* Tombol Ekspor CSV / Excel */}
          <button
            onClick={onExport}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs"
            title="Ekspor Data ke File Spreadsheet Excel / CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          {/* Tombol Tambah Transaksi Utama (+ Add Transaction) */}
          <button
            onClick={onAddTransaction}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition-all shadow-sm shadow-indigo-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Baris Bawah: Filter Pill All, Income, Expense (Gaya Monexa Foto 2) */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 w-fit">
        {/* All */}
        <button
          onClick={() => onFlowChange('all')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'all'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>All</span>
        </button>

        {/* Income (Pastel Sage Green) */}
        <button
          onClick={() => onFlowChange('income')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'income'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Income</span>
        </button>

        {/* Expense (Pastel Dusty Coral) */}
        <button
          onClick={() => onFlowChange('expense')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'expense'
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/80 shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Expense</span>
        </button>
      </div>
    </div>
  );
}
