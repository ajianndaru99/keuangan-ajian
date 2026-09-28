'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/ManualTransactionModal.tsx
// Formulir tambah transaksi manual jika notifikasi terlewat
// ==============================================================================

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Plus className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Tambah Transaksi Manual
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pemilik Rekening */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Pemilik Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDevice('suami');
                  setSelectedAccountId('');
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  device === 'suami'
                    ? 'bg-white dark:bg-[#111827] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                👨 Suami
              </button>
              <button
                type="button"
                onClick={() => {
                  setDevice('istri');
                  setSelectedAccountId('');
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  device === 'istri'
                    ? 'bg-white dark:bg-[#111827] text-pink-600 dark:text-pink-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                👩 Istri
              </button>
            </div>
          </div>

          {/* Pilihan Akun Bank / E-Wallet */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Rekening / E-Wallet
            </label>
            <select
              value={activeAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type === 'bank' ? 'Bank' : 'E-Wallet'})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle Arah Transaksi */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setDirection('out')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                direction === 'out'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              💸 Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setDirection('in')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                direction === 'in'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              💰 Pemasukan
            </button>
          </div>

          {/* Nominal */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nominal Transaksi
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={amountStr ? formatRupiah(amountStr) : ''}
              onChange={(e) => {
                const num = e.target.value.replace(/[^\d]/g, '');
                setAmountStr(num);
              }}
              placeholder="Rp 0"
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Merchant */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Merchant / Keterangan
            </label>
            <input
              type="text"
              required
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Contoh: Alfamart / Kopi Janji Jiwa"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
          </div>

          {/* Kategori Langsung */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Kategori (Opsional)
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            >
              <option value="">-- Kategorikan Nanti di Inbox --</option>
              {categories
                .filter((c) => c.type === (direction === 'in' ? 'income' : 'expense'))
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Waktu Transaksi */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Waktu Transaksi (WIB)
            </label>
            <input
              type="datetime-local"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-[#070a11] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{loading ? 'Menyimpan...' : 'Simpan Transaksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
