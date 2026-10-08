'use client';

// ==============================================================================
// TRANSACTIONS / INBOX PAGE: src/app/inbox/page.tsx
// Halaman Transaksi Finansial Mengadopsi Desain Monexa & Tab Raw Stream
// - Tab 1: Transaksi Terurai (Parser Otomatis & Vision AI)
// - Tab 2: Seluruh Notifikasi HP (Raw Stream) untuk Semua Aplikasi Bank/E-Wallet
// - Konversi Cepat 1-Klik dari Notifikasi Mentah ke Transaksi Resmi
// - Sinkronisasi Realtime Listener Supabase
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import TableToolbar, { FlowFilterType } from '@/components/transactions/TableToolbar';
import TransactionTable, { MonexaTransactionRow } from '@/components/transactions/TransactionTable';
import DateRangePickerModal, { DateRangeValue } from '@/components/transactions/DateRangePickerModal';
import AddTransactionModal, { PreloadedTransactionData } from '@/components/transactions/AddTransactionModal';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import QuickEditModal from '@/components/inbox/QuickEditModal';
import RealtimeToast, { ToastTransactionData } from '@/components/inbox/RealtimeToast';
import RawNotificationTable, { RawNotificationItem } from '@/components/inbox/RawNotificationTable';
import { TransactionItem } from '@/components/inbox/TransactionCard';
import { Category } from '@/components/inbox/CategoryChipList';
import { exportTransactionsToCsv } from '@/lib/export-excel';
import { CheckCircle2, Smartphone, RefreshCw } from 'lucide-react';

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

export default function InboxTransactionsPage() {
  const router = useRouter();

  // Tab Utama Inbox: 'parsed' (Transaksi Terurai) vs 'raw' (Semua Notifikasi HP)
  const [inboxTab, setInboxTab] = useState<'parsed' | 'raw'>('parsed');

  // State Pengguna
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // State Transaksi & Metadata
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [rawNotifications, setRawNotifications] = useState<RawNotificationItem[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [accounts, setAccounts] = useState<any[]>([]);

  // State Filter Toolbar Monexa
  const [flowFilter, setFlowFilter] = useState<FlowFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    preset: 'thisMonth',
    label: new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
  });

  // State Modals & Dialogs
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [preloadedData, setPreloadedData] = useState<PreloadedTransactionData | null>(null);
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);
  const [incomingToast, setIncomingToast] = useState<ToastTransactionData | null>(null);

  // Ambil Data dari Supabase (Transaksi Terurai & Raw Notifications)
  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) return;

    setLoading(true);
    const supabase = createClient();

    try {
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

        // 1. Ambil Kategori
        const { data: catData } = await supabase
          .from('categories')
          .select('id, name, type, sort_order')
          .eq('household_id', householdId)
          .order('sort_order', { ascending: true });

        if (catData && catData.length > 0) setCategories(catData);

        // 2. Ambil Akun
        const { data: accData } = await supabase
          .from('accounts')
          .select('id, name, type, owner')
          .eq('household_id', householdId)
          .eq('is_active', true);

        if (accData) setAccounts(accData);

        // 3. Ambil Transaksi (Filter Tanggal jika ada)
        let query = supabase
          .from('transactions')
          .select(`
            id, household_id, account_id, category_id, amount, direction,
            merchant, raw_notification, source_device, transaction_date,
            status, dedupe_hash, needs_review, created_at,
            accounts (name, type),
            categories (name)
          `)
          .eq('household_id', householdId)
          .order('transaction_date', { ascending: false });

        if (dateRange.startDate) {
          query = query.gte('transaction_date', `${dateRange.startDate}T00:00:00Z`);
        }
        if (dateRange.endDate) {
          query = query.lte('transaction_date', `${dateRange.endDate}T23:59:59Z`);
        }

        const { data: txData } = await query;

        if (txData) {
          const normalized = txData.map((item: any) => ({
            ...item,
            accounts: Array.isArray(item.accounts) ? item.accounts[0] : item.accounts,
            categories: Array.isArray(item.categories) ? item.categories[0] : item.categories,
          }));
          setTransactions(normalized);
        }

        // 4. Ambil Seluruh Log Notifikasi Mentah (Raw Stream)
        const { data: rawData } = await supabase
          .from('raw_notifications')
          .select('*')
          .eq('household_id', householdId)
          .order('created_at', { ascending: false })
          .limit(100);

        if (rawData) {
          setRawNotifications(rawData as RawNotificationItem[]);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat data inbox:', err);
    } finally {
      setLoading(false);
    }
  }, [router, dateRange]);

  useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured()) return;

    // Realtime Listener untuk transaksi baru & notifikasi mentah baru
    const supabase = createClient();
    const channel = supabase
      .channel('realtime:inbox_transactions')
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
          // Tampilkan pop-up toast notifikasi baru masuk dari HP
          setIncomingToast({
            id: raw.id,
            merchant: raw.title || raw.app_name || 'Notifikasi Masuk',
            amount: 0,
            direction: 'out',
            sourceDevice: (raw.device_id || '').toLowerCase().includes('istri') ? 'istri' : 'suami',
            rawNotification: `${raw.title}: ${raw.content}`,
          });
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Filter Data Transaksi berdasarkan Pill All/Income/Expense & Search Query
  const filteredTransactions: MonexaTransactionRow[] = useMemo(() => {
    return transactions
      .filter((tx) => {
        // Filter Arah Arus Kas
        if (flowFilter === 'income' && tx.direction !== 'in') return false;
        if (flowFilter === 'expense' && tx.direction !== 'out') return false;

        // Filter Pencarian Global
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchMerchant = (tx.merchant || '').toLowerCase().includes(q);
          const matchNotes = (tx.raw_notification || '').toLowerCase().includes(q);
          const matchCategory = ((tx as any).categories?.name || '').toLowerCase().includes(q);
          const matchAccount = (tx.accounts?.name || '').toLowerCase().includes(q);
          const matchAmount = String(tx.amount).includes(q);
          return matchMerchant || matchNotes || matchCategory || matchAccount || matchAmount;
        }

        return true;
      })
      .map((tx: any) => ({
        id: tx.id,
        transaction_date: tx.transaction_date,
        merchant: tx.merchant,
        amount: Number(tx.amount || 0),
        direction: tx.direction,
        status: tx.status,
        source_device: tx.source_device,
        account_name: tx.accounts?.name,
        account_type: tx.accounts?.type,
        category_name: tx.categories?.name,
        raw_notification: tx.raw_notification,
        needs_review: tx.needs_review,
      }));
  }, [transactions, flowFilter, searchQuery]);

  // Hitung Transaksi Pending untuk TopBar & Sidebar
  const pendingCount = useMemo(() => {
    return transactions.filter((t) => t.status === 'pending').length;
  }, [transactions]);

  // Handler Aksi Tabel Monexa
  const handleExportCsv = () => {
    exportTransactionsToCsv(filteredTransactions, 'Transaksi_Keluarga_Ajian');
  };

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

  const handleDelete = async (transactionId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus catatan transaksi ini?')) return;
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.from('transactions').delete().eq('id', transactionId);
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

  // --------------------------------------------------------------------------
  // Handler Aksi Raw Notifications
  // --------------------------------------------------------------------------

  // Konversi Notifikasi Mentah menjadi Transaksi Resmi
  const handleConvertToTransaction = (notif: RawNotificationItem) => {
    // 1. Ekstrak nominal jika ada pola Rp
    const amountMatch = notif.content.match(/\b(?:rp|idr)\.?\s*(\d[\d.,]*)/i);
    let parsedAmt: number | undefined = undefined;
    if (amountMatch) {
      const clean = amountMatch[1].replace(/[.,]/g, '');
      const val = parseInt(clean, 10);
      if (!isNaN(val) && val > 0) parsedAmt = val;
    }

    // 2. Ekstrak arah transaksi
    const combined = `${notif.title} ${notif.content}`.toLowerCase();
    const isIncome = /masuk|terima|kredit|received|from\b/i.test(combined);
    const direction: 'in' | 'out' = isIncome ? 'in' : 'out';

    // 3. Ekstrak calon nama merchant
    let merchantCandidate = notif.title || notif.app_name;
    const toMatch = notif.content.match(/\b(?:to|ke|di|kepada|at)\s+([A-Za-z0-9\s&'.-]+?)(?:\.|\s+need|\s+hubungi|\s+pada|\s+via|\s+dengan|$)/i);
    if (toMatch && toMatch[1]) {
      merchantCandidate = toMatch[1].trim();
    }

    setPreloadedData({
      merchant: merchantCandidate,
      amount: parsedAmt,
      direction,
      notes: `[Notifikasi ${notif.app_name}] ${notif.title}: ${notif.content}`,
      transactionDate: notif.server_received_at || notif.created_at,
      accountName: notif.app_name,
      rawNotificationId: notif.id,
    });

    setIsAddModalOpen(true);
  };

  // Tandai notifikasi mentah sebagai diabaikan / non-transaksi
  const handleIgnoreRawNotification = async (id: string) => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase
        .from('raw_notifications')
        .update({ validated_at: new Date().toISOString() })
        .eq('id', id);

      setRawNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, validated_at: new Date().toISOString() } : n))
      );
    }
  };

  // Hapus log notifikasi mentah
  const handleDeleteRawNotification = async (id: string) => {
    if (!confirm('Hapus baris log notifikasi mentah ini?')) return;
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.from('raw_notifications').delete().eq('id', id);
      setRawNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  };

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={pendingCount}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {/* Switcher Tab Utama: Transaksi Terurai vs Log Notifikasi Mentah */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)]/70 pb-3 mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {/* Tab 1: Transaksi Terurai */}
          <button
            onClick={() => setInboxTab('parsed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              inboxTab === 'parsed'
                ? 'bg-[#007a33] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-[var(--bg-card)] border border-transparent'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Transaksi Terurai</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-900 font-extrabold">
                {pendingCount} Pending
              </span>
            )}
          </button>

          {/* Tab 2: Seluruh Notifikasi Masuk (Raw Stream) */}
          <button
            onClick={() => setInboxTab('raw')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              inboxTab === 'raw'
                ? 'bg-[#007a33] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-[var(--bg-card)] border border-transparent'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Semua Notifikasi HP</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
              {rawNotifications.length}
            </span>
          </button>
        </div>

        <button
          onClick={fetchData}
          title="Muat ulang data"
          className="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[#007a33] hover:text-[#004d00] transition-colors shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* KONTEN TAB 1: Transaksi Terurai (Tampilan Monexa Asli) */}
      {inboxTab === 'parsed' && (
        <>
          <TableToolbar
            currentFlow={flowFilter}
            onFlowChange={setFlowFilter}
            dateRange={dateRange}
            onOpenDateModal={() => setIsDateModalOpen(true)}
            onExport={handleExportCsv}
            onAddTransaction={() => {
              setPreloadedData(null);
              setIsAddModalOpen(true);
            }}
            totalCount={filteredTransactions.length}
          />

          <TransactionTable
            transactions={filteredTransactions}
            onSelectTransaction={(row) => {
              const found = transactions.find((t) => t.id === row.id);
              if (found) {
                setDetailTransaction(found);
                setIsDetailModalOpen(true);
              }
            }}
            onEditTransaction={(row) => {
              const found = transactions.find((t) => t.id === row.id);
              if (found) setEditingTransaction(found);
            }}
            onDeleteTransaction={handleDelete}
          />
        </>
      )}

      {/* KONTEN TAB 2: Seluruh Notifikasi HP (Raw Stream) */}
      {inboxTab === 'raw' && (
        <RawNotificationTable
          notifications={rawNotifications}
          onConvertToTransaction={handleConvertToTransaction}
          onIgnoreNotification={handleIgnoreRawNotification}
          onDeleteNotification={handleDeleteRawNotification}
          loading={loading}
        />
      )}

      {/* Modal Filter Tanggal */}
      <DateRangePickerModal
        isOpen={isDateModalOpen}
        onClose={() => setIsDateModalOpen(false)}
        currentValue={dateRange}
        onApply={(newRange) => {
          setDateRange(newRange);
        }}
      />

      {/* Modal Tambah / Konversi Transaksi */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setPreloadedData(null);
        }}
        categories={categories}
        accounts={accounts}
        onSuccess={fetchData}
        userRole={userRole}
        preloadedData={preloadedData}
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

      {/* Modal Koreksi Cepat Transaksi */}
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

      {/* Pop-up Toast Realtime Saat Notifikasi / Transaksi Masuk */}
      <RealtimeToast
        data={incomingToast}
        onClose={() => setIncomingToast(null)}
        onViewDetail={(item) => {
          const found = transactions.find((t) => t.id === item.id);
          if (found) {
            setDetailTransaction(found);
            setIsDetailModalOpen(true);
          } else {
            // Jika notifikasi mentah, beralih ke tab raw
            setInboxTab('raw');
          }
        }}
      />
    </AppShell>
  );
}
