'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/ManualTransactionModal.tsx
// Formulir Tambah Transaksi Manual: Desain Minimalis & Profesional
// ==============================================================================

import { useState } from 'react';
import { X, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import { Category } from './CategoryChipList';

export interface AccountOption {
  id: string;
  name: string;
  owner: 'suami' | 'istri';
  type: 'bank' | 'ewallet';
}

interface ManualTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountOption[];
  categories: Category[];
  currentRole: 'suami' | 'istri';
  onAdd: (data: {
    accountId: string;
    amount: number;
    direction: 'out' | 'in';
    merchant: string;
    categoryId?: string;
    transactionDate: string;
    sourceDevice: 'suami' | 'istri';
  }) => Promise<void>;
}

export default function ManualTransactionModal({
  isOpen,
  onClose,
  accounts,
  categories,
  currentRole,
  onAdd,
}: ManualTransactionModalProps) {
  const [device, setDevice] = useState<'suami' | 'istri'>(currentRole);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [transactionDate, setTransactionDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
    return localISOTime;
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // Filter akun berdasarkan pemilik yang dipilih
  const filteredAccounts = accounts.filter((a) => a.owner === device);
  const activeAccountId = selectedAccountId || (filteredAccounts[0]?.id ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = parseFloat(amountStr.replace(/[^\d]/g, '')) || 0;
    if (cleanAmount <= 0) return;

    setLoading(true);
    await onAdd({
      accountId: activeAccountId,
      amount: cleanAmount,
      direction,
      merchant: merchant.trim() || 'Transaksi Manual',
      categoryId: categoryId || undefined,
      transactionDate: new Date(transactionDate).toISOString(),
      sourceDevice: device,
    });
    setLoading(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-[var(--surface-3)] border border-[var(--border-color)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-[var(--text-main)] text-base">
            Tambah Transaksi Manual
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-4)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pemilik Transaksi */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Pemilik Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => {
                  setDevice('suami');
                  setSelectedAccountId('');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-colors ${
                  device === 'suami'
                    ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Kepala Keluarga (Suami)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDevice('istri');
                  setSelectedAccountId('');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-colors ${
                  device === 'istri'
                    ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Bendahara (Istri)
              </button>
            </div>
          </div>

          {/* Jenis Transaksi */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Jenis Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'out'
                    ? 'bg-[var(--color-expense)]/15 text-[var(--color-expense)] border border-[var(--color-expense)]/40 shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-expense)]" />
                <span>Pengeluaran</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                  direction === 'in'
                    ? 'bg-[var(--color-income)]/15 text-[var(--color-income)] border border-[var(--color-income)]/40 shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--color-income)]" />
                <span>Pemasukan</span>
              </button>
            </div>
          </div>

          {/* Akun Rekening */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Rekening / Sumber Dana
            </label>
            <select
              value={activeAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-[var(--text-main)]"
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type === 'bank' ? 'Bank' : 'E-Wallet'})
                </option>
              ))}
            </select>
          </div>

          {/* Nominal */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Nominal (Rupiah)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={amountStr ? formatRupiah(amountStr) : ''}
              onChange={(e) => {
                const numeric = e.target.value.replace(/[^\d]/g, '');
                setAmountStr(numeric);
              }}
              placeholder="Rp 0"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-base font-bold text-[var(--text-main)] angka-keuangan focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
            />
          </div>

          {/* Merchant */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Keterangan / Merchant
            </label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Contoh: Belanja Pasar / Listrik"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-[var(--text-main)] font-semibold"
            />
          </div>

          {/* Kategori Opsional */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Kategori (Opsional)
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-[var(--text-main)]"
            >
              <option value="">-- Masukkan ke Inbox (Pending) --</option>
              {categories
                .filter((c) => (direction === 'in' ? c.type === 'income' : c.type === 'expense'))
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Tanggal */}
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Waktu Transaksi
            </label>
            <input
              type="datetime-local"
              required
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)] text-[var(--text-main)]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-4)] text-[var(--text-main)] text-xs font-bold hover:bg-[var(--surface-2)] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white dark:text-[#121218] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{loading ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
