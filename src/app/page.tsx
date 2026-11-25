'use client';

// ==============================================================================
// DASHBOARD UTAMA: src/app/page.tsx
// Penjabaran Visual Grafik & Perputaran Keuangan Keluarga (Strictly Read-Only)
// Identik di Website & Aplikasi HP Android — Seluruh Edit via Telegram Bot
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import CashflowRotationSection from '@/components/dashboard/CashflowRotationSection';
import RealtimeToast, { ToastTransactionData } from '@/components/inbox/RealtimeToast';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import type { TransactionItem } from '@/types/transaction';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import { formatRelativeWIB } from '@/lib/utils';
import { getMonthlyRange } from '@/lib/date-utils';
import { syncAllHouseholdAccountBalances } from '@/lib/account-balance';
import { deduplicateSimultaneousExpenses } from '@/lib/telegram/commands';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Smartphone,
  Eye,
  EyeOff,
  ChevronRight,
  RefreshCw,
  Bot,
  FileSpreadsheet,
} from 'lucide-react';

interface AccountSummary {
  id: string;
  name: string;
  type: 'bank' | 'ewallet';
  current_balance: number;
}

export default function DashboardPage() {
  const { isHideBalance, togglePrivacy } = usePrivacy();
  const [displayName, setDisplayName] = useState<string>('Kepala Keluarga (Suami)');
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [cycleTransactions, setCycleTransactions] = useState<TransactionItem[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [cycleLabel, setCycleLabel] = useState<string>('Bulan Ini');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [currentHouseholdId, setCurrentHouseholdId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [incomingToast, setIncomingToast] = useState<ToastTransactionData | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setLoading(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.household_id) return;
      setDisplayName(profile.display_name || 'Kepala Keluarga (Suami)');
      setCurrentHouseholdId(profile.household_id);

      const { data: settingData } = await supabase
        .from('settings')
        .select('month_start_day, spreadsheet_url')
        .eq('household_id', profile.household_id)
        .maybeSingle();

      const monthStartDay = settingData?.month_start_day || 1;
      setSpreadsheetUrl(settingData?.spreadsheet_url || null);
      const dateRange = getMonthlyRange(0, monthStartDay);
      setCycleLabel(dateRange.label);

      const [syncedAccounts, txCycleRes, txRecentRes, pendRes] = await Promise.all([
        syncAllHouseholdAccountBalances(supabase, profile.household_id),
        supabase
          .from('transactions')
          .select('id, account_id, category_id, amount, direction, merchant, raw_notification, source_device, transaction_date, status, parse_method, notes, accounts(name), categories(name)')
          .eq('household_id', profile.household_id)
          .neq('status', 'ignored')
          .gte('transaction_date', dateRange.startDate.toISOString())
          .lte('transaction_date', dateRange.endDate.toISOString())
          .order('transaction_date', { ascending: false }),
        supabase
          .from('transactions')
          .select('id, account_id, category_id, amount, direction, merchant, raw_notification, source_device, transaction_date, status, parse_method, notes, accounts(name), categories(name)')
          .eq('household_id', profile.household_id)
          .neq('status', 'ignored')
          .order('transaction_date', { ascending: false })
          .limit(8),
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', profile.household_id)
          .eq('status', 'pending'),
      ]);

      setAccounts(
        syncedAccounts
          .filter((a) => a.is_active)
          .map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            current_balance: a.current_balance,
          }))
      );

      setPendingCount(pendRes.count || 0);

      const rawCycle = (txCycleRes.data || []) as unknown as TransactionItem[];
      const reconciledOut = rawCycle.filter((t) => t.status === 'reconciled' && t.direction === 'out');
      const dedupedOut = await deduplicateSimultaneousExpenses(
        supabase,
        profile.household_id,
        reconciledOut as never[],
        null
      );
      const keepOutIds = new Set(dedupedOut.map((d) => d.id));
      const cleanCycle = rawCycle.filter(
        (t) => !(t.status === 'reconciled' && t.direction === 'out' && t.id && !keepOutIds.has(t.id))
      );

      setCycleTransactions(cleanCycle);
      setRecentTransactions((txRecentRes.data || []) as unknown as TransactionItem[]);
    } catch (err) {
      console.warn('Gagal memuat beranda:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !currentHouseholdId) return;
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:dashboard_home')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `household_id=eq.${currentHouseholdId}` },
        (payload) => {
          const newTx = payload.new as TransactionItem;
          if (newTx.status === 'ignored') return;
          setIncomingToast({
            id: newTx.id,
            amount: newTx.amount,
            direction: newTx.direction,
            merchant: newTx.merchant || 'Transaksi Baru',
            accountName: 'Rekening Suami',
            sourceDevice: 'suami',
          });
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts', filter: `household_id=eq.${currentHouseholdId}` },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentHouseholdId, fetchData]);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0),
    [accounts]
  );

  return (
    <AppShell userRole="suami" displayName={displayName} pendingCount={pendingCount}>
      {incomingToast && (
        <RealtimeToast
          data={incomingToast}
          onClose={() => setIncomingToast(null)}
          onViewDetail={() => {
            setIncomingToast(null);
          }}
        />
      )}

      <TransactionDetailModal
        transaction={detailTransaction}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <div className="space-y-6">
        {/* Top Hero: Total Kas + Info Telegram & Spreadsheet */}
        <section className="rounded-3xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-[var(--text-muted)] block">
                Total Kas Keluarga (Akun Tunggal Suami)
              </span>
              <div className="flex items-center gap-2.5 mt-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] angka-keuangan">
                  {formatMaskedRupiah(totalBalance, isHideBalance)}
                </h1>
                <button
                  type="button"
                  onClick={togglePrivacy}
                  aria-label="Toggle Privasi Nominal"
                  className="p-1.5 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  {isHideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {spreadsheetUrl && (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Buka Spreadsheet</span>
                </a>
              )}
              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>

          {/* Daftar Saldo Rekening Aktif */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="p-3 rounded-2xl bg-[var(--surface-2)]/70 border border-[var(--border-color)] flex items-center gap-2.5"
              >
                <div className="p-2 rounded-xl bg-[var(--surface-1)] text-[var(--accent-color)] shrink-0">
                  {acc.type === 'bank' ? <Building2 className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] block truncate">
                    {acc.name}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text-main)] angka-keuangan block truncate">
                    {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-[11px] text-sky-700 dark:text-sky-300 flex items-center gap-2">
            <Bot className="w-4 h-4 shrink-0" />
            <span>
              Dashboard ini khusus tampilan grafik &amp; perputaran keuangan. Pengaturan saldo, kategori, spam filter, dan scan nota dikontrol penuh dari Telegram Bot (<code>/pengaturan</code>).
            </span>
          </div>
        </section>

        {/* Grafik & Perputaran Keuangan Keluarga */}
        <CashflowRotationSection
          transactions={cycleTransactions}
          totalBalance={totalBalance}
          periodLabel={cycleLabel}
        />

        {/* Riwayat Terkini (Read-Only) */}
        <section className="rounded-3xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--text-main)]">Aktivitas Mutasi Terbaru</h2>
            <Link
              href="/inbox"
              className="text-xs font-semibold text-[var(--accent-color)] hover:underline inline-flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-6 text-center">
              Belum ada mutasi transaksi yang tercatat.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {recentTransactions.map((tx) => {
                const isIncome = tx.direction === 'in';
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => {
                      setDetailTransaction(tx);
                      setIsDetailModalOpen(true);
                    }}
                    className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-[var(--surface-2)]/50 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isIncome
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isIncome ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs sm:text-sm font-semibold text-[var(--text-main)] block truncate">
                          {tx.merchant || 'Transaksi'}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] block truncate">
                          {tx.accounts?.name || 'Rekening'} • {tx.categories?.name || 'Lainnya'} • {formatRelativeWIB(tx.transaction_date)}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-xs sm:text-sm font-bold angka-keuangan shrink-0 ${
                        isIncome ? 'text-[var(--color-income)]' : 'text-[var(--text-main)]'
                      }`}
                    >
                      {isIncome ? '+' : '-'} {formatMaskedRupiah(tx.amount, isHideBalance)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
