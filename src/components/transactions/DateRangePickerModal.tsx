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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05140f]/60 backdrop-blur-xs">
      <div className="bg-[var(--bg-card)] rounded-3xl p-5 max-w-sm w-full border border-[var(--border-color)] shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]/70 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-main)]">
              Filter Rentang Tanggal
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)]"
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
                    ? 'bg-[var(--accent-color)] text-[var(--bg-main)] border border-[var(--accent-color)] shadow-xs font-bold'
                    : 'text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)]/60 border border-transparent'
                }`}
              >
                <span>{preset.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[var(--bg-main)]" />}
              </button>
            );
          })}
        </div>

        {/* Form Rentang Kustom */}
        {selectedPreset === 'custom' && (
          <div className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)] space-y-2.5 mb-4 animate-in fade-in duration-150">
            <div>
              <label className="text-[10px] font-semibold text-[#007a33] uppercase block mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#007a33] uppercase block mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
              />
            </div>
          </div>
        )}

        {/* Tombol Aksi */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-3 rounded-xl border border-[var(--border-color)] text-xs font-semibold text-[#007a33] hover:bg-[var(--bg-main)] transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-2 px-3 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] text-xs font-bold transition-colors shadow-xs"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
