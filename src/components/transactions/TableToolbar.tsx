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
          <h2 className="text-xl font-bold text-[var(--text-main)] tracking-tight">
            My Transactions
          </h2>
          <p className="text-xs text-[#007a33] mt-0.5">
            Kelola dan pantau seluruh arus kas digital keluarga ({totalCount} transaksi)
          </p>
        </div>

        {/* Tombol Aksi Kanan (Mobile & Desktop) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tombol Kalender */}
          <button
            onClick={onOpenDateModal}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors shadow-2xs"
            title="Filter Tanggal"
          >
            <Calendar className="w-3.5 h-3.5 text-[#007a33]" />
            <span>{dateRange.label}</span>
          </button>

          {/* Tombol Ekspor CSV / Excel */}
          <button
            onClick={onExport}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-colors shadow-2xs"
            title="Ekspor Data ke File Spreadsheet Excel / CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#007a33]" />
            <span>Export CSV</span>
          </button>

          {/* Tombol Tambah Transaksi Utama (+ Add Transaction) */}
          <button
            onClick={onAddTransaction}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent-color)] hover:opacity-90 active:scale-95 text-[var(--bg-main)] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Transaction</span>
          </button>
        </div>
      </div>

      {/* Baris Bawah: Filter Pill All, Income, Expense (Gaya Monexa Foto 2) */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] w-fit">
        {/* All */}
        <button
          onClick={() => onFlowChange('all')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'all'
              ? 'bg-[var(--bg-main)] text-[var(--text-main)] border border-[var(--border-color)] shadow-2xs'
              : 'text-[#007a33] hover:text-[#004d00]'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>All</span>
        </button>

        {/* Income (Hijau Teduh #198754) */}
        <button
          onClick={() => onFlowChange('income')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'income'
              ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/30 shadow-2xs'
              : 'text-[#007a33] hover:text-[#004d00]'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-[#198754]" />
          <span>Income</span>
        </button>

        {/* Expense (Muted Red #DC3545) */}
        <button
          onClick={() => onFlowChange('expense')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            currentFlow === 'expense'
              ? 'bg-[#fde8ea] text-[#DC3545] border border-[#DC3545]/30 shadow-2xs'
              : 'text-[#007a33] hover:text-[#004d00]'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-[#DC3545]" />
          <span>Expense</span>
        </button>
      </div>
    </div>
  );
}
