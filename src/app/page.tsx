'use client';

// ==============================================================================
// DASHBOARD UTAMA: src/app/page.tsx
// Halaman Beranda Finansial Keluarga — Desain Profesional & Bersih
// - Ringkasan Total Saldo Kas Keluarga (dengan Fitur Sensor / Sembunyikan Saldo)
// - Arus Kas Bulan Ini (Pemasukan vs Pengeluaran)
// - Ringkasan Saldo Akun Bank & E-Wallet
// - Recent History (Riwayat Transaksi Terkini)
// - Notifikasi Realtime Pop-up & Modal Detail
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import RealtimeToast, { ToastTransactionData } from '@/components/inbox/RealtimeToast';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import QuickEditModal from '@/components/inbox/QuickEditModal';
import { TransactionItem } from '@/components/inbox/TransactionCard';
import { Category } from '@/components/inbox/CategoryChipList';
import { usePrivacy, formatMaskedRupiah } from '@/lib/privacy';
import { formatFullWIB, formatRelativeWIB } from '@/lib/utils';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Smartphone,
  Eye,
  EyeOff,
  Clock,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  Wallet,
  Bot,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

interface AccountSummary {
  id: string;
  name: string;
  type: 'bank' | 'ewallet';
  owner: 'suami' | 'istri';
  current_balance: number;
}

const defaultCategories: Category[] = [
  { id: 'cat-1', name: 'Belanja Dapur', type: 'expense', sort_order: 1 },
  { id: 'cat-2', name: 'Makan & Jajan', type: 'expense', sort_order: 2 },
  { id: 'cat-3', name: 'Transportasi/Bensin', type: 'expense', sort_order: 3 },
  { id: 'cat-4', name: 'Tagihan & Utilitas', type: 'expense', sort_order: 4 },
  { id: 'cat-5', name: 'Anak', type: 'expense', sort_order: 5 },
  { id: 'cat-6', name: 'Kesehatan', type: 'expense', sort_order: 6 },
  { id: 'cat-7', name: 'Hiburan', type: 'expense', sort_order: 7 },
  { id: 'cat-8', name: 'Belanja Online', type: 'expense', sort_order: 8 },
  { id: 'cat-9', name: 'Transfer Keluarga', type: 'expense', sort_order: 9 },
  { id: 'cat-10', name: 'Lain-lain', type: 'expense', sort_order: 10 },
  { id: 'cat-11', name: 'Gaji/Pemasukan', type: 'income', sort_order: 11 },
];

export default function DashboardPage() {
  const router = useRouter();
  const { isHideBalance, togglePrivacy } = usePrivacy();

  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);

  // Pop-up States
  const [incomingToast, setIncomingToast] = useState<ToastTransactionData | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Profil Pengguna
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, display_name, household_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setUserRole(profile.role);
        setDisplayName(profile.display_name);

        const householdId = profile.household_id;

        // 2. Daftar Akun & Saldo
        const { data: accData } = await supabase
          .from('accounts')
          .select('id, name, type, owner, initial_balance, balance')
          .eq('household_id', householdId)
          .eq('is_active', true)
          .order('owner', { ascending: true });

        if (accData) {
          setAccounts(
            accData.map((a: any) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              owner: a.owner,
              current_balance: Number(a.balance ?? a.initial_balance ?? 0),
            }))
          );
        }

        // 3. Riwayat Transaksi Terkini (Recent History: 10 transaksi terakhir)
        const { data: txData } = await supabase
          .from('transactions')
          .select(`
            id, household_id, account_id, category_id, amount, direction,
            merchant, raw_notification, source_device, transaction_date,
            status, dedupe_hash, needs_review, created_at,
            accounts (name, type)
          `)
          .eq('household_id', householdId)
          .order('transaction_date', { ascending: false })
          .limit(10);

        if (txData) {
          const normalized = txData.map((item: any) => ({
            ...item,
            accounts: Array.isArray(item.accounts) ? item.accounts[0] : item.accounts,
          }));
          setRecentTransactions(normalized);
        }

        // 4. Hitung Jumlah Pending untuk Badge
        const { count: pendingTotal } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', householdId)
          .eq('status', 'pending');

        setPendingCount(pendingTotal || 0);

        // 5. Kategori
        const { data: catData } = await supabase
          .from('categories')
          .select('id, name, type, sort_order')
          .order('sort_order', { ascending: true });

        if (catData && catData.length > 0) {
          setCategories(catData);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat data dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured()) return;

    // Realtime Listener
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const newTx = payload.new as any;
          setIncomingToast({
            id: newTx.id,
            merchant: newTx.merchant || 'Transaksi Digital',
            amount: Number(newTx.amount) || 0,
            direction: newTx.direction || 'out',
            sourceDevice: newTx.source_device || 'suami',
            accountName: newTx.raw_notification?.match(/via\s+([A-Za-z0-9]+)/i)?.[1],
            rawNotification: newTx.raw_notification,
          });
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'raw_notifications' },
        (payload) => {
          const raw = payload.new as any;
          const app = raw.app_name || 'Bank';
          const title = raw.title || '';
          const content = raw.content || '';
          const amountMatch = content.match(/Rp\s*([0-9.,]+)/i);
          const rawAmount = amountMatch ? parseInt(amountMatch[1].replace(/[.,]/g, ''), 10) : 0;
          const isTransferMasuk = /masuk|terima|kredit|berhasil ditransfer ke/i.test(title + ' ' + content);

          setIncomingToast({
            id: raw.id,
            merchant: title || app,
            amount: rawAmount,
            direction: isTransferMasuk ? 'in' : 'out',
            sourceDevice: raw.device_id === 'hp_istri' ? 'istri' : 'suami',
            accountName: app,
            rawNotification: `${title}: ${content}`,
          });
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Kalkulasi Total Saldo
  const balanceSummary = useMemo(() => {
    let totalAll = 0;
    let totalSuami = 0;
    let totalIstri = 0;

    accounts.forEach((acc) => {
      const bal = Number(acc.current_balance || 0);
      totalAll += bal;
      if (acc.owner === 'suami') totalSuami += bal;
      else totalIstri += bal;
    });

    return { totalAll, totalSuami, totalIstri };
  }, [accounts]);

  // Kalkulasi Cashflow dari Transaksi Reconciled
  const cashflowSummary = useMemo(() => {
    let monthlyIn = 0;
    let monthlyOut = 0;

    recentTransactions.forEach((tx) => {
      if (tx.status === 'reconciled') {
        const amt = Number(tx.amount || 0);
        if (tx.direction === 'in') monthlyIn += amt;
        else monthlyOut += amt;
      }
    });

    return { monthlyIn, monthlyOut, net: monthlyIn - monthlyOut };
  }, [recentTransactions]);

  // Tindakan Kategori dari Modal Detail
  const handleCategorize = async (transactionId: string, categoryId: string) => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .update({
          category_id: categoryId,
          status: 'reconciled',
          needs_review: false,
        })
        .eq('id', transactionId);
    }
    fetchData();
  };

  const handleIgnore = async (transactionId: string) => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .update({ status: 'ignored' })
        .eq('id', transactionId);
    }
    fetchData();
  };

  const handleUpdate = async (
    transactionId: string,
    amount: number,
    merchant: string,
    direction: 'out' | 'in'
  ) => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .update({ amount, merchant, direction, needs_review: false })
        .eq('id', transactionId);
    }
    fetchData();
  };

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={pendingCount}
    >
      <div className="space-y-6">
        {/* Header Ringkasan & Waktu */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] tracking-tight">
                Ringkasan Eksekutif Finansial
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {formatFullWIB(new Date())} • Mode Tampilan Monitor / Laptop
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
              onClick={fetchData}
              title="Muat ulang data"
              className="p-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Notifikasi Transaksi Pending Jika Ada */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-between p-3.5 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2.5 text-xs font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>
                Terdapat <strong className="font-bold">{pendingCount} transaksi</strong> di Inbox membutuhkan verifikasi atau pengelompokan.
              </span>
            </div>
            <Link
              href="/inbox"
              className="text-xs font-bold text-amber-800 dark:text-amber-200 hover:underline flex items-center gap-1 shrink-0 ml-3"
            >
              <span>Verifikasi di Inbox</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* =========================================================================
            BARIS 1: 4 KARTU KPI SEJAJAR DI DESKTOP (WIDESCREEN 4-COL GRID)
            ========================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Total Kas Siap Pakai */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Total Kas Siap Pakai</span>
                <Wallet className="w-4 h-4 text-[var(--accent-color)]" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mt-2 tracking-tight angka-keuangan">
                {formatMaskedRupiah(balanceSummary.totalAll, isHideBalance)}
              </p>
            </div>

            {/* Split Bar Proporsi Kas Suami & Istri */}
            <div className="mt-4 pt-3 border-t border-[var(--border-color)]">
              <div className="w-full h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden flex">
                <div
                  className="bg-[var(--accent-color)] h-full transition-all"
                  style={{
                    width: `${balanceSummary.totalAll > 0 ? (balanceSummary.totalSuami / balanceSummary.totalAll) * 100 : 50}%`,
                  }}
                  title="Porsi Kas Suami"
                />
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{
                    width: `${balanceSummary.totalAll > 0 ? (balanceSummary.totalIstri / balanceSummary.totalAll) * 100 : 50}%`,
                  }}
                  title="Porsi Kas Istri"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mt-1.5 font-medium">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" />
                  Suami: <strong className="angka-keuangan text-[var(--text-main)]">{formatMaskedRupiah(balanceSummary.totalSuami, isHideBalance)}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Istri: <strong className="angka-keuangan text-[var(--text-main)]">{formatMaskedRupiah(balanceSummary.totalIstri, isHideBalance)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* KPI 2: Pemasukan Bulan Ini */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Pemasukan Bulan Ini</span>
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[var(--color-income)] mt-2 tracking-tight angka-keuangan">
                +{formatMaskedRupiah(cashflowSummary.monthlyIn, isHideBalance)}
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-4 pt-3 border-t border-[var(--border-color)]">
              Gaji, bonus kantor, dan transfer luar terverifikasi
            </p>
          </div>

          {/* KPI 3: Pengeluaran Bulan Ini */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Pengeluaran Bulan Ini</span>
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-[var(--color-expense)] mt-2 tracking-tight angka-keuangan">
                -{formatMaskedRupiah(cashflowSummary.monthlyOut, isHideBalance)}
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-4 pt-3 border-t border-[var(--border-color)]">
              Total belanja riil (di luar perpindahan kas internal)
            </p>
          </div>

          {/* KPI 4: Arus Kas Bersih (Net Cash Flow) */}
          <div className="p-5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Arus Kas Bersih (Net)</span>
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <p className={`text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight angka-keuangan ${
                cashflowSummary.net >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
              }`}>
                {cashflowSummary.net >= 0 ? '+' : ''}{formatMaskedRupiah(cashflowSummary.net, isHideBalance)}
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-4 pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
              <span>Status Arus Kas:</span>
              <strong className={cashflowSummary.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                {cashflowSummary.net >= 0 ? 'Surplus Terkendali' : 'Defisit Anggaran'}
              </strong>
            </p>
          </div>
        </div>

        {/* =========================================================================
            BARIS 2: 12-KOLOM BENTO GRID (8 KOLOM KIRI + 4 KOLOM KANAN)
            ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* KOLOM KIRI (8 Kolom): Tabel Mutasi Terkini Widescreen */}
          <div className="lg:col-span-8 rounded-2xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-[var(--text-main)] tracking-tight">
                  Riwayat Mutasi Terkini
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  10 transaksi terakhir yang dicatat otomatis oleh sistem
                </p>
              </div>

              <Link
                href="/inbox"
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent-color)] hover:opacity-80 transition-opacity"
              >
                <span>Buka Ledger Penuh</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {recentTransactions.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-xl bg-[var(--surface-2)]">
                <Clock className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
                <h4 className="text-xs font-semibold text-[var(--text-main)]">
                  Belum Ada Riwayat Transaksi
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
                  Setiap mutasi yang masuk dari notifikasi HP akan langsung terpampang rapi di tabel ini secara realtime.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      <th className="py-2.5 px-3">Transaksi / Merchant</th>
                      <th className="py-2.5 px-3">Rekening</th>
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-xs">
                    {recentTransactions.map((tx) => {
                      const isIncome = tx.direction === 'in';
                      const accountName = tx.accounts?.name || 'Rekening';
                      const ownerLabel = tx.source_device === 'suami' ? 'Suami' : 'Istri';

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => {
                            setDetailTransaction(tx);
                            setIsDetailModalOpen(true);
                          }}
                          className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors group"
                        >
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  isIncome
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {isIncome ? (
                                  <ArrowDownLeft className="w-3.5 h-3.5" />
                                ) : (
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <span className="font-semibold text-[var(--text-main)] group-hover:text-[var(--accent-color)] transition-colors">
                                {tx.merchant || 'Transaksi Digital'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[var(--text-muted)]">
                            <span>{accountName}</span>
                            <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
                              {ownerLabel}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[var(--text-muted)]">
                            {formatRelativeWIB(tx.transaction_date)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                tx.status === 'pending'
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {tx.status === 'pending' ? 'Pending' : 'Reconciled'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`font-bold tracking-tight angka-keuangan ${
                                isIncome ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
                              }`}
                            >
                              {isIncome ? '+' : '-'}{formatMaskedRupiah(tx.amount, isHideBalance)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* KOLOM KANAN (4 Kolom): Status Dompet & Pusat Kendali Telegram */}
          <div className="lg:col-span-4 space-y-4">
            {/* Panel 1: Saldo Rekening & Dompet */}
            <div className="rounded-2xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Rekening & Dompet
                </h3>
                <Link
                  href="/accounts"
                  className="text-xs font-bold text-[var(--accent-color)] hover:underline"
                >
                  Detail
                </Link>
              </div>

              <div className="space-y-2.5">
                {accounts.map((acc) => {
                  const isBank = acc.type === 'bank';
                  const porsi = balanceSummary.totalAll > 0
                    ? Math.round((acc.current_balance / balanceSummary.totalAll) * 100)
                    : 0;

                  return (
                    <div
                      key={acc.id}
                      className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isBank ? (
                          <Building2 className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        ) : (
                          <Smartphone className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-[var(--text-main)] block truncate">
                            {acc.name}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {acc.owner === 'suami' ? 'Suami' : 'Istri'} • {porsi}% dari kas
                          </span>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-[var(--text-main)] angka-keuangan shrink-0">
                        {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panel 2: Pusat Kendali Pengaturan Telegram */}
            <div className="rounded-2xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-[var(--accent-color)]">
                <Bot className="w-5 h-5 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
                  Pusat Pengaturan Telegram
                </h3>
              </div>

              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Seluruh konfigurasi saldo, pagu anggaran, dan rekening dipusatkan di Telegram untuk kemudahan dan konfirmasi aman langsung dari HP:
              </p>

              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Menu Lengkap:</span>
                  <code className="font-bold text-[var(--accent-color)]">/pengaturan</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Ubah Kas:</span>
                  <code className="text-[var(--text-main)]">total kas ganti 1jt</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Ubah Saldo:</span>
                  <code className="text-[var(--text-main)]">set saldo dana 2jt</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)]">Pagu Anggaran:</span>
                  <code className="text-[var(--text-main)]">set anggaran dapur 1jt</code>
                </div>
              </div>

              <p className="text-[11px] text-[var(--text-muted)] italic">
                *Dasbor web ini berfungsi sebagai pemantau monitor penuh (Desktop Monitor) yang otomatis terupdate.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pop-up Notifikasi Realtime */}
      <RealtimeToast
        data={incomingToast}
        onClose={() => setIncomingToast(null)}
        onViewDetail={(item) => {
          const found = recentTransactions.find((t) => t.id === item.id);
          if (found) {
            setDetailTransaction(found);
            setIsDetailModalOpen(true);
          }
        }}
      />

      {/* Pop-up Modal Detail Transaksi */}
      <TransactionDetailModal
        transaction={detailTransaction}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailTransaction(null);
        }}
        categories={categories}
        onCategorize={handleCategorize}
        onIgnore={handleIgnore}
        onEdit={(tx) => setEditingTransaction(tx)}
      />

      {/* Modal Koreksi Transaksi */}
      {editingTransaction && (
        <QuickEditModal
          isOpen={Boolean(editingTransaction)}
          onClose={() => setEditingTransaction(null)}
          onSave={async (amount, merchant, direction) => {
            await handleUpdate(editingTransaction.id, amount, merchant, direction);
            setEditingTransaction(null);
          }}
          initialAmount={editingTransaction.amount}
          initialMerchant={editingTransaction.merchant}
          initialDirection={editingTransaction.direction}
          rawNotification={editingTransaction.raw_notification}
        />
      )}
    </AppShell>
  );
}
