'use client';

// ==============================================================================
// ACCOUNTS PAGE: src/app/accounts/page.tsx
// Halaman Overview Saldo Per Akun & Kelola Akun
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import BalanceCard, { AccountBalanceItem } from '@/components/accounts/BalanceCard';
import AdjustBalanceModal from '@/components/accounts/AdjustBalanceModal';
import ManageAccountModal, { AccountData } from '@/components/accounts/ManageAccountModal';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import {
  Wallet,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function AccountsPage() {
  const { isHideBalance, togglePrivacy } = usePrivacy();
  const [accounts, setAccounts] = useState<AccountBalanceItem[]>([]);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri'>('all');

  // State Modal
  const [adjustingAccount, setAdjustingAccount] = useState<AccountBalanceItem | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountBalanceItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Ambil saldo akun dari database Supabase (RPC get_account_balances)
  const fetchAccounts = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Profil pengguna
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, display_name, household_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setUserRole(profile.role);
          setDisplayName(profile.display_name);

          // 2. Panggil RPC get_account_balances
          const { data: balanceData, error: balanceError } = await supabase
            .rpc('get_account_balances', { p_household_id: profile.household_id });

          if (!balanceError && balanceData && balanceData.length > 0) {
            setAccounts(balanceData);
          } else {
            // Fallback query tabel accounts biasa jika RPC belum dijalankan
            const { data: rawAccounts } = await supabase
              .from('accounts')
              .select('*')
              .eq('household_id', profile.household_id)
              .order('owner', { ascending: true });

            if (rawAccounts && rawAccounts.length > 0) {
              setAccounts(
                rawAccounts.map((a: any) => ({
                  ...a,
                  current_balance: Number(a.balance || a.initial_balance || 0),
                }))
              );
            }
          }
        }
      }
    } catch (err) {
      console.warn('Gagal memuat saldo akun:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Handler Koreksi Saldo (Simpan Rekonsiliasi)
  const handleAdjustBalance = async (
    accountId: string,
    targetBalance: number,
    notes: string
  ) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId ? { ...a, current_balance: targetBalance } : a
      )
    );

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      try {
        await supabase.rpc('adjust_account_balance', {
          p_account_id: accountId,
          p_target_balance: targetBalance,
          p_notes: notes,
        });
      } catch (e) {
        console.warn('Gagal RPC koreksi saldo:', e);
      }
    }
  };

  // Handler Tambah / Edit Akun
  const handleSaveAccount = async (data: AccountData) => {
    if (data.id) {
      // Edit Akun
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === data.id
            ? {
                ...a,
                name: data.name,
                type: data.type,
                owner: data.owner,
                initial_balance: data.initial_balance,
                is_active: data.is_active,
              }
            : a
        )
      );

      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase
          .from('accounts')
          .update({
            name: data.name,
            type: data.type,
            owner: data.owner,
            initial_balance: data.initial_balance,
            is_active: data.is_active,
          })
          .eq('id', data.id);
      }
    } else {
      // Tambah Akun Baru
      const newAcc: AccountBalanceItem = {
        id: `acc-manual-${Date.now()}`,
        name: data.name,
        type: data.type,
        owner: data.owner,
        initial_balance: data.initial_balance,
        current_balance: data.initial_balance,
        is_active: true,
      };

      setAccounts((prev) => [...prev, newAcc]);

      if (isSupabaseConfigured()) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('household_id')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            await supabase.from('accounts').insert({
              household_id: profile.household_id,
              name: data.name,
              type: data.type,
              owner: data.owner,
              initial_balance: data.initial_balance,
              balance: data.initial_balance,
              is_active: true,
            });
            fetchAccounts();
          }
        }
      }
    }
  };

  // Kalkulasi Total Saldo Gabungan, Suami, dan Istri
  const totals = useMemo(() => {
    let grandTotal = 0;
    let suamiTotal = 0;
    let istriTotal = 0;
    let activeCount = 0;

    accounts.forEach((acc) => {
      if (acc.is_active) {
        activeCount++;
        const bal = Number(acc.current_balance || 0);
        grandTotal += bal;
        if (acc.owner === 'suami') suamiTotal += bal;
        else if (acc.owner === 'istri') istriTotal += bal;
      }
    });

    return { grandTotal, suamiTotal, istriTotal, activeCount };
  }, [accounts]);

  // Filter Akun
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (filterOwner === 'suami') return a.owner === 'suami';
      if (filterOwner === 'istri') return a.owner === 'istri';
      return true;
    });
  }, [accounts, filterOwner]);

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={0}
    >
      <div className="space-y-4">
        {/* Hero Card: Total Saldo Gabungan Keluarga */}
        <div className="rounded-3xl p-5 mb-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-all">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Total Saldo Gabungan
                </span>
                <button
                  onClick={togglePrivacy}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
                  title="Sembunyikan / Tampilkan Saldo"
                >
                  {isHideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none mt-1">
                {formatMaskedRupiah(totals.grandTotal, isHideBalance)}
              </p>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-95 text-white dark:text-slate-900 font-semibold text-xs transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Akun</span>
            </button>
          </div>

          {/* Subtotal Saldo Suami vs Istri */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block leading-none mb-1">
                Saldo Suami
              </span>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {formatMaskedRupiah(totals.suamiTotal, isHideBalance)}
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block leading-none mb-1">
                Saldo Istri
              </span>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {formatMaskedRupiah(totals.istriTotal, isHideBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3.5 py-0.5 pr-4">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Semua Akun ({accounts.length})
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'suami'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Akun Suami ({accounts.filter((a) => a.owner === 'suami').length})
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'istri'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Akun Istri ({accounts.filter((a) => a.owner === 'istri').length})
          </button>

          <button
            onClick={fetchAccounts}
            title="Refresh saldo"
            className="p-2 rounded-xl bg-white dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 ml-auto shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Kartu Saldo */}
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 my-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center mx-auto mb-3 border border-slate-200 dark:border-slate-700">
              <Wallet className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Belum Ada Akun Terdaftar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Klik tombol "Tambah Akun" di atas untuk mendaftarkan rekening bank atau dompet digital pertama Anda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredAccounts.map((account) => (
              <BalanceCard
                key={account.id}
                account={account}
                isHideBalance={isHideBalance}
                onOpenAdjust={(acc) => setAdjustingAccount(acc)}
                onOpenEdit={(acc) => setEditingAccount(acc)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal Koreksi Saldo */}
      <AdjustBalanceModal
        isOpen={Boolean(adjustingAccount)}
        onClose={() => setAdjustingAccount(null)}
        account={
          adjustingAccount
            ? {
                id: adjustingAccount.id,
                name: adjustingAccount.name,
                type: adjustingAccount.type,
                owner: adjustingAccount.owner,
                currentBalance: adjustingAccount.current_balance,
              }
            : null
        }
        onAdjust={handleAdjustBalance}
      />

      {/* Modal Tambah / Edit Akun */}
      <ManageAccountModal
        isOpen={isAddModalOpen || Boolean(editingAccount)}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingAccount(null);
        }}
        accountToEdit={editingAccount}
        onSave={handleSaveAccount}
      />
    </AppShell>
  );
}
