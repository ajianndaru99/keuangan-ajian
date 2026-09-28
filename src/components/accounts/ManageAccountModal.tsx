'use client';

// ==============================================================================
// COMPONENT: src/components/accounts/ManageAccountModal.tsx
// Modal Tambah & Kelola Akun (Bank & E-Wallet)
// ==============================================================================

import { useState, useEffect } from 'react';
import { X, Check, Wallet, Building2, Smartphone } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

export interface AccountData {
  id?: string;
  name: string;
  type: 'bank' | 'ewallet';
  owner: 'suami' | 'istri';
  initial_balance: number;
  is_active: boolean;
}

interface ManageAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit: AccountData | null;
  onSave: (data: AccountData) => Promise<void>;
}

export default function ManageAccountModal({
  isOpen,
  onClose,
  accountToEdit,
  onSave,
}: ManageAccountModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'bank' | 'ewallet'>('bank');
  const [owner, setOwner] = useState<'suami' | 'istri'>('suami');
  const [initialBalanceStr, setInitialBalanceStr] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setType(accountToEdit.type);
      setOwner(accountToEdit.owner);
      setInitialBalanceStr(accountToEdit.initial_balance > 0 ? accountToEdit.initial_balance.toString() : '');
      setIsActive(accountToEdit.is_active);
    } else {
      setName('');
      setType('bank');
      setOwner('suami');
      setInitialBalanceStr('');
      setIsActive(true);
    }
  }, [accountToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBalance = parseFloat(initialBalanceStr.replace(/[^\d]/g, '')) || 0;
    setLoading(true);
    await onSave({
      id: accountToEdit?.id,
      name: name.trim(),
      type,
      owner,
      initial_balance: cleanBalance,
      is_active: isActive,
    });
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl liquid-glass border border-white/80 dark:border-white/10 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-sky-100/70 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200/50">
              <Wallet className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              {accountToEdit ? 'Ubah Akun Keuangan' : 'Tambah Akun Baru'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-white/10 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pemilik Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Pemilik Rekening
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl liquid-pill bg-white/40 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => setOwner('suami')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  owner === 'suami'
                    ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white shadow-sm shadow-sky-400/25'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                👨 Suami
              </button>
              <button
                type="button"
                onClick={() => setOwner('istri')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  owner === 'istri'
                    ? 'bg-gradient-to-r from-pink-400 to-rose-400 text-white shadow-sm shadow-pink-400/25'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                👩 Istri
              </button>
            </div>
          </div>

          {/* Tipe Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Jenis Akun
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl liquid-pill bg-white/40 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => setType('bank')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  type === 'bank'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-sky-500" />
                <span>Bank</span>
              </button>
              <button
                type="button"
                onClick={() => setType('ewallet')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  type === 'ewallet'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                <span>E-Wallet</span>
              </button>
            </div>
          </div>

          {/* Nama Akun */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Akun / Bank
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: BCA / Mandiri / GoPay / ShopeePay"
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/80 dark:bg-black/30 border border-white/90 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-900 dark:text-white font-bold"
            />
          </div>

          {/* Saldo Awal */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Saldo Awal (Rp)
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={initialBalanceStr ? formatRupiah(initialBalanceStr) : ''}
              onChange={(e) => {
                const numeric = e.target.value.replace(/[^\d]/g, '');
                setInitialBalanceStr(numeric);
              }}
              placeholder="Rp 0"
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/80 dark:bg-black/30 border border-white/90 dark:border-white/10 text-base font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {/* Status Aktif */}
          {accountToEdit && (
            <div className="flex items-center justify-between p-3 rounded-2xl liquid-pill border border-slate-200/80 dark:border-white/10">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-white block">
                  Status Akun
                </span>
                <span className="text-[10px] text-slate-500">
                  {isActive ? 'Akun aktif dipakai' : 'Dinonaktifkan'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-2xl liquid-pill border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-white/80 dark:hover:bg-white/10 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 active:scale-95 transition-all disabled:opacity-50 border border-white/30"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? 'Menyimpan...' : 'Simpan Akun'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
