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
        {/* Header Ringkasan & Tanggal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)] tracking-tight">
              Ringkasan Finansial
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {formatFullWIB(new Date())}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={togglePrivacy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-[var(--text-main)] hover:bg-[var(--surface-2)] text-xs font-medium transition-colors"
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
              className="p-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Notifikasi Pending Minimalis (Hanya Muncul Jika Ada Transaksi Pending) */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-between p-3.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2.5 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span>
                Ada <strong className="font-semibold">{pendingCount} transaksi</strong> di Inbox menunggu verifikasi kategori.
              </span>
            </div>
            <Link
              href="/inbox"
              className="text-xs font-semibold text-amber-800 dark:text-amber-200 hover:underline flex items-center gap-1 shrink-0 ml-3"
            >
              <span>Verifikasi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* =========================================================================
            KARTU UTAMA: SALDO TOTAL KAS KELUARGA & ARUS KAS BULAN INI
            ========================================================================= */}
        <div className="rounded-2xl p-6 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
          {/* Baris Atas: Total Saldo Kas & Pembagian Suami / Istri */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <span className="text-xs font-medium text-[var(--text-muted)] block">
                Total Kas Keluarga
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl sm:text-4xl font-extrabold text-[var(--text-main)] tracking-tight angka-keuangan">
                  {formatMaskedRupiah(balanceSummary.totalAll, isHideBalance)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Akumulasi seluruh rekening bank & dompet digital aktif
              </p>
            </div>

            {/* Sub-alokasi Kas Suami & Istri */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-2 lg:pt-0">
              <div className="px-3.5 py-2 rounded-xl bg-[var(--surface-2)] flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Kas Suami
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text-main)] angka-keuangan">
                    {formatMaskedRupiah(balanceSummary.totalSuami, isHideBalance)}
                  </span>
                </div>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-[var(--surface-2)] flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Kas Istri
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-[var(--text-main)] angka-keuangan">
                    {formatMaskedRupiah(balanceSummary.totalIstri, isHideBalance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Garis Pemisah Halus */}
          <div className="my-5 border-t border-[var(--border-color)]" />

          {/* Arus Kas Bulan Ini (Inline 3 Kolom Bersih) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-medium">
                <ArrowDownLeft className="w-3.5 h-3.5 text-[var(--color-income)]" />
                <span>Pemasukan Bulan Ini</span>
              </span>
              <p className="text-base sm:text-lg font-bold text-[var(--color-income)] mt-1 angka-keuangan">
                +{formatMaskedRupiah(cashflowSummary.monthlyIn, isHideBalance)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-medium">
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--color-expense)]" />
                <span>Pengeluaran Bulan Ini</span>
              </span>
              <p className="text-base sm:text-lg font-bold text-[var(--color-expense)] mt-1 angka-keuangan">
                -{formatMaskedRupiah(cashflowSummary.monthlyOut, isHideBalance)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-2)]">
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-medium">
                <TrendingUp className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Arus Kas Bersih (Net)</span>
              </span>
              <p className={`text-base sm:text-lg font-bold mt-1 angka-keuangan ${
                cashflowSummary.net >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
              }`}>
                {cashflowSummary.net >= 0 ? '+' : ''}{formatMaskedRupiah(cashflowSummary.net, isHideBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* =========================================================================
            BAGIAN: REKENING & DOMPET DIGITAL
            ========================================================================= */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)]">
                Rekening & Dompet Digital
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Saldo aktif di perbankan dan e-wallet
              </p>
            </div>
            <Link
              href="/accounts"
              className="text-xs font-semibold text-[var(--accent-color)] hover:opacity-80 flex items-center gap-0.5"
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
                  className="p-3.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isBank ? (
                        <Building2 className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                      ) : (
                        <Smartphone className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                      )}
                      <span className="text-xs font-semibold text-[var(--text-main)] truncate">
                        {acc.name}
                      </span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[var(--surface-2)] text-[var(--text-muted)]">
                      {acc.owner === 'suami' ? 'Suami' : 'Istri'}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-[var(--text-main)] tracking-tight angka-keuangan">
                    {formatMaskedRupiah(acc.current_balance, isHideBalance)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* =========================================================================
            BAGIAN: RIWAYAT TRANSAKSI TERKINI
            ========================================================================= */}
        <div className="rounded-2xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)]">
                Riwayat Transaksi Terkini
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Catatan aktivitas finansial terbaru
              </p>
            </div>

            <Link
              href="/inbox"
              className="text-xs font-semibold text-[var(--accent-color)] hover:opacity-80 flex items-center gap-0.5"
            >
              <span>Lihat Semua</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-10 px-4 rounded-xl bg-[var(--surface-2)]">
              <Clock className="w-7 h-7 text-[var(--text-muted)] mx-auto mb-2 opacity-60" />
              <h4 className="text-xs font-semibold text-[var(--text-main)]">
                Belum Ada Riwayat Transaksi
              </h4>
              <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
                Saat transaksi tercatat dari HP, aktivitas terbaru akan otomatis tampil di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
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
                    className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIncome
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isIncome ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-semibold text-[var(--text-main)] truncate">
                          {tx.merchant || 'Transaksi Digital'}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--text-muted)]">
                          <span>{accountName} ({ownerLabel})</span>
                          <span>•</span>
                          <span>{formatRelativeWIB(tx.transaction_date)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs sm:text-sm font-bold tracking-tight angka-keuangan ${
                          isIncome
                            ? 'text-[var(--color-income)]'
                            : 'text-[var(--color-expense)]'
                        }`}
                      >
                        {isIncome ? '+' : '-'}{formatMaskedRupiah(tx.amount, isHideBalance)}
                      </p>
                      <span
                        className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                          tx.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                            : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
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
