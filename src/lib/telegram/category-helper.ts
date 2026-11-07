import type { SupabaseClient } from '@supabase/supabase-js';
import { matchTargetCategory } from '../budget/budget-guard.ts';
import { syncAccountBalance } from '../account-balance.ts';

/**
 * Mencari atau membuat kategori pos belanja di tabel `categories`
 */
export async function resolveOrCreateCategory(
  supabase: SupabaseClient,
  householdId: string,
  categoryInput: string
): Promise<{ id: string; name: string; emoji: string }> {
  const targetCategory = matchTargetCategory(categoryInput);

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('household_id', householdId);

  let categoryRecord = categories?.find(
    (c) => c.name.toLowerCase() === targetCategory.name.toLowerCase()
  );

  if (!categoryRecord) {
    const { data: newCat } = await supabase
      .from('categories')
      .insert({
        household_id: householdId,
        name: targetCategory.name,
        type: 'expense',
      })
      .select('id, name')
      .maybeSingle();
    categoryRecord = newCat || undefined;
  }

  return {
    id: categoryRecord?.id || '',
    name: targetCategory.name,
    emoji: targetCategory.emoji,
  };
}

/**
 * Menyetel kategori transaksi belanja, memastikan direction: 'out', status: 'reconciled',
 * dan menyelaraskan saldo akun terkait secara idempoten.
 */
export async function assignTransactionCategory(
  supabase: SupabaseClient,
  householdId: string,
  txId: string,
  categoryInput: string,
  changerName: string
): Promise<{ success: boolean; categoryName: string; emoji: string; error?: string }> {
  const cat = await resolveOrCreateCategory(supabase, householdId, categoryInput);

  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id, merchant, direction, account_id')
    .eq('id', txId)
    .eq('household_id', householdId)
    .maybeSingle();

  const notesText = `Kategori diubah ke ${cat.name} via Telegram oleh ${changerName}`;

  const updatePayload: Record<string, any> = {
    category_id: cat.id || null,
    direction: 'out',
    status: 'reconciled',
    notes: notesText,
  };

  if (existingTx?.merchant?.startsWith('Transfer Internal:')) {
    updatePayload.merchant = existingTx.merchant.replace(/^Transfer Internal:\s*/i, '').trim() || 'Pengeluaran';
  }

  let { error: updateErr } = await supabase
    .from('transactions')
    .update(updatePayload)
    .eq('id', txId)
    .eq('household_id', householdId);

  if (updateErr && (updateErr.message?.includes('notes') || updateErr.code === '42703')) {
    delete updatePayload.notes;
    const retryRes = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', txId)
      .eq('household_id', householdId);
    updateErr = retryRes.error;
  }

  if (updateErr) {
    return { success: false, categoryName: cat.name, emoji: cat.emoji, error: updateErr.message };
  }

  const targetAccountId = existingTx?.account_id;
  if (targetAccountId) {
    await syncAccountBalance(supabase, targetAccountId);
  }

  return { success: true, categoryName: cat.name, emoji: cat.emoji };
}

