// ==============================================================================
// SHARED TYPES: src/types/transaction.ts
// Tipe data transaksi bersama untuk Dashboard, Inbox, dan Rekap (Read-Only UI)
// ==============================================================================

export interface TransactionItem {
  id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  direction: 'in' | 'out';
  merchant: string;
  raw_notification: string;
  source_device: 'suami' | 'istri';
  transaction_date: string;
  status: 'pending' | 'reconciled' | 'ignored';
  needs_review?: boolean;
  parse_method?: string;
  notes?: string | null;
  dedupe_hash?: string | null;
  accounts?: { name: string; owner?: string } | null;
  categories?: { name: string; type?: string } | null;
}

export interface CategoryOption {
  id: string;
  name: string;
  type: 'expense' | 'income';
}
