'use client';

// ==============================================================================
// TRANSACTIONS / INBOX PAGE: src/app/inbox/page.tsx
// Monitor Mutasi & Stream Notifikasi Mentah (Strictly Read-Only, Kontrol via Telegram)
// ==============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import AppShell from '@/components/layout/AppShell';
import TableToolbar, { FlowFilterType } from '@/components/transactions/TableToolbar';
import TransactionTable, { MonexaTransactionRow } from '@/components/transactions/TransactionTable';
import DateRangePickerModal, { DateRangeValue } from '@/components/transactions/DateRangePickerModal';
import TransactionDetailModal from '@/components/inbox/TransactionDetailModal';
import RawNotificationTable, { RawNotificationItem } from '@/components/inbox/RawNotificationTable';
import type { TransactionItem } from '@/types/transaction';
import { Bot, CheckCircle2, Smartphone } from 'lucide-react';

export default function InboxTransactionsPage() {
  const [inboxTab, setInboxTab] = useState<'parsed' | 'raw'>('parsed');
  const [displayName, setDisplayName] = useState<string>('Kepala Keluarga (Suami)');
  const [loading, setLoading] = useState(false);

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [rawNotifications, setRawNotifications] = useState<RawNotificationItem[]>([]);
  const [globalPendingCount, setGlobalPendingCount] = useState<number>(0);

  const toLocalYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [flowFilter, setFlowFilter] = useState<FlowFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    return {
      preset: 'thisMonth',
      label: now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
      startDate: toLocalYmd(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: toLocalYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  });

  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [detailTransaction, setDetailTransaction] = useState<TransactionItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchInboxData = useCallback(async () => {
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

      const startIso = `${dateRange.startDate}T00:00:00+07:00`;
      const endIso = `${dateRange.endDate}T23:59:59+07:00`;

      const [txRes, rawRes, pendRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, account_id, category_id, amount, direction, merchant, raw_notification, source_device, transaction_date, status, needs_review, parse_method, notes, accounts(name, owner), categories(name, type)')
          .eq('household_id', profile.household_id)
          .neq('status', 'ignored')
          .gte('transaction_date', startIso)
          .lte('transaction_date', endIso)
          .order('transaction_date', { ascending: false })
          .limit(300),
        supabase
          .from('raw_notifications')
          .select('id, household_id, device_id, source, app_name, title, content, received_at_raw, received_at, created_at, outcome, reasons, parser_version, sensitive')
          .eq('household_id', profile.household_id)
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', profile.household_id)
          .eq('status', 'pending'),
      ]);

      setTransactions((txRes.data || []) as unknown as TransactionItem[]);
      setRawNotifications((rawRes.data || []) as unknown as RawNotificationItem[]);
      setGlobalPendingCount(pendRes.count || 0);
    } catch (err) {
      console.warn('Gagal memuat inbox:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    fetchInboxData();
  }, [fetchInboxData]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (flowFilter === 'pending' && tx.status !== 'pending') return false;
      if (flowFilter === 'income' && tx.direction !== 'in') return false;
      if (flowFilter === 'expense' && tx.direction !== 'out') return false;
      if (!q) return true;
      return `${tx.merchant || ''} ${tx.raw_notification || ''} ${tx.categories?.name || ''} ${tx.accounts?.name || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, flowFilter, searchQuery]);

  const rows: MonexaTransactionRow[] = useMemo(
    () =>
      filteredTransactions.map((tx) => ({
        id: tx.id,
        transaction_date: tx.transaction_date,
        merchant: tx.merchant,
        amount: Number(tx.amount || 0),
        direction: tx.direction,
        status: tx.status,
        source_device: tx.source_device,
        account_name: tx.accounts?.name || 'Rekening',
        category_name: tx.categories?.name || undefined,
        raw_notification: tx.raw_notification,
        needs_review: tx.needs_review,
        parse_method: (tx.parse_method as MonexaTransactionRow['parse_method']) || 'regex',
      })),
    [filteredTransactions]
  );

  return (
    <AppShell
      userRole="suami"
      displayName={displayName}
      pendingCount={globalPendingCount}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
    >
      <DateRangePickerModal
        isOpen={isDateModalOpen}
        onClose={() => setIsDateModalOpen(false)}
        currentValue={dateRange}
        onApply={(range: DateRangeValue) => {
          setDateRange(range);
          setIsDateModalOpen(false);
        }}
      />

      <TransactionDetailModal
        transaction={detailTransaction}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
      />

      <div className="space-y-4">
        <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
          <Bot className="w-4 h-4 shrink-0" />
          <span>
            Mode pantau (Read-Only). Verifikasi pending, ubah kategori/nominal, atau blokir promo dilakukan melalui Telegram (<code>/inbox</code> atau balas notifikasi).
          </span>
        </div>

        <div className="flex items-center gap-2 p-1 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] w-max">
          <button
            type="button"
            onClick={() => setInboxTab('parsed')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              inboxTab === 'parsed'
                ? 'bg-[var(--surface-2)] text-[var(--text-main)] shadow-2xs'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Transaksi ({transactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setInboxTab('raw')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              inboxTab === 'raw'
                ? 'bg-[var(--surface-2)] text-[var(--text-main)] shadow-2xs'
                : 'text-[var(--text-muted)]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span>Notifikasi Mentah ({rawNotifications.length})</span>
          </button>
        </div>

        {inboxTab === 'parsed' ? (
          <>
            <TableToolbar
              currentFlow={flowFilter}
              onFlowChange={setFlowFilter}
              dateRange={dateRange}
              onOpenDateModal={() => setIsDateModalOpen(true)}
              totalCount={rows.length}
              pendingCount={globalPendingCount}
            />

            {loading ? (
              <div className="p-10 text-center text-xs text-[var(--text-muted)]">
                Memuat daftar transaksi...
              </div>
            ) : (
              <TransactionTable
                transactions={rows}
                onSelectTransaction={(row) => {
                  const found = transactions.find((t) => t.id === row.id) || null;
                  setDetailTransaction(found);
                  setIsDetailModalOpen(Boolean(found));
                }}
              />
            )}
          </>
        ) : (
          <RawNotificationTable notifications={rawNotifications} loading={loading} />
        )}
      </div>
    </AppShell>
  );
}
