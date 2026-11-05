// ==============================================================================
// ACCOUNT BALANCE HELPER: src/lib/account-balance.ts
// Sinkronisasi saldo akun idempoten di level aplikasi
// Rumus: initial_balance + SUM(reconciled IN) - SUM(reconciled OUT)
// Mencegah resiko double-counting dan menjamin konsistensi 100% dengan RPC database
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Menghitung ulang dan memperbarui saldo akun secara idempoten
 * Dipanggil berapa kali pun, saldo tetap akurat dan tidak akan terhitung ganda
 */
export async function syncAccountBalance(
  supabase: SupabaseClient,
  accountId: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!accountId) {
    return { success: true };
  }

  // 1. Ambil akun dan initial_balance
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('id, initial_balance')
    .eq('id', accountId)
    .maybeSingle();

  if (accErr || !account) {
    console.error('[syncAccountBalance Fetch Error]:', accErr?.message);
    return { success: false, error: accErr?.message || 'Akun tidak ditemukan' };
  }

  // 2. Ambil seluruh transaksi berstatus 'reconciled' milik akun ini
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('amount, direction')
    .eq('account_id', accountId)
    .eq('status', 'reconciled');

  if (txErr) {
    console.error('[syncAccountBalance Tx Fetch Error]:', txErr.message);
    return { success: false, error: txErr.message };
  }

  let totalIn = 0;
  let totalOut = 0;
  for (const t of txs || []) {
    const val = Number(t.amount || 0);
    if (t.direction === 'in') totalIn += val;
    else if (t.direction === 'out') totalOut += val;
  }

  const realBalance = Number(account.initial_balance || 0) + totalIn - totalOut;

  // 3. Update kolom accounts.balance dengan nilai riil yang pasti
  const { error: updateErr } = await supabase
    .from('accounts')
    .update({ balance: realBalance })
    .eq('id', accountId);

  if (updateErr) {
    console.error('[syncAccountBalance Update Error]:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  return { success: true, newBalance: realBalance };
}

/**
 * Kompatibilitas mundur: menyinkronkan saldo secara idempoten
 */
export async function applyAccountBalanceDelta(
  supabase: SupabaseClient,
  accountId: string,
  _deltaAmount?: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  return syncAccountBalance(supabase, accountId);
}

