'use client';

// ==============================================================================
// ACCOUNTS PAGE: src/app/accounts/page.tsx
// Halaman Overview Saldo Per Akun & Kelola Akun (Fase 3)
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import BalanceCard, { AccountBalanceItem } from '@/components/accounts/BalanceCard';
import AdjustBalanceModal from '@/components/accounts/AdjustBalanceModal';
import ManageAccountModal, { AccountData } from '@/components/accounts/ManageAccountModal';
import {
  Wallet,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

// Data Akun Default untuk Simulasi / Demo
const initialDemoAccounts: AccountBalanceItem[] = [
  {
    id: 'acc-s-1',
    name: 'BCA',
    type: 'bank',
    owner: 'suami',
    initial_balance: 5000000,
    current_balance: 4955000, // 5.000.000 - 45.000 (Kopi Kenangan)
    is_active: true,
  },
  {
    id: 'acc-s-2',
    name: 'Mandiri',
    type: 'bank',
    owner: 'suami',
    initial_balance: 3500000,
    current_balance: 3475000, // 3.500.000 - 25.000 (Indomaret)
    is_active: true,
  },
  {
    id: 'acc-s-3',
    name: 'GoPay',
    type: 'ewallet',
    owner: 'suami',
    initial_balance: 250000,
    current_balance: 250000,
    is_active: true,
  },
  {
    id: 'acc-s-4',
    name: 'OVO',
    type: 'ewallet',
    owner: 'suami',
    initial_balance: 150000,
    current_balance: 150000,
    is_active: true,
  },
  {
    id: 'acc-i-1',
    name: 'BCA',
    type: 'bank',
    owner: 'istri',
    initial_balance: 4200000,
    current_balance: 4200000,
    is_active: true,
  },
  {
    id: 'acc-i-2',
    name: 'BRI',
    type: 'bank',
    owner: 'istri',
    initial_balance: 2800000,
    current_balance: 2800000,
    is_active: true,
  },
  {
    id: 'acc-i-3',
    name: 'ShopeePay',
    type: 'ewallet',
    owner: 'istri',
    initial_balance: 300000,
    current_balance: 300000,
    is_active: true,
  },
  {
    id: 'acc-i-4',
    name: 'DANA',
    type: 'ewallet',
    owner: 'istri',
    initial_balance: 200000,
    current_balance: 700000, // 200.000 + 500.000 (Top Up BCA OneKlik)
    is_active: true,
  },
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountBalanceItem[]>(initialDemoAccounts);
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
    <>
      <Navbar
        userRole={userRole}
        displayName={displayName}
        pendingCount={0}
      />

      <main className="flex-1 pb-28 max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 pt-3.5">
        {/* Hero Card: Total Saldo Gabungan Keluarga */}
        <div className="rounded-3xl p-5 mb-3.5 liquid-glass relative overflow-hidden transition-all shadow-[0_12px_36px_rgba(100,116,139,0.1)]">
          <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gradient-to-br from-sky-400/25 via-indigo-400/15 to-purple-400/20 blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                Total Saldo Gabungan
              </span>
              <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none mt-1">
                {formatRupiah(totals.grandTotal)}
              </p>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-sky-500/25 transition-all border border-white/40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Akun</span>
            </button>
          </div>

          {/* Subtotal Saldo Suami vs Istri */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200/80 dark:border-white/10 relative z-10">
            <div className="p-2.5 rounded-2xl liquid-pill bg-white/70 dark:bg-white/5 border border-white/90 dark:border-white/10">
              <span className="text-[10px] font-bold text-sky-800 dark:text-sky-300 block leading-none mb-1">
                👨 Saldo Suami
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                {formatRupiah(totals.suamiTotal)}
              </p>
            </div>

            <div className="p-2.5 rounded-2xl liquid-pill bg-white/70 dark:bg-white/5 border border-white/90 dark:border-white/10">
              <span className="text-[10px] font-bold text-pink-800 dark:text-pink-300 block leading-none mb-1">
                👩 Saldo Istri
              </span>
              <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                {formatRupiah(totals.istriTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3.5 py-0.5 pr-4">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'all'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-transparent shadow-md shadow-sky-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            Semua Akun ({accounts.length})
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'suami'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-transparent shadow-md shadow-sky-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            👨 Akun Suami ({accounts.filter((a) => a.owner === 'suami').length})
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'istri'
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-transparent shadow-md shadow-pink-500/25'
                : 'liquid-pill text-slate-800 dark:text-slate-200 hover:bg-white border-slate-200/80 dark:border-white/10'
            }`}
          >
            👩 Akun Istri ({accounts.filter((a) => a.owner === 'istri').length})
          </button>

          <button
            onClick={fetchAccounts}
            title="Refresh saldo"
            className="p-2 rounded-2xl liquid-pill text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ml-auto shrink-0 transition-all border border-slate-200/80 dark:border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Kartu Saldo */}
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl liquid-glass border border-white/80 dark:border-white/10 my-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-sky-100/80 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3 shadow-sm border border-sky-200 dark:border-sky-800/40">
              <Wallet className="w-7 h-7" />
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
              Belum Ada Akun Terdaftar
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Klik tombol "Tambah Akun" di atas untuk mendaftarkan rekening bank atau dompet digital pertama Anda.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAccounts.map((account) => (
              <BalanceCard
                key={account.id}
                account={account}
                onOpenAdjust={(acc) => setAdjustingAccount(acc)}
                onOpenEdit={(acc) => setEditingAccount(acc)}
              />
            ))}
          </div>
        )}
      </main>

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
    </>
  );
}
