'use client';

// ==============================================================================
// INBOX PAGE: src/app/inbox/page.tsx
// Halaman Inbox Transaksi Pending dengan Realtime, Kategorisasi 1-tap, & Tambah Manual
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import TransactionCard, { TransactionItem } from '@/components/inbox/TransactionCard';
import ManualTransactionModal, { AccountOption } from '@/components/inbox/ManualTransactionModal';
import { Category } from '@/components/inbox/CategoryChipList';
import {
  Inbox as InboxIcon,
  Plus,
  CheckCircle2,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Info,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

// Kategori default
const defaultMockCategories: Category[] = [
  { id: 'cat-1', name: 'Belanja Dapur', type: 'expense', icon: 'shopping-cart', sort_order: 1 },
  { id: 'cat-2', name: 'Makan & Jajan', type: 'expense', icon: 'utensils', sort_order: 2 },
  { id: 'cat-3', name: 'Transportasi/Bensin', type: 'expense', icon: 'fuel', sort_order: 3 },
  { id: 'cat-4', name: 'Tagihan & Utilitas', type: 'expense', icon: 'zap', sort_order: 4 },
  { id: 'cat-5', name: 'Anak', type: 'expense', icon: 'baby', sort_order: 5 },
  { id: 'cat-6', name: 'Kesehatan', type: 'expense', icon: 'heart-pulse', sort_order: 6 },
  { id: 'cat-7', name: 'Hiburan', type: 'expense', icon: 'film', sort_order: 7 },
  { id: 'cat-8', name: 'Belanja Online', type: 'expense', icon: 'shopping-bag', sort_order: 8 },
  { id: 'cat-9', name: 'Transfer Keluarga', type: 'expense', icon: 'send', sort_order: 9 },
  { id: 'cat-10', name: 'Lain-lain', type: 'expense', icon: 'more-horizontal', sort_order: 10 },
  { id: 'cat-11', name: 'Gaji/Pemasukan', type: 'income', icon: 'wallet', sort_order: 11 },
];

// Akun default untuk modal tambah manual
const defaultMockAccounts: AccountOption[] = [
  { id: 'acc-s-1', name: 'BCA', owner: 'suami', type: 'bank' },
  { id: 'acc-s-2', name: 'Mandiri', owner: 'suami', type: 'bank' },
  { id: 'acc-s-3', name: 'GoPay', owner: 'suami', type: 'ewallet' },
  { id: 'acc-s-4', name: 'OVO', owner: 'suami', type: 'ewallet' },
  { id: 'acc-i-1', name: 'BCA', owner: 'istri', type: 'bank' },
  { id: 'acc-i-2', name: 'BRI', owner: 'istri', type: 'bank' },
  { id: 'acc-i-3', name: 'ShopeePay', owner: 'istri', type: 'ewallet' },
  { id: 'acc-i-4', name: 'DANA', owner: 'istri', type: 'ewallet' },
];

// Transaksi sampel demo interaktif jika Supabase belum terhubung
const initialDemoTransactions: TransactionItem[] = [
  {
    id: 'demo-tx-1',
    household_id: 'demo-hh',
    account_id: 'acc-s-1',
    category_id: null,
    amount: 45000,
    direction: 'out',
    merchant: 'KOPI KENANGAN',
    raw_notification: 'QRIS BCA: Pembayaran Rp 45.000 di KOPI KENANGAN BERHASIL tgl 28/09/26',
    source_device: 'suami',
    transaction_date: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'pending',
    dedupe_hash: 'demo-hash-1',
    needs_review: false,
    accounts: { name: 'BCA', type: 'bank' },
  },
  {
    id: 'demo-tx-2',
    household_id: 'demo-hh',
    account_id: 'acc-s-2',
    category_id: null,
    amount: 25000,
    direction: 'out',
    merchant: 'INDOMARET',
    raw_notification: 'Pembayaran QRIS Rp 25.000 di INDOMARET berhasil.',
    source_device: 'suami',
    transaction_date: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'pending',
    dedupe_hash: 'demo-hash-2',
    needs_review: false,
    accounts: { name: 'Mandiri', type: 'bank' },
  },
  {
    id: 'demo-tx-3',
    household_id: 'demo-hh',
    account_id: 'acc-i-3',
    category_id: null,
    amount: 0,
    direction: 'out',
    merchant: 'Perlu Cek Manual',
    raw_notification: 'ShopeePay: Pembayaran belanja berhasil. Terima kasih!',
    source_device: 'istri',
    transaction_date: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    status: 'pending',
    dedupe_hash: 'demo-hash-3',
    needs_review: true,
    accounts: { name: 'ShopeePay', type: 'ewallet' },
  },
  {
    id: 'demo-tx-4',
    household_id: 'demo-hh',
    account_id: 'acc-i-4',
    category_id: null,
    amount: 500000,
    direction: 'in',
    merchant: 'Isi Saldo via BCA OneKlik',
    raw_notification: 'Isi Saldo Rp 500.000 via BCA OneKlik berhasil.',
    source_device: 'istri',
    transaction_date: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    status: 'pending',
    dedupe_hash: 'demo-hash-4',
    needs_review: false,
    accounts: { name: 'DANA', type: 'ewallet' },
  },
];

export default function InboxPage() {
  const [transactions, setTransactions] = useState<TransactionItem[]>(initialDemoTransactions);
  const [categories, setCategories] = useState<Category[]>(defaultMockCategories);
  const [accounts, setAccounts] = useState<AccountOption[]>(defaultMockAccounts);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri' | 'review'>('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  // Ambil data dari Supabase jika env sudah dikonfigurasi
  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setIsCloudConnected(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Profil Pengguna
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
        }
      }

      // 2. Transaksi Pending
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select(`
          id, household_id, account_id, category_id, amount, direction,
          merchant, raw_notification, source_device, transaction_date,
          status, dedupe_hash, needs_review,
          accounts (name, type)
        `)
        .eq('status', 'pending')
        .order('transaction_date', { ascending: false });

      if (!txError && txData) {
        const normalized = txData.map((item: any) => ({
          ...item,
          accounts: Array.isArray(item.accounts) ? item.accounts[0] : item.accounts,
        }));
        setTransactions(normalized);
        setIsCloudConnected(true);
      }

      // 3. Kategori
      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, type, icon, sort_order')
        .order('sort_order', { ascending: true });

      if (catData && catData.length > 0) {
        setCategories(catData);
      }

      // 4. Akun Terdaftar
      const { data: accData } = await supabase
        .from('accounts')
        .select('id, name, owner, type')
        .eq('is_active', true);

      if (accData && accData.length > 0) {
        setAccounts(accData);
      }
    } catch (err) {
      console.warn('Gagal memuat data dari Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured()) return;

    // Setup Supabase Realtime Subscription
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => {
          fetchData();
        }
      )
      .subscribe((status) => {
        setIsRealtimeActive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Aksi 1-tap kategorisasi
  const handleCategorize = async (transactionId: string, categoryId: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));

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
  };

  // Aksi abaikan transaksi (status 'ignored')
  const handleIgnore = async (transactionId: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .update({
          status: 'ignored',
        })
        .eq('id', transactionId);
    }
  };

  // Aksi koreksi nominal / merchant
  const handleUpdate = async (
    transactionId: string,
    amount: number,
    merchant: string,
    direction: 'out' | 'in'
  ) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? { ...t, amount, merchant, direction, needs_review: false }
          : t
      )
    );

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .update({
          amount,
          merchant,
          direction,
          needs_review: false,
        })
        .eq('id', transactionId);
    }
  };

  // Aksi tambah transaksi manual
  const handleAddManual = async (data: {
    accountId: string;
    amount: number;
    direction: 'out' | 'in';
    merchant: string;
    categoryId?: string;
    transactionDate: string;
    sourceDevice: 'suami' | 'istri';
  }) => {
    const targetAccount = accounts.find((a) => a.id === data.accountId);
    const newTx: TransactionItem = {
      id: `manual-${Date.now()}`,
      household_id: 'demo-hh',
      account_id: data.accountId,
      category_id: data.categoryId || null,
      amount: data.amount,
      direction: data.direction,
      merchant: data.merchant,
      raw_notification: `Input Manual: ${data.merchant} (${formatRupiah(data.amount)})`,
      source_device: data.sourceDevice,
      transaction_date: data.transactionDate,
      status: data.categoryId ? 'reconciled' : 'pending',
      dedupe_hash: `manual_${Date.now()}`,
      needs_review: false,
      accounts: targetAccount ? { name: targetAccount.name, type: targetAccount.type } : undefined,
    };

    if (!data.categoryId) {
      setTransactions((prev) => [newTx, ...prev]);
    }

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('transactions')
        .insert({
          account_id: data.accountId,
          category_id: data.categoryId || null,
          amount: data.amount,
          direction: data.direction,
          merchant: data.merchant,
          raw_notification: newTx.raw_notification,
          source_device: data.sourceDevice,
          transaction_date: data.transactionDate,
          status: data.categoryId ? 'reconciled' : 'pending',
          dedupe_hash: newTx.dedupe_hash,
          needs_review: false,
        });
    }
  };

  // Filter transaksi
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (filterOwner === 'suami') return t.source_device === 'suami';
      if (filterOwner === 'istri') return t.source_device === 'istri';
      if (filterOwner === 'review') return t.amount === 0 || t.needs_review;
      return true;
    });
  }, [transactions, filterOwner]);

  // Total ringkasan pending
  const pendingTally = useMemo(() => {
    let outTotal = 0;
    let inTotal = 0;
    let reviewCount = 0;

    transactions.forEach((t) => {
      if (t.amount === 0 || t.needs_review) reviewCount++;
      if (t.direction === 'in') inTotal += Number(t.amount);
      else outTotal += Number(t.amount);
    });

    return { outTotal, inTotal, reviewCount, totalCount: transactions.length };
  }, [transactions]);

  return (
    <>
      <Navbar
        userRole={userRole}
        displayName={displayName}
        pendingCount={pendingTally.totalCount}
        isRealtimeActive={isRealtimeActive || !isCloudConnected}
      />

      <main className="flex-1 pb-24 px-4 pt-4">
        {/* Banner Info jika belum connect ke database Supabase Cloud */}
        {!isCloudConnected && (
          <div className="mb-4 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Mode Pratinjau Interaktif: </span>
              Menampilkan data simulasi agar Anda bisa langsung mencoba fitur kategorisasi 1-tap, filter, koreksi nominal 0, dan tambah manual.
            </div>
          </div>
        )}

        {/* Tally & Quick Action Card */}
        <div className="rounded-3xl p-5 mb-4 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 rounded-full bg-indigo-500/20 blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
                <InboxIcon className="w-4 h-4 text-indigo-200" />
              </span>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
                  Inbox Transaksi
                </h2>
                <p className="text-lg font-extrabold leading-none mt-0.5">
                  {pendingTally.totalCount} Transaksi Pending
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-indigo-950 font-semibold text-xs shadow-md hover:bg-indigo-50 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tambah Manual</span>
            </button>
          </div>

          {/* Quick Stat Bar */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] text-indigo-200/80">Pending Keluar</span>
                <p className="text-xs font-bold">{formatRupiah(pendingTally.outTotal)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] text-indigo-200/80">Pending Masuk</span>
                <p className="text-xs font-bold">{formatRupiah(pendingTally.inTotal)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-4 py-0.5">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filterOwner === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Semua ({transactions.length})
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filterOwner === 'suami'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            👨 Suami ({transactions.filter((t) => t.source_device === 'suami').length})
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              filterOwner === 'istri'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            👩 Istri ({transactions.filter((t) => t.source_device === 'istri').length})
          </button>
          {pendingTally.reviewCount > 0 && (
            <button
              onClick={() => setFilterOwner('review')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                filterOwner === 'review'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}
            >
              ⚠️ Perlu Cek ({pendingTally.reviewCount})
            </button>
          )}

          <button
            onClick={fetchData}
            title="Refresh data"
            className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 ml-auto shrink-0 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Transaksi */}
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 my-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Semua Transaksi Sudah Beres! 🎉
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Tidak ada transaksi yang menunggu kategorisasi. Transaksi baru yang masuk via notifikasi HP akan langsung muncul di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => (
              <TransactionCard
                key={tx.id}
                transaction={tx}
                categories={categories}
                onCategorize={handleCategorize}
                onIgnore={handleIgnore}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal Tambah Manual */}
      <ManualTransactionModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        accounts={accounts}
        categories={categories}
        currentRole={userRole}
        onAdd={handleAddManual}
      />
    </>
  );
}
