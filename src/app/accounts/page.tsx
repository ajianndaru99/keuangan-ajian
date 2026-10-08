'use client';

// ==============================================================================
// ACCOUNTS PAGE: src/app/accounts/page.tsx
// Halaman Overview Saldo Per Akun & Kelola Akun (My Wallet)
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
  Trash2,
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

  // Ambil saldo akun dari database Supabase
  const fetchAccounts = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setLoading(true);
    const supabase = createClient();

    try {
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

          // Panggil RPC get_account_balances
          const { data: balanceData, error: balanceError } = await supabase
            .rpc('get_account_balances', { p_household_id: profile.household_id });

          if (!balanceError && balanceData && balanceData.length > 0) {
            setAccounts(
              balanceData.map((a: any) => ({
                id: a.account_id || a.id,
                name: a.name,
                type: a.type,
                owner: a.owner,
                initial_balance: Number(a.initial_balance || 0),
                current_balance: Number(a.current_balance || 0),
                is_active: a.is_active,
              }))
            );
          } else {
            // Fallback query tabel accounts biasa
            const { data: rawAccounts } = await supabase
              .from('accounts')
              .select('*')
              .eq('household_id', profile.household_id)
              .order('owner', { ascending: true });

            if (rawAccounts && rawAccounts.length > 0) {
              setAccounts(
                rawAccounts.map((a: any) => ({
                  ...a,
                  current_balance: Number(a.balance ?? a.initial_balance ?? 0),
                }))
              );
            } else {
              setAccounts([]);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Gagal memuat saldo akun:', err);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Handler Koreksi Saldo
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
    fetchAccounts();
  };

  // Handler Tambah / Edit Akun
  const handleSaveAccount = async (data: AccountData) => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('household_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) return;

    if (data.id) {
      // Edit Akun
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
    } else {
      // Tambah Akun Baru
      await supabase.from('accounts').insert({
        household_id: profile.household_id,
        name: data.name,
        type: data.type,
        owner: data.owner,
        initial_balance: data.initial_balance,
        balance: data.initial_balance,
        is_active: true,
      });
    }

    fetchAccounts();
  };

  // Bersihkan Semua Akun (Reset Total)
  const handleClearAllAccounts = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus seluruh akun di tab My Wallet agar benar-benar bersih dari nol?')) {
      return;
    }

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
          await supabase.from('accounts').delete().eq('household_id', profile.household_id);
        }
      }
    }
    setAccounts([]);
  };

  // Kalkulasi Total Saldo
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

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (filterOwner === 'suami') return a.owner === 'suami';
      if (filterOwner === 'istri') return a.owner === 'istri';
      return true;
    });
  }, [accounts, filterOwner]);

  return (
    <AppShell userRole={userRole} displayName={displayName} pendingCount={0}>
      <div className="space-y-5">
        {/* Hero Card: Total Saldo Gabungan Keluarga (Pastel Mint Tint di atas Dark) */}
        <div className="rounded-3xl p-6 bg-emerald-950/20 border border-emerald-500/20 shadow-sm relative overflow-hidden backdrop-blur-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/90 block">
                  Total Saldo Gabungan Kas Keluarga
                </span>
                <button
                  onClick={togglePrivacy}
                  className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                  title="Sembunyikan / Tampilkan Saldo"
                >
                  {isHideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-3xl font-black text-white tracking-tight leading-none mt-1.5">
                {formatMaskedRupiah(totals.grandTotal, isHideBalance)}
              </p>
              <span className="text-xs text-slate-400 mt-1 block">
                Akumulasi seluruh rekening bank & dompet digital aktif ({totals.activeCount} akun)
              </span>
            </div>

            <div className="flex items-center gap-2">
              {accounts.length > 0 && (
                <button
                  onClick={handleClearAllAccounts}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-900/30 text-xs font-semibold transition-colors"
                  title="Bersihkan Semua Akun"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bersihkan</span>
                </button>
              )}

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs transition-all shadow-sm shadow-indigo-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Akun</span>
              </button>
            </div>
          </div>

          {/* Subtotal Saldo Suami vs Istri */}
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
            <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-white/5">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Saldo Suami
              </span>
              <p className="text-base font-bold text-white truncate">
                {formatMaskedRupiah(totals.suamiTotal, isHideBalance)}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-white/5">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                Saldo Istri
              </span>
              <p className="text-base font-bold text-white truncate">
                {formatMaskedRupiah(totals.istriTotal, isHideBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'all'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Semua Akun ({accounts.length})
          </button>

          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'suami'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Akun Suami ({accounts.filter((a) => a.owner === 'suami').length})
          </button>

          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'istri'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Akun Istri ({accounts.filter((a) => a.owner === 'istri').length})
          </button>

          <button
            onClick={fetchAccounts}
            title="Refresh saldo akun"
            className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white ml-auto shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Kartu Saldo */}
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl bg-slate-900/40 border border-slate-800/80 my-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/40 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Wallet className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-base">
              Belum Ada Rekening / Dompet Digital
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Data tab My Wallet telah bersih dari nol. Klik tombol "+ Tambah Akun" di atas untuk mendaftarkan rekening atau e-wallet keluarga Anda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
