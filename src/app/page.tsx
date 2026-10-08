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
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Inbox,
  BarChart3,
  Target,
  Building2,
  Smartphone,
  Eye,
  EyeOff,
  Clock,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
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
        {/* Header Ringkasan & Salam */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Ringkasan Keuangan Keluarga
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-0.5">
              Halo, {displayName || (userRole === 'suami' ? 'Suami' : 'Istri')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {formatFullWIB(new Date())}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={togglePrivacy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
              title="Sembunyikan atau tampilkan nominal saldo sensitif"
            >
              {isHideBalance ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Saldo Disembunyikan</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sembunyikan Saldo</span>
                </>
              )}
            </button>

            <button
              onClick={fetchData}
              title="Muat ulang data"
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* =========================================================================
            ROW 1: KARTU SALDO TOTAL & ARUS KAS BULAN INI
            ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Kartu Saldo Kas Gabungan */}
          <div className="md:col-span-2 rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Total Kas Keluarga
                </span>
                <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
                  {formatMaskedRupiah(balanceSummary.totalAll, isHideBalance)}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Akumulasi seluruh rekening bank & e-wallet aktif
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            {/* Perincian Kas Suami vs Istri */}
            <div className="grid grid-cols-2 gap-3 pt-4 mt-5 border-t border-slate-100 dark:border-slate-800">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
                  Kas Suami
                </span>
                <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {formatMaskedRupiah(balanceSummary.totalSuami, isHideBalance)}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-0.5">
                  Kas Istri
                </span>
                <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {formatMaskedRupiah(balanceSummary.totalIstri, isHideBalance)}
                </p>
              </div>
            </div>
          </div>

          {/* Kartu Status Inbox Pending */}
          <div className="rounded-3xl p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Status Inbox
                </span>
                <span className={`w-2 h-2 rounded-full ${pendingCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              </div>

              {pendingCount > 0 ? (
                <>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {pendingCount} Transaksi
                  </h3>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                    Menunggu verifikasi kategori di Inbox.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mt-1">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-bold text-base">Inbox Bersih</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Semua transaksi telah tervalidasi.
                  </p>
                </>
              )}
            </div>

            <Link
              href="/inbox"
              className="mt-5 w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Buka Inbox Transaksi</span>
            </Link>
          </div>
        </div>

        {/* Quick Cashflow Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-medium">Pemasukan Terverifikasi</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
              +{formatMaskedRupiah(cashflowSummary.monthlyIn, isHideBalance)}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-medium">Pengeluaran Terverifikasi</span>
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              -{formatMaskedRupiah(cashflowSummary.monthlyOut, isHideBalance)}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-medium">Arus Kas Bersih (Net)</span>
              <TrendingUp className="w-4 h-4 text-slate-500" />
            </div>
            <p className={`text-base sm:text-lg font-bold ${cashflowSummary.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
              {cashflowSummary.net >= 0 ? '+' : ''}{formatMaskedRupiah(cashflowSummary.net, isHideBalance)}
            </p>
          </div>
        </div>

        {/* =========================================================================
            ROW 2: RINGKASAN SALDO AKUN PERBANKAN & E-WALLET
            ========================================================================= */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Rekening & Dompet Digital
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saldo tersimpan di masing-masing bank dan e-wallet
              </p>
            </div>
            <Link
              href="/accounts"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-0.5"
            >
              <span>Kelola Akun</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {accounts.map((acc) => {
              const isBank = acc.type === 'bank';
              return (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isBank ? (
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {acc.name}
                      </h4>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {acc.owner === 'suami' ? 'Suami' : 'Istri'}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                    {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* =========================================================================
            ROW 3: RIWAYAT AKTIVITAS TERKINI (RECENT HISTORY)
            ========================================================================= */}
        <div className="rounded-3xl p-5 md:p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Riwayat Transaksi Terkini
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aktivitas transaksi terbaru yang tercatat oleh sistem
              </p>
            </div>

            <Link
              href="/inbox"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center gap-0.5"
            >
              <span>Lihat Semua di Inbox</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Belum Ada Riwayat Transaksi
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                Data telah dibersihkan dan siap dimulai dari nol. Saat Anda atau Istri melakukan transfer di HP, transaksi akan otomatis tercatat di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.map((tx) => {
                const isIncome = tx.direction === 'in';
                const accountName = tx.accounts?.name || 'Rekening';
                const ownerLabel = tx.source_device === 'suami' ? 'Suami' : 'Istri';

                return (
                  <div
                    key={tx.id}
                    onClick={() => {
                      setDetailTransaction(tx);
                      setIsDetailModalOpen(true);
                    }}
                    className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                          isIncome
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {tx.merchant || 'Transaksi Digital'}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{accountName} ({ownerLabel})</span>
                          <span>•</span>
                          <span>{formatRelativeWIB(tx.transaction_date)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs sm:text-sm font-bold tracking-tight ${
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {isIncome ? '+' : '-'}{formatMaskedRupiah(tx.amount, isHideBalance)}
                      </p>
                      <span
                        className={`inline-block text-[10px] font-medium px-2 py-0.2 rounded-full mt-0.5 ${
                          tx.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {tx.status === 'pending' ? 'Pending' : 'Tervalidasi'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* =========================================================================
            ROW 4: PINTASAN PANDUAN MODUL LAINNYA
            ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/inbox"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors shadow-xs group"
          >
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-fit mb-2">
              <Inbox className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Inbox Transaksi
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Verifikasi & kategorisasi notifikasi bank masuk.
            </p>
          </Link>

          <Link
            href="/budget"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors shadow-xs group"
          >
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-fit mb-2">
              <Target className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Atur Budget
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Alokasi batas belanja per kategori & pantau sisa.
            </p>
          </Link>

          <Link
            href="/rekap"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors shadow-xs group"
          >
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-fit mb-2">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Rekapitulasi
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Grafik tren mingguan, bulanan & perbandingan kas.
            </p>
          </Link>

          <Link
            href="/accounts"
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-colors shadow-xs group"
          >
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-fit mb-2">
              <Building2 className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Kelola Akun
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Penyesuaian saldo awal & audit selisih kas fisik.
            </p>
          </Link>
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
