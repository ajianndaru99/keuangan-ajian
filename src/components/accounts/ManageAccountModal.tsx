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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05140f]/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
              <Wallet className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-[var(--text-main)] text-base">
              {accountToEdit ? 'Ubah Akun Keuangan' : 'Tambah Akun Baru'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Pemilik Akun */}
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Pemilik Rekening
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setOwner('suami')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  owner === 'suami'
                    ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                👨 Suami
              </button>
              <button
                type="button"
                onClick={() => setOwner('istri')}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  owner === 'istri'
                    ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                👩 Istri
              </button>
            </div>
          </div>

          {/* Tipe Akun */}
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Jenis Akun
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setType('bank')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  type === 'bank'
                    ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Bank</span>
              </button>
              <button
                type="button"
                onClick={() => setType('ewallet')}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  type === 'ewallet'
                    ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-xs'
                    : 'text-[#007a33] hover:text-[#004d00]'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>E-Wallet</span>
              </button>
            </div>
          </div>

          {/* Nama Akun */}
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Nama Akun / Bank
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: BCA / Mandiri / GoPay / ShopeePay"
              className="w-full px-4 py-2.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-1 focus:ring-[#007a33] text-[var(--text-main)] font-bold"
            />
          </div>

          {/* Saldo Awal */}
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
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
              className="w-full px-4 py-2.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] text-base font-bold text-[var(--text-main)] angka-keuangan focus:outline-none focus:ring-1 focus:ring-[#007a33]"
            />
          </div>

          {/* Status Aktif */}
          {accountToEdit && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-main)] block">
                  Status Akun
                </span>
                <span className="text-[10px] text-[#007a33]">
                  {isActive ? 'Akun aktif dipakai' : 'Dinonaktifkan'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isActive ? 'bg-[#198754]' : 'bg-[var(--border-color)]'
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
              className="flex-1 py-3 px-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[#007a33] text-xs font-bold hover:bg-[var(--bg-main)]/80 transition-all"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-3 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
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
