'use client';

// ==============================================================================
// ACCOUNTS PAGE: src/app/accounts/page.tsx
// Desktop Financial Portfolio Monitor (Mode Monitor & Laptop)
// Seluruh mutasi & pengaturan dipusatkan di Telegram Bot (/pengaturan)
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import { syncAllHouseholdAccountBalances } from '@/lib/account-balance';
import {
  Wallet,
  RefreshCw,
  Eye,
  EyeOff,
  Building2,
  Smartphone,
  Bot,
  CheckCircle2,
} from 'lucide-react';

export interface AccountBalanceItem {
  id: string;
  name: string;
  type: 'bank' | 'ewallet';
  owner: 'suami' | 'istri';
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
}

export default function AccountsPage() {
  const { isHideBalance, togglePrivacy } = usePrivacy();
  const [accounts, setAccounts] = useState<AccountBalanceItem[]>([]);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri'>('all');

  // Ambil dan sinkronkan saldo akun dari database Supabase (selaras 100% dengan Telegram & Beranda)
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

          // Sinkronkan secara idempoten (termasuk auto-heal initial_balance lama) agar RPC, kolom balance, dan Telegram identik
          const syncedAccounts = await syncAllHouseholdAccountBalances(supabase, profile.household_id);
          setAccounts(
            syncedAccounts.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              owner: a.owner,
              initial_balance: a.initial_balance,
              current_balance: a.current_balance,
              is_active: a.is_active,
            }))
          );
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

    if (!isSupabaseConfigured()) return;

    // Realtime Listener agar perubahan saldo dari Telegram / halaman lain langsung terpantul otomatis
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:accounts_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        fetchAccounts();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchAccounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAccounts]);

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
      if (!a.is_active) return false;
      if (filterOwner === 'suami') return a.owner === 'suami';
      if (filterOwner === 'istri') return a.owner === 'istri';
      return true;
    });
  }, [accounts, filterOwner]);

  return (
    <AppShell userRole={userRole} displayName={displayName} pendingCount={0}>
      <div className="space-y-6">
        {/* Header Portfolio Monitor */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] tracking-tight">
                Dompet & Portofolio Rekening
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Mode Monitor Laptop
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Pemantauan saldo kas riil perbankan dan e-wallet aktif keluarga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={togglePrivacy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] text-[var(--text-main)] hover:bg-[var(--surface-2)] text-xs font-medium transition-colors shadow-xs"
              title="Sembunyikan atau tampilkan nominal saldo"
            >
              {isHideBalance ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                  <span>Saldo Disensor</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span>Sensor Saldo</span>
                </>
              )}
            </button>

            <button
              onClick={fetchAccounts}
              title="Perbarui saldo akun"
              className="p-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Banner Pusat Kendali Telegram Hub */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[var(--text-main)]">
                Pengaturan Rekening & Saldo Dipusatkan di Telegram
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                Untuk keamanan dan kemudahan di ponsel, penyesuaian saldo kas, penambahan akun, dan penyederhanaan rekening dikonfirmasi langsung via bot Telegram keluarga.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-main)]">
              Menu: <strong className="text-[var(--accent-color)]">/pengaturan</strong>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[11px] font-mono text-[var(--text-main)]">
              Koreksi: <code className="text-[var(--accent-color)]">total kas ganti 1jt</code>
            </div>
          </div>
        </div>

        {/* Ringkasan Kas Desktop (3 Kartu Monokrom Widescreen) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Kas */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">Total Kas Siap Pakai</span>
              <Wallet className="w-4 h-4 text-[var(--accent-color)]" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mt-2 tracking-tight angka-keuangan">
              {formatMaskedRupiah(totals.grandTotal, isHideBalance)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-color)]">
              Akumulasi dari {totals.activeCount} rekening aktif
            </p>
          </div>

          {/* Kas Suami */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">Kas Suami (Kepala Keluarga)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-color)]" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mt-2 tracking-tight angka-keuangan">
              {formatMaskedRupiah(totals.suamiTotal, isHideBalance)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-color)] flex items-center justify-between">
              <span>Porsi Kas:</span>
              <strong className="text-[var(--accent-color)]">
                {totals.grandTotal > 0 ? Math.round((totals.suamiTotal / totals.grandTotal) * 100) : 0}%
              </strong>
            </p>
          </div>

          {/* Kas Istri */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">Kas Istri (Bendahara)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mt-2 tracking-tight angka-keuangan">
              {formatMaskedRupiah(totals.istriTotal, isHideBalance)}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] mt-3 pt-2.5 border-t border-[var(--border-color)] flex items-center justify-between">
              <span>Porsi Kas:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                {totals.grandTotal > 0 ? Math.round((totals.istriTotal / totals.grandTotal) * 100) : 0}%
              </strong>
            </p>
          </div>
        </div>

        {/* Filter Bar Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'all'
                ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] border-[var(--accent-color)] shadow-xs'
                : 'bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
            }`}
          >
            Semua Rekening ({accounts.filter((a) => a.is_active).length})
          </button>

          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'suami'
                ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] border-[var(--accent-color)] shadow-xs'
                : 'bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
            }`}
          >
            Rekening Suami ({accounts.filter((a) => a.owner === 'suami' && a.is_active).length})
          </button>

          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              filterOwner === 'istri'
                ? 'bg-[var(--accent-color)] text-white dark:text-[#121218] border-[var(--accent-color)] shadow-xs'
                : 'bg-[var(--surface-1)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)]'
            }`}
          >
            Rekening Istri ({accounts.filter((a) => a.owner === 'istri' && a.is_active).length})
          </button>
        </div>

        {/* Grid Portofolio Rekening Widescreen 3-Kolom Desktop */}
        {filteredAccounts.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
            <Wallet className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
            <h3 className="font-bold text-[var(--text-main)] text-base">
              Belum Ada Rekening Terdaftar
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
              Gunakan bot Telegram untuk menambahkan rekening baru dengan perintah:
              <code className="block mt-1 font-mono text-[var(--accent-color)]">tambah akun &lt;nama&gt; &lt;suami/istri&gt; &lt;saldo&gt;</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts.map((acc) => {
              const isBank = acc.type === 'bank';
              const porsi = totals.grandTotal > 0
                ? Math.round((acc.current_balance / totals.grandTotal) * 100)
                : 0;

              return (
                <div
                  key={acc.id}
                  className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-color)] shrink-0">
                          {isBank ? (
                            <Building2 className="w-4 h-4" />
                          ) : (
                            <Smartphone className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-[var(--text-main)] truncate">
                            {acc.name}
                          </h4>
                          <span className="text-[10px] text-[var(--text-muted)] capitalize">
                            {isBank ? 'Perbankan' : 'Dompet Digital'}
                          </span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        acc.owner === 'suami'
                          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {acc.owner === 'suami' ? 'Suami' : 'Istri'}
                      </span>
                    </div>

                    <div className="mt-4">
                      <span className="text-[10px] font-medium text-[var(--text-muted)] block">
                        Saldo Saat Ini:
                      </span>
                      <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-main)] mt-0.5 tracking-tight angka-keuangan">
                        {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[var(--border-color)] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span>Porsi Kas Keluarga:</span>
                      <strong className="text-[var(--text-main)]">{porsi}%</strong>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                      <span>Atur via Bot:</span>
                      <code className="text-[var(--accent-color)]">set saldo {acc.name.toLowerCase()} ...</code>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
