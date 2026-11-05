// ==============================================================================
// ACCOUNT BALANCE HELPER: src/lib/account-balance.ts
// Sinkronisasi perubahan saldo akun langsung di level aplikasi (Application-layer fallback)
// Memastikan accounts.balance selalu mutakhir tanpa mutlak bergantung trigger database
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Menyesuaikan saldo akun secara atomik dengan menambahkan delta nominal (+ atau -)
 * deltaAmount: positif untuk penambahan saldo (in), negatif untuk pengurangan saldo (out)
 */
export async function applyAccountBalanceDelta(
  supabase: SupabaseClient,
  accountId: string,
  deltaAmount: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!accountId || deltaAmount === 0) {
    return { success: true };
  }

  // 1. Ambil saldo terkini dari database
  const { data: account, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, balance, initial_balance')
    .eq('id', accountId)
    .maybeSingle();

  if (fetchErr || !account) {
    console.error('[applyAccountBalanceDelta Fetch Error]:', fetchErr?.message);
    return { success: false, error: fetchErr?.message || 'Akun tidak ditemukan' };
  }

  const currentBalance = Number(account.balance ?? account.initial_balance ?? 0);
  const newBalance = currentBalance + deltaAmount;

  // 2. Perbarui nilai balance di tabel accounts
  const { error: updateErr } = await supabase
    .from('accounts')
    .update({ balance: newBalance })
    .eq('id', accountId);

  if (updateErr) {
    console.error('[applyAccountBalanceDelta Update Error]:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  return { success: true, newBalance };
}

