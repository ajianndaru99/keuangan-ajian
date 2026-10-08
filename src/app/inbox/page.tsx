'use client';

// ==============================================================================
// TRANSACTIONS / INBOX PAGE: src/app/inbox/page.tsx
// Halaman Transaksi Finansial Mengadopsi Desain Monexa (Foto 2)
// - Sidebar & TopBar "Keluarga Ajian" via AppShell
// - Toolbar: Filter Pill All/Income/Expense, Filter Kalender, Ekspor CSV, + Add Transaction
// - Tabel Transaksi Monexa dengan Palet Pastel Soft
// - Dukungan Upload Foto Struk / Bukti Transfer via Google Gemini Vision AI
// - Pop-up Realtime Toast & Modal Detail
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import TableToolbar, { FlowFilterType } from '@/components/transactions/TableToolbar';
import TransactionTable, { MonexaTransactionRow } from '@/components/transactions/TransactionTable';
import DateRangePickerModal, { DateRangeValue } from '@/components/transactions/DateRangePickerModal';
import AddTransactionModal from '@/components/transactions/AddTransactionModal';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import QuickEditModal from '@/components/inbox/QuickEditModal';
import RealtimeToast, { ToastTransactionData } from '@/components/inbox/RealtimeToast';
import { TransactionItem } from '@/components/inbox/TransactionCard';
import { Category } from '@/components/inbox/CategoryChipList';
import { exportTransactionsToCsv } from '@/lib/export-excel';
import { RefreshCw } from 'lucide-react';

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

  // State Pengguna
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // State Transaksi & Metadata
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
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
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionItem | null>(null);
  const [incomingToast, setIncomingToast] = useState<ToastTransactionData | null>(null);

  // Ambil Data dari Supabase
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
      }
    } catch (err) {
      console.warn('Gagal memuat transaksi:', err);
    } finally {
      setLoading(false);
    }
  }, [router, dateRange]);

  useEffect(() => {
    fetchData();

    if (!isSupabaseConfigured()) return;

    // Realtime Listener
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

  return (
    <AppShell
      userRole={userRole}
      displayName={displayName}
      pendingCount={pendingCount}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {/* Toolbar Monexa: Title, Filter Pill, Kalender, Export, + Add Transaction */}
      <TableToolbar
        currentFlow={flowFilter}
        onFlowChange={setFlowFilter}
        dateRange={dateRange}
        onOpenDateModal={() => setIsDateModalOpen(true)}
        onExport={handleExportCsv}
        onAddTransaction={() => setIsAddModalOpen(true)}
        totalCount={filteredTransactions.length}
      />

      {/* Tabel Transaksi Monexa */}
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

      {/* Modal Filter Tanggal */}
      <DateRangePickerModal
        isOpen={isDateModalOpen}
        onClose={() => setIsDateModalOpen(false)}
        currentValue={dateRange}
        onApply={(newRange) => {
          setDateRange(newRange);
        }}
      />

      {/* Modal Tambah Transaksi (Manual & Scan Foto Struk Gemini Vision AI) */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        categories={categories}
        accounts={accounts}
        onSuccess={fetchData}
        userRole={userRole}
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

      {/* Modal Koreksi Data Transaksi */}
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

      {/* Pop-up Toast Realtime Saat Transaksi Masuk */}
      <RealtimeToast
        data={incomingToast}
        onClose={() => setIncomingToast(null)}
        onViewDetail={(item) => {
          const found = transactions.find((t) => t.id === item.id);
          if (found) {
            setDetailTransaction(found);
            setIsDetailModalOpen(true);
          }
        }}
      />
    </AppShell>
  );
}
