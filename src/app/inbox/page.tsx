'use client';

// ==============================================================================
// INBOX PAGE: src/app/inbox/page.tsx
// Halaman Inbox Transaksi Pending — Soft Pastel Liquid Glass Aesthetic
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
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Info,
  X,
  Sparkles,
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
  const [showDemoNotice, setShowDemoNotice] = useState(true);

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

      <main className="flex-1 pb-28 px-4 pt-3.5">
        {/* Banner Ringkas Mode Demo - Liquid Pill */}
        {!isCloudConnected && showDemoNotice && (
          <div className="mb-3 px-3.5 py-2 rounded-2xl liquid-pill bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/70 dark:border-sky-800/40 flex items-center justify-between text-xs text-sky-900 dark:text-sky-200 transition-all shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
              <span className="text-[11px] leading-tight">
                <strong>Mode Pratinjau Demo</strong>: Menggunakan data simulasi interaktif.
              </span>
            </div>
            <button
              onClick={() => setShowDemoNotice(false)}
              className="text-sky-400 hover:text-sky-700 dark:hover:text-sky-200 p-0.5 rounded-lg transition-colors"
              title="Tutup pemberitahuan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Kartu Ringkasan Pending — Frosted Liquid Glass Card */}
        <div className="rounded-3xl p-5 mb-3.5 liquid-glass relative overflow-hidden transition-all">
          {/* Subtle Ambient Liquid Glow behind glass */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-sky-300/30 via-indigo-300/20 to-purple-300/20 blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Inbox Transaksi
              </span>
              <p className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none mt-1">
                {pendingTally.totalCount} Perlu Diverifikasi
              </p>
            </div>

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 hover:from-sky-500 hover:to-indigo-600 active:scale-95 text-white font-semibold text-xs shadow-md shadow-sky-400/25 transition-all border border-white/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Manual</span>
            </button>
          </div>

          {/* Quick Stat Bar — Frosted Pills */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200/50 dark:border-white/10 relative z-10">
            <div className="flex items-center gap-2.5 p-2.5 rounded-2xl liquid-pill bg-white/40 dark:bg-white/5 border border-white/60 dark:border-white/10">
              <div className="p-1.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200/40">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block leading-none mb-1">
                  Pending Keluar
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {formatRupiah(pendingTally.outTotal)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2.5 rounded-2xl liquid-pill bg-white/40 dark:bg-white/5 border border-white/60 dark:border-white/10">
              <div className="p-1.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/40">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 block leading-none mb-1">
                  Pending Masuk
                </span>
                <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                  {formatRupiah(pendingTally.inTotal)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar Chips dengan Soft Liquid Styling */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3.5 py-0.5 pr-4">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
              filterOwner === 'all'
                ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white border-transparent shadow-md shadow-sky-400/20'
                : 'liquid-pill text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/10 border-white/70 dark:border-white/10'
            }`}
          >
            Semua ({transactions.length})
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
              filterOwner === 'suami'
                ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-white border-transparent shadow-md shadow-sky-400/20'
                : 'liquid-pill text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/10 border-white/70 dark:border-white/10'
            }`}
          >
            👨 Suami ({transactions.filter((t) => t.source_device === 'suami').length})
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
              filterOwner === 'istri'
                ? 'bg-gradient-to-r from-pink-400 to-rose-400 text-white border-transparent shadow-md shadow-pink-400/20'
                : 'liquid-pill text-slate-700 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/10 border-white/70 dark:border-white/10'
            }`}
          >
            👩 Istri ({transactions.filter((t) => t.source_device === 'istri').length})
          </button>
          {pendingTally.reviewCount > 0 && (
            <button
              onClick={() => setFilterOwner('review')}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border ${
                filterOwner === 'review'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200/80 dark:border-amber-800/60 backdrop-blur-md'
              }`}
            >
              ⚠️ Perlu Cek ({pendingTally.reviewCount})
            </button>
          )}

          <button
            onClick={fetchData}
            title="Refresh data"
            className="p-2 rounded-2xl liquid-pill text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white ml-auto shrink-0 transition-all border border-white/70 dark:border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Transaksi Liquid Glass Cards */}
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-16 px-6 rounded-3xl liquid-glass border border-white/80 dark:border-white/10 my-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-sm border border-emerald-200/60 dark:border-emerald-800/40">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-white text-base">
              Semua Transaksi Sudah Beres! 🎉
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Tidak ada transaksi yang menunggu kategorisasi. Transaksi baru dari notifikasi HP akan otomatis masuk ke sini.
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
