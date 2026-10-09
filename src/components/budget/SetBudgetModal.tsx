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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl p-6 bg-[var(--surface-3)] border border-[var(--border-color)] shadow-2xl relative">
        {/* Tombol Tutup */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)] flex items-center justify-center text-2xl border border-[var(--border-color)]">
            <span>{item.emoji}</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-main)]">
              Atur Budget Kategori
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {item.name}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Batas Alokasi Bulanan (Rupiah)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[var(--text-muted)]">
                Rp
              </span>
              <input
                type="number"
                min="0"
                step="50000"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                placeholder="Contoh: 1500000"
                className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[var(--text-main)] font-bold text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] angka-keuangan"
                autoFocus
              />
            </div>
            {currentVal > 0 && (
              <p className="text-xs font-bold text-income mt-1.5">
                Pratinjau: {formatRupiah(currentVal)}
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl border border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-main)] font-bold text-xs hover:bg-[var(--surface-1)] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
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
