'use client';

// ==============================================================================
// ACCOUNTS PAGE: src/app/accounts/page.tsx
// Monitor Rekening Tunggal Suami (Read-Only, Kendali Penuh via Telegram)
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
} from 'lucide-react';

export interface AccountBalanceItem {
  id: string;
  name: string;
  type: 'bank' | 'ewallet';
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
}

export default function AccountsPage() {
  const { isHideBalance, togglePrivacy } = usePrivacy();
  const [accounts, setAccounts] = useState<AccountBalanceItem[]>([]);
  const [displayName, setDisplayName] = useState<string>('Kepala Keluarga (Suami)');
  const [loading, setLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, household_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.household_id) {
          setDisplayName(profile.display_name || 'Kepala Keluarga (Suami)');
          const syncedAccounts = await syncAllHouseholdAccountBalances(supabase, profile.household_id);
          setAccounts(
            syncedAccounts
              .filter((a) => a.is_active)
              .map((a) => ({
                id: a.id,
                name: a.name,
                type: a.type,
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

    const supabase = createClient();
    const channel = supabase
      .channel('realtime:accounts_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, () => {
        fetchAccounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAccounts]);

  const totalCash = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0),
    [accounts]
  );

  return (
    <AppShell userRole="suami" displayName={displayName}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-main)]">
              Dompet &amp; Akun (Suami)
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Pantauan saldo real-time seluruh rekening aktif keluarga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePrivacy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)]"
            >
              {isHideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isHideBalance ? 'Tampilkan' : 'Sensor'}</span>
            </button>

            <button
              type="button"
              onClick={fetchAccounts}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>
          </div>
        </div>

        <div className="rounded-3xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-[var(--text-muted)] block">Total Kas Tersedia</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] angka-keuangan mt-1 block">
              {formatMaskedRupiah(totalCash, isHideBalance)}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)]">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
          <Bot className="w-4 h-4 shrink-0" />
          <span>
            Tambah rekening, ubah saldo, atau satukan rekening dikendalikan penuh lewat Telegram Bot: ketik <code>/pengaturan</code> &rarr; <strong>Rekening</strong>.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="rounded-3xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)]">
                    {acc.type === 'bank' ? <Building2 className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-main)]">{acc.name}</h3>
                    <span className="text-[11px] text-[var(--text-muted)] uppercase">{acc.type}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-color)]">
                <span className="text-[11px] text-[var(--text-muted)] block">Saldo Real-Time</span>
                <span className="text-lg font-extrabold text-[var(--text-main)] angka-keuangan">
                  {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
