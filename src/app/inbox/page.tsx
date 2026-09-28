'use client';

// ==============================================================================
// INBOX PAGE: src/app/inbox/page.tsx
// Halaman Inbox Transaksi Pending dengan Realtime, Kategorisasi 1-tap, & Tambah Manual
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import TransactionCard, { TransactionItem } from '@/components/inbox/TransactionCard';
import ManualTransactionModal, { AccountOption } from '@/components/inbox/ManualTransactionModal';
import { Category } from '@/components/inbox/CategoryChipList';
import {
  Inbox as InboxIcon,
  Plus,
  CheckCircle2,
  Filter,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

// Kategori default fallback untuk preview
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

export default function InboxPage() {
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultMockCategories);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri' | 'review'>('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);

  // Ambil data awal dari Supabase
  const fetchData = useCallback(async () => {
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
        // Normalisasi format relasi accounts jika berbentuk array
        const normalized = txData.map((item: any) => ({
          ...item,
          accounts: Array.isArray(item.accounts) ? item.accounts[0] : item.accounts,
        }));
        setTransactions(normalized);
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

    // 5. Setup Supabase Realtime Subscription
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
          // Ketika ada notifikasi baru masuk via webhook, refresh data otomatis
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
    // Optimistic UI update: langsung hapus dari antrean Inbox
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));

    const supabase = createClient();
    await supabase
      .from('transactions')
      .update({
        category_id: categoryId,
        status: 'reconciled',
        needs_review: false,
      })
      .eq('id', transactionId);
  };

  // Aksi abaikan transaksi (status 'ignored')
  const handleIgnore = async (transactionId: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));

    const supabase = createClient();
    await supabase
      .from('transactions')
      .update({
        status: 'ignored',
      })
      .eq('id', transactionId);
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
    const supabase = createClient();
    const dedupeHash = `manual_${Date.now()}_${Math.random()}`;

    const { data: newTx, error } = await supabase
      .from('transactions')
      .insert({
        account_id: data.accountId,
        category_id: data.categoryId || null,
        amount: data.amount,
        direction: data.direction,
        merchant: data.merchant,
        raw_notification: `Input Manual: ${data.merchant} (${formatRupiah(data.amount)})`,
        source_device: data.sourceDevice,
        transaction_date: data.transactionDate,
        status: data.categoryId ? 'reconciled' : 'pending',
        dedupe_hash: dedupeHash,
        needs_review: false,
      })
      .select('*, accounts (name, type)')
      .single();

    if (!error && newTx && !data.categoryId) {
      const normalized = {
        ...newTx,
        accounts: Array.isArray(newTx.accounts) ? newTx.accounts[0] : newTx.accounts,
      };
      setTransactions((prev) => [normalized, ...prev]);
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
        isRealtimeActive={isRealtimeActive}
      />

      <main className="flex-1 pb-24 px-4 pt-4">
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
