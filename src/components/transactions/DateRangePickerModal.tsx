'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/DateRangePickerModal.tsx
// Modal Pemilih Rentang Tanggal Transaksi: Preset Cepat & Kustom
// ==============================================================================

import { useState } from 'react';
import { Calendar, X, Check } from 'lucide-react';

export type DateFilterPreset = 'all' | 'today' | 'last7days' | 'thisMonth' | 'custom';

export interface DateRangeValue {
  preset: DateFilterPreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  label: string;
}

interface DateRangePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentValue: DateRangeValue;
  onApply: (value: DateRangeValue) => void;
}

export default function DateRangePickerModal({
  isOpen,
  onClose,
  currentValue,
  onApply,
}: DateRangePickerModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<DateFilterPreset>(currentValue.preset);
  const [customStart, setCustomStart] = useState<string>(currentValue.startDate || '');
  const [customEnd, setCustomEnd] = useState<string>(currentValue.endDate || '');

  if (!isOpen) return null;

  const handleApply = () => {
    let label = 'Semua Waktu';
    const now = new Date();

    if (selectedPreset === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      onApply({
        preset: 'today',
        startDate: todayStr,
        endDate: todayStr,
        label: 'Hari Ini',
      });
    } else if (selectedPreset === 'last7days') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const end = now.toISOString().slice(0, 10);
      onApply({
        preset: 'last7days',
        startDate: start,
        endDate: end,
        label: '7 Hari Terakhir',
      });
    } else if (selectedPreset === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      onApply({
        preset: 'thisMonth',
        startDate: start,
        endDate: end,
        label: now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
      });
    } else if (selectedPreset === 'custom' && customStart && customEnd) {
      label = `${customStart} s/d ${customEnd}`;
      onApply({
        preset: 'custom',
        startDate: customStart,
        endDate: customEnd,
        label,
      });
    } else {
      onApply({
        preset: 'all',
        label: 'Semua Waktu',
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Filter Rentang Tanggal
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pilihan Preset Tanggal */}
        <div className="space-y-1.5 mb-4">
          {[
            { id: 'all', label: 'Semua Waktu' },
            { id: 'today', label: 'Hari Ini' },
            { id: 'last7days', label: '7 Hari Terakhir' },
            { id: 'thisMonth', label: 'Bulan Ini' },
            { id: 'custom', label: 'Rentang Kustom' },
          ].map((preset) => {
            const isSelected = selectedPreset === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id as DateFilterPreset)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span>{preset.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
              </button>
            );
          })}
        </div>

        {/* Form Rentang Kustom */}
        {selectedPreset === 'custom' && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-2.5 mb-4 animate-in fade-in duration-150">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Tombol Aksi */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-xs"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
