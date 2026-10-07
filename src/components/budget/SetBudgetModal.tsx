'use client';

// ==============================================================================
// COMPONENT: src/components/budget/SetBudgetModal.tsx
// Modal Tambah & Atur Budget Kategori
// ==============================================================================

import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { CategoryBudgetItem } from './CategoryBudgetCard';

interface SetBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CategoryBudgetItem | null;
  onSave: (id: string, newLimit: number) => void;
}

export default function SetBudgetModal({
  isOpen,
  onClose,
  item,
  onSave,
}: SetBudgetModalProps) {
  const [limitInput, setLimitInput] = useState<string>('');

  useEffect(() => {
    if (item) {
      setLimitInput(item.budgetLimit > 0 ? String(item.budgetLimit) : '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(limitInput.replace(/[^\d]/g, ''));
    if (!isNaN(val) && val >= 0) {
      onSave(item.id, val);
      onClose();
    }
  };

  const currentVal = parseFloat(limitInput.replace(/[^\d]/g, '')) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl p-6 liquid-glass border border-white/90 dark:border-white/10 shadow-2xl relative">
        {/* Tombol Tutup */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-950/60 flex items-center justify-center text-2xl border border-sky-200 dark:border-sky-800/40">
            <span>{item.emoji}</span>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Atur Budget Kategori
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {item.name}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Batas Alokasi Bulanan (Rupiah)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                Rp
              </span>
              <input
                type="number"
                min="0"
                step="50000"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder="Contoh: 1500000"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-white font-bold text-base focus:outline-none focus:ring-2 focus:ring-sky-500"
                autoFocus
              />
            </div>
            {currentVal > 0 && (
              <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 mt-1.5">
                Pratinjau: {formatRupiah(currentVal)}
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-bold text-xs shadow-md shadow-sky-500/25 hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Simpan Target
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
