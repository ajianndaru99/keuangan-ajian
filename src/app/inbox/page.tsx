'use client';

// ==============================================================================
// INBOX PAGE: src/app/inbox/page.tsx
// Halaman Inbox Transaksi Pending — Desain Finansial Bersih & Profesional
// - Kartu dikelompokkan per hari dengan Accordion / Dropdown yang bisa dibuka/tutup
// - Pop-up Realtime Toast saat notifikasi baru masuk
// - Pop-up Modal Detail Transaksi lengkap
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import TransactionCard, { TransactionItem } from '@/components/inbox/TransactionCard';
import ManualTransactionModal, { AccountOption } from '@/components/inbox/ManualTransactionModal';
import RealtimeToast, { ToastTransactionData } from '@/components/inbox/RealtimeToast';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import QuickEditModal from '@/components/inbox/QuickEditModal';
import { Category } from '@/components/inbox/CategoryChipList';
import {
  Plus,
  CheckCircle2,
  RefreshCw,
  X,
  CheckCheck,
  ChevronDown,
  ChevronRight,
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
  { id: 'acc-s-3', name: 'Jago', owner: 'suami', type: 'bank' },
  { id: 'acc-s-4', name: 'GoPay', owner: 'suami', type: 'ewallet' },
  { id: 'acc-i-1', name: 'BCA', owner: 'istri', type: 'bank' },
  { id: 'acc-i-2', name: 'BRI', owner: 'istri', type: 'bank' },
  { id: 'acc-i-3', name: 'ShopeePay', owner: 'istri', type: 'ewallet' },
  { id: 'acc-i-4', name: 'DANA', owner: 'istri', type: 'ewallet' },
];

interface DayGroup {
  dateKey: string;
  dateLabel: string;
  items: TransactionItem[];
  totalOut: number;
  totalIn: number;
}

function formatDayLabel(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { key: 'unknown', label: 'Tanggal Tidak Diketahui' };

  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d);
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(yesterday);

  const fullDateText = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

  if (key === todayKey) {
    return { key, label: `Hari Ini — ${fullDateText}` };
  }
  if (key === yesterdayKey) {
    return { key, label: `Kemarin — ${fullDateText}` };
  }
  return { key, label: fullDateText };
}

export default function InboxPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultMockCategories);
  const [accounts, setAccounts] = useState<AccountOption[]>(defaultMockAccounts);
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [filterOwner, setFilterOwner] = useState<'all' | 'suami' | 'istri' | 'review'>('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [showDemoNotice, setShowDemoNotice] = useState(false);

  // Accordion state per hari (key: dateKey, value: true jika tertutup/collapsed)
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  // Pop-up States
  const [incomingToast, setIncomingToast] = useState<ToastTransactionData | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);

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
      }

      // 2. Transaksi Pending
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select(`
          id, household_id, account_id, category_id, amount, direction,
          merchant, raw_notification, source_device, transaction_date,
          status, dedupe_hash, needs_review, created_at,
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
  }, [router]);

  useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured()) return;

    // Realtime Subscription: Dengarkan tabel transactions DAN raw_notifications
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:inbox_transactions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transactions',
        },
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
        {
          event: 'INSERT',
          schema: 'public',
          table: 'raw_notifications',
        },
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

  // Konfirmasi 1-klik untuk seluruh transaksi yang kategorinya sudah terdeteksi otomatis
  const autoCategorizedTransactions = useMemo(() => {
    return transactions.filter((t) => t.category_id && t.amount > 0 && !t.needs_review);
  }, [transactions]);

  const handleApproveAllAutoCategorized = async () => {
    if (autoCategorizedTransactions.length === 0) return;
    const ids = autoCategorizedTransactions.map((t) => t.id);

    setTransactions((prev) => prev.filter((t) => !ids.includes(t.id)));

    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await Promise.all(
        autoCategorizedTransactions.map((t) =>
          supabase
            .from('transactions')
            .update({
              status: 'reconciled',
              needs_review: false,
            })
            .eq('id', t.id)
        )
      );
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

  // Kelompokkan Transaksi Per Hari (Accordion Grouping)
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groupsMap = new Map<string, DayGroup>();

    filteredTransactions.forEach((tx) => {
      const { key, label } = formatDayLabel(tx.transaction_date);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          dateKey: key,
          dateLabel: label,
          items: [],
          totalOut: 0,
          totalIn: 0,
        });
      }
      const group = groupsMap.get(key)!;
      group.items.push(tx);
      if (tx.direction === 'in') group.totalIn += Number(tx.amount || 0);
      else group.totalOut += Number(tx.amount || 0);
    });

    return Array.from(groupsMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredTransactions]);

  const toggleDayCollapse = (dateKey: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const collapseAllDays = () => {
    const next: Record<string, boolean> = {};
    dayGroups.forEach((g) => {
      next[g.dateKey] = true;
    });
    setCollapsedDates(next);
  };

  const expandAllDays = () => {
    setCollapsedDates({});
  };

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

  // Handler Buka Pop-up Detail dari Toast
  const handleOpenDetailFromToast = (toastData: ToastTransactionData) => {
    const found = transactions.find((t) => t.id === toastData.id);
    if (found) {
      setDetailTransaction(found);
      setIsDetailModalOpen(true);
    } else {
      const fallbackItem: TransactionItem = {
        id: toastData.id || `notif-${Date.now()}`,
        household_id: '',
        account_id: '',
        category_id: null,
        amount: toastData.amount,
        direction: toastData.direction,
        merchant: toastData.merchant,
        raw_notification: toastData.rawNotification || toastData.merchant,
        source_device: toastData.sourceDevice || 'suami',
        transaction_date: new Date().toISOString(),
        status: 'pending',
        dedupe_hash: '',
        needs_review: toastData.amount === 0,
        accounts: toastData.accountName ? { name: toastData.accountName, type: 'bank' } : undefined,
      };
      setDetailTransaction(fallbackItem);
      setIsDetailModalOpen(true);
    }
  };

  return (
    <>
      <Navbar
        userRole={userRole}
        displayName={displayName}
        pendingCount={pendingTally.totalCount}
        isRealtimeActive={isRealtimeActive || !isCloudConnected}
      />

      <main className="flex-1 pb-24 px-4 sm:px-6 lg:px-8 xl:px-10 max-w-[1440px] mx-auto w-full pt-4">
        {/* Banner Ringkas Mode Demo */}
        {!isCloudConnected && showDemoNotice && (
          <div className="mb-4 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
            <span>
              <strong className="text-slate-900 dark:text-white">Mode Pratinjau Demo</strong>: Menampilkan data simulasi transaksi interaktif.
            </span>
            <button
              onClick={() => setShowDemoNotice(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
              title="Tutup pemberitahuan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Kartu Ringkasan Pending — Bersih, Elegan, & Rapi */}
        <div className="rounded-3xl p-5 md:p-6 mb-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Inbox Transaksi
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
                {pendingTally.totalCount} Transaksi Menunggu Verifikasi
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {autoCategorizedTransactions.length > 0 && (
                <button
                  onClick={handleApproveAllAutoCategorized}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-xs transition-colors shadow-xs"
                  title="Konfirmasi seluruh transaksi yang sudah terkategori otomatis"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Konfirmasi Semua ({autoCategorizedTransactions.length})</span>
                </button>
              )}

              <button
                onClick={() => setIsManualModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold text-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Input Manual</span>
              </button>
            </div>
          </div>

          {/* Quick Stat Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Total Pending
              </span>
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {pendingTally.totalCount} Transaksi
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Pending Keluar
              </span>
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {formatRupiah(pendingTally.outTotal)}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Pending Masuk
              </span>
              <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatRupiah(pendingTally.inTotal)}
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                Terkategori Otomatis
              </span>
              <p className="text-base font-bold text-slate-900 dark:text-white">
                {autoCategorizedTransactions.length} dari {transactions.length}
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar Segmented Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-4 py-1">
          <button
            onClick={() => setFilterOwner('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Semua ({transactions.length})
          </button>
          <button
            onClick={() => setFilterOwner('suami')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'suami'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Suami ({transactions.filter((t) => t.source_device === 'suami').length})
          </button>
          <button
            onClick={() => setFilterOwner('istri')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
              filterOwner === 'istri'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
            }`}
          >
            Istri ({transactions.filter((t) => t.source_device === 'istri').length})
          </button>
          {pendingTally.reviewCount > 0 && (
            <button
              onClick={() => setFilterOwner('review')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border ${
                filterOwner === 'review'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800'
              }`}
            >
              Perlu Cek ({pendingTally.reviewCount})
            </button>
          )}

          {/* Kontrol Buka/Tutup Semua Grup Hari jika ada lebih dari 1 hari */}
          {dayGroups.length > 1 && (
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={expandAllDays}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                Buka Semua
              </button>
              <button
                type="button"
                onClick={collapseAllDays}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                Tutup Semua
              </button>
            </div>
          )}

          <button
            onClick={fetchData}
            title="Muat ulang data"
            className="p-2 rounded-xl bg-white dark:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-slate-700 shrink-0 transition-colors ml-auto sm:ml-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Daftar Kartu Transaksi Dikelompokkan Per Hari (Accordion) */}
        {dayGroups.length === 0 ? (
          <div className="text-center py-20 px-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 my-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Semua Transaksi Sudah Diverifikasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Tidak ada transaksi yang menunggu verifikasi saat ini. Notifikasi baru dari aplikasi perbankan HP Suami & Istri akan otomatis muncul di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {dayGroups.map((group) => {
              const isCollapsed = Boolean(collapsedDates[group.dateKey]);

              return (
                <div
                  key={group.dateKey}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
                >
                  {/* Header Accordion Hari */}
                  <button
                    type="button"
                    onClick={() => toggleDayCollapse(group.dateKey)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-800/50 dark:hover:bg-slate-800/80 transition-colors border-b border-slate-100 dark:border-slate-800/80 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="text-slate-400 dark:text-slate-500 shrink-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {group.dateLabel}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {group.items.length} Transaksi
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 text-right">
                      {group.totalOut > 0 && (
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          -{formatRupiah(group.totalOut)}
                        </span>
                      )}
                      {group.totalIn > 0 && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          +{formatRupiah(group.totalIn)}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Konten Kartu Transaksi Per Hari */}
                  {!isCollapsed && (
                    <div className="p-3 sm:p-4 space-y-3">
                      {group.items.map((tx) => (
                        <TransactionCard
                          key={tx.id}
                          transaction={tx}
                          categories={categories}
                          onCategorize={handleCategorize}
                          onIgnore={handleIgnore}
                          onUpdate={handleUpdate}
                          onOpenDetail={(item) => {
                            setDetailTransaction(item);
                            setIsDetailModalOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Pop-up Notifikasi Realtime (Toast) */}
      <RealtimeToast
        data={incomingToast}
        onClose={() => setIncomingToast(null)}
        onViewDetail={handleOpenDetailFromToast}
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
        onEdit={(tx) => {
          setEditingTransaction(tx);
        }}
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
