// ==============================================================================
// TELEGRAM CALLBACK HANDLER: src/lib/telegram/callback-handler.ts
// Menangani Interaksi Tombol Inline Telegram (Verifikasi, Closed-Loop AI, Alasan)
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  answerCallbackQuery,
  editTelegramMessageText,
  sendTelegramMessage,
} from './bot.ts';
import {
  formatExpenseVerifiedMessage,
  formatExpenseRejectedMessage,
} from './formatters.ts';
import { formatRupiah } from '../utils.ts';
import { extractPromoKeywordsFromText } from '../ai/adaptive-rules.ts';
import { syncAccountBalance, applyAccountBalanceDelta } from '../account-balance.ts';

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number | string;
    };
    text?: string;
  };
  data?: string;
}

interface TxWithRelations {
  id: string;
  status: string;
  amount: number;
  merchant: string;
  raw_notification?: string;
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
}

/**
 * Helper aman update status transaksi dengan toleransi jika kolom notes belum termigrasi
 */
async function updateTransactionStatus(
  supabase: SupabaseClient,
  householdId: string,
  txId: string,
  status: 'reconciled' | 'ignored',
  notesText: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Coba update status beserta notes
  const { error: errWithNotes } = await supabase
    .from('transactions')
    .update({ status, notes: notesText })
    .eq('id', txId)
    .eq('household_id', householdId);

  if (!errWithNotes) {
    return { success: true };
  }

  // 2. Jika kolom notes belum ada di schema database, fallback update status saja
  if (errWithNotes.message?.includes('notes') || errWithNotes.code === '42703') {
    const { error: fallbackErr } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', txId)
      .eq('household_id', householdId);

    if (!fallbackErr) {
      return { success: true };
    }
    return { success: false, error: fallbackErr.message };
  }

  return { success: false, error: errWithNotes.message };
}

/**
 * Menangani seluruh aksi dari callback query tombol inline
 */
export async function handleTelegramCallbackQuery(
  cq: TelegramCallbackQuery,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const data = cq.data || '';
  const message = cq.message;
  if (!message) {
    await answerCallbackQuery(cq.id);
    return;
  }

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const originalText = message.text || '';

  // 0. Konfirmasi Perubahan Saldo Rekening / Total Kas via Tombol
  if (data.startsWith('sok:')) {
    const parts = data.replace('sok:', '').split(':');
    const accId = parts[0];
    const targetBalance = Number(parts[1] || 0);

    const { data: targetAccount, error: accErr } = await supabase
      .from('accounts')
      .select('id, name, owner, balance')
      .eq('id', accId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (accErr || !targetAccount) {
      await answerCallbackQuery(cq.id, '⚠️ Rekening tidak ditemukan.', true);
      return;
    }

    const currentBalance = Number(targetAccount.balance || 0);
    const diff = targetBalance - currentBalance;

    if (diff !== 0) {
      const owner = targetAccount.owner === 'istri' ? 'istri' : 'suami';
      await supabase.from('transactions').insert({
        household_id: householdId,
        account_id: targetAccount.id,
        amount: Math.abs(diff),
        direction: diff > 0 ? 'in' : 'out',
        merchant: `Koreksi Saldo: ${targetAccount.name}`,
        raw_notification: `Penyesuaian saldo terkonfirmasi via Telegram: ${targetAccount.name} menjadi ${formatRupiah(targetBalance)} (Selisih: ${formatRupiah(diff)})`,
        source_device: owner,
        transaction_date: new Date().toISOString(),
        status: 'reconciled',
        dedupe_hash: `adj_${targetAccount.id}_${Date.now()}`,
        needs_review: false,
      });
    }

    await syncAccountBalance(supabase, targetAccount.id);
    await answerCallbackQuery(cq.id, '✅ Saldo berhasil disinkronkan!');

    const successText = `💰 *SALDO BERHASIL DIPERBARUI* ✅\n\n` +
      `Akun: *${targetAccount.name}* (${targetAccount.owner === 'istri' ? 'Istri' : 'Suami'})\n` +
      `Saldo Sekarang: \`${formatRupiah(targetBalance)}\`\n` +
      `Selisih Tercatat: \`${diff >= 0 ? '+' : ''}${formatRupiah(diff)}\`\n` +
      `Dikonfirmasi oleh: *${cq.from.first_name || 'Keluarga'}*`;

    await editTelegramMessageText(chatId, messageId, successText, {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  // 0.5. Pembatalan Penyesuaian Saldo
  if (data === 'scancel') {
    await answerCallbackQuery(cq.id, '🚫 Penyesuaian saldo dibatalkan.');
    await editTelegramMessageText(
      chatId,
      messageId,
      `🚫 *Penyesuaian saldo dibatalkan.*\nTidak ada perubahan pada saldo rekening keluarga.`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return;
  }

  // 1. Verifikasi Transaksi: [✅ Benar & Sesuai]
  if (data.startsWith('tx_ok:')) {
    const txId = data.replace('tx_ok:', '').trim();

    // Validasi keberadaan & status transaksi
    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, status, amount, direction, account_id, merchant, categories(name), accounts(name)')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !currentTx) {
      console.error('[Telegram Callback tx_ok Fetch Error]:', fetchErr?.message);
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    // Hindari duplikasi verifikasi
    if (currentTx.status === 'reconciled') {
      await answerCallbackQuery(cq.id, 'ℹ️ Transaksi ini sudah terverifikasi sebelumnya.');
      return;
    }

    const { success, error: updateErr } = await updateTransactionStatus(
      supabase,
      householdId,
      txId,
      'reconciled',
      `Diverifikasi via Telegram oleh ${cq.from.first_name || 'Keluarga'}`
    );

    if (!success) {
      console.error('[Telegram Callback tx_ok Update Error]:', updateErr);
      await answerCallbackQuery(cq.id, '⚠️ Gagal menyimpan status verifikasi.', true);
      return;
    }

    // Sinkronisasi saldo akun secara idempoten saat status bertransisi ke reconciled
    if (currentTx.account_id) {
      await syncAccountBalance(supabase, currentTx.account_id);
    }

    await answerCallbackQuery(cq.id, '✅ Transaksi diverifikasi!');

    const tx = currentTx as unknown as TxWithRelations;
    const text = formatExpenseVerifiedMessage({
      merchant: tx.merchant || 'Transaksi',
      amount: Number(tx.amount || 0),
      categoryName: tx.categories?.name || 'Lainnya',
      accountName: tx.accounts?.name || 'Utama',
      verifiedBy: cq.from.first_name || 'Keluarga',
    });

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 1.2. Menu Koreksi Mutasi Interaktif
  if (data.startsWith('tx_edit:')) {
    const txId = data.replace('tx_edit:', '').trim();
    await answerCallbackQuery(cq.id);

    const baseText = originalText
      .replace(/\n\n\*Pilih Koreksi Mutasi:\*.*$/s, '')
      .replace(/\n\n\*Pilih Alasan Penolakan:\*.*$/s, '')
      .replace(/\n\n\*Pilih rekening baru:\*.*$/s, '');
    const newText = `${baseText}\n\n*Pilih Koreksi Mutasi:*`;

    await editTelegramMessageText(chatId, messageId, newText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📈 Ini Pemasukan Luar', callback_data: `tx_in:${txId}` },
            { text: '💸 Ini Pengeluaran', callback_data: `tx_out:${txId}` },
          ],
          [
            { text: '🔄 Ini Transfer Internal', callback_data: `tx_mark_transfer:${txId}` },
            { text: '🏦 Pindah Rekening', callback_data: `tx_acc:${txId}` },
          ],
          [
            { text: '⬅️ Kembali', callback_data: `tx_back:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 1.3. Koreksi Menjadi Pemasukan Luar
  if (data.startsWith('tx_in:')) {
    const txId = data.replace('tx_in:', '').trim();

    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, amount, merchant, account_id, accounts(name)')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !currentTx) {
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const rawMerchant = currentTx.merchant || 'Pemasukan';
    const cleanMerchant = rawMerchant.replace(/^Transfer Internal:\s*/i, '');

    await supabase
      .from('transactions')
      .update({
        merchant: cleanMerchant,
        direction: 'in',
        status: 'reconciled',
        notes: `Diubah menjadi pemasukan luar via Telegram oleh ${cq.from.first_name || 'Keluarga'}`,
      })
      .eq('id', txId)
      .eq('household_id', householdId);

    if (currentTx.account_id) {
      await syncAccountBalance(supabase, currentTx.account_id);
    }

    await answerCallbackQuery(cq.id, '📈 Diubah menjadi Pemasukan Luar!');

    const accRelation = currentTx.accounts as unknown as { name?: string } | null;
    const accName = accRelation?.name || 'Rekening';
    const text = `📈 *PEMASUKAN LUAR TERKONFIRMASI* ✅\n\n` +
      `💵 *Sumber:* ${cleanMerchant}\n` +
      `💰 *Nominal:* \`${formatRupiah(Number(currentTx.amount || 0))}\`\n` +
      `🏦 *Masuk ke:* ${accName}\n` +
      `Diubah oleh: *${cq.from.first_name || 'Keluarga'}*\n\n` +
      `_Tercatat sebagai pemasukan riil keluarga dan menambah saldo kas._`;

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
            { text: '❌ Batalkan', callback_data: `tx_wrong_menu:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 1.4. Koreksi Menjadi Pengeluaran Biasa
  if (data.startsWith('tx_out:')) {
    const txId = data.replace('tx_out:', '').trim();

    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, amount, merchant, account_id, accounts(name)')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !currentTx) {
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const rawMerchant = currentTx.merchant || 'Pengeluaran';
    const cleanMerchant = rawMerchant.replace(/^Transfer Internal:\s*/i, '');

    await supabase
      .from('transactions')
      .update({
        merchant: cleanMerchant,
        direction: 'out',
        status: 'reconciled',
        notes: `Diubah menjadi pengeluaran via Telegram oleh ${cq.from.first_name || 'Keluarga'}`,
      })
      .eq('id', txId)
      .eq('household_id', householdId);

    if (currentTx.account_id) {
      await syncAccountBalance(supabase, currentTx.account_id);
    }

    await answerCallbackQuery(cq.id, '💸 Diubah menjadi Pengeluaran!');

    const accRelation = currentTx.accounts as unknown as { name?: string } | null;
    const accName = accRelation?.name || 'Rekening';
    const text = `💸 *PENGELUARAN TERKONFIRMASI* ✅\n\n` +
      `🛒 *Merchant:* ${cleanMerchant}\n` +
      `💰 *Nominal:* \`${formatRupiah(Number(currentTx.amount || 0))}\`\n` +
      `🏦 *Sumber:* ${accName}\n` +
      `Diubah oleh: *${cq.from.first_name || 'Keluarga'}*\n\n` +
      `_Tercatat sebagai pengeluaran keluarga dan mengurangi saldo akun._`;

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
            { text: '❌ Batalkan', callback_data: `tx_wrong_menu:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 1.5. Koreksi Transaksi Menjadi Transfer Internal: [🔄 Itu Transfer Sendiri]
  if (data.startsWith('tx_mark_transfer:')) {
    const txId = data.replace('tx_mark_transfer:', '').trim();

    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, amount, merchant, account_id, accounts(name)')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !currentTx) {
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const rawMerchant = currentTx.merchant || 'Transaksi';
    const cleanMerchant = rawMerchant.replace(/^Transfer Internal:\s*/i, '');
    const newMerchant = `Transfer Internal: ${cleanMerchant}`;

    await supabase
      .from('transactions')
      .update({
        merchant: newMerchant,
        status: 'reconciled',
        notes: `Ditandai sebagai transfer internal via Telegram oleh ${cq.from.first_name || 'Keluarga'}`,
      })
      .eq('id', txId)
      .eq('household_id', householdId);

    if (currentTx.account_id) {
      await syncAccountBalance(supabase, currentTx.account_id);
    }

    await answerCallbackQuery(cq.id, '🔄 Diubah menjadi Transfer Internal!');

    const accRelation = currentTx.accounts as unknown as { name?: string } | null;
    const accName = accRelation?.name || 'Rekening';
    const text = `🔄 *PERPINDAHAN DANA INTERNAL DIKONFIRMASI* ✅\n\nTransaksi: *${cleanMerchant}*\nNominal: \`${formatRupiah(Number(currentTx.amount || 0))}\`\nAkun: *${accName}*\nDiubah oleh: *${cq.from.first_name || 'Keluarga'}*\n\n_Transaksi ini disetel sebagai mutasi antar rekening/dompet keluarga dan tidak memotong anggaran belanja._`;

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
            { text: '❌ Batalkan', callback_data: `tx_wrong_menu:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 1.6. Buka Menu Pilihan Pindah Rekening
  if (data.startsWith('tx_acc:')) {
    const txId = data.replace('tx_acc:', '').trim();
    await answerCallbackQuery(cq.id);

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, owner')
      .eq('household_id', householdId)
      .eq('is_active', true);

    const buttons = (accounts || []).map((a) => [
      {
        text: `🏦 ${a.name} (${a.owner === 'istri' ? 'Istri' : 'Suami'})`,
        callback_data: `tx_setacc:${txId}:${a.id}`,
      },
    ]);
    buttons.push([{ text: '⬅️ Kembali', callback_data: `tx_edit:${txId}` }]);

    const baseText = originalText
      .replace(/\n\n\*Pilih Koreksi Mutasi:\*.*$/s, '')
      .replace(/\n\n\*Pilih rekening baru:\*.*$/s, '');
    const newText = `${baseText}\n\n*Pilih rekening baru:*`;

    await editTelegramMessageText(chatId, messageId, newText, {
      reply_markup: { inline_keyboard: buttons },
    });
    return;
  }

  // 1.7. Terapkan Pindah Rekening
  if (data.startsWith('tx_setacc:')) {
    const parts = data.replace('tx_setacc:', '').split(':');
    const txId = parts[0];
    const newAccId = parts[1];

    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, account_id, amount, merchant')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !currentTx) {
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const oldAccId = currentTx.account_id;

    const { data: newAccount } = await supabase
      .from('accounts')
      .select('id, name, owner')
      .eq('id', newAccId)
      .maybeSingle();

    await supabase
      .from('transactions')
      .update({ account_id: newAccId })
      .eq('id', txId);

    // Sinkronkan saldo kedua akun
    if (oldAccId) await syncAccountBalance(supabase, oldAccId);
    if (newAccId) await syncAccountBalance(supabase, newAccId);

    await answerCallbackQuery(cq.id, '🏦 Rekening berhasil dipindahkan!');

    const baseText = originalText
      .replace(/\n\n\*Pilih rekening baru:\*.*$/s, '')
      .replace(/\n\n✅ _Rekening dipindahkan.*$/s, '');
    const newAccName = newAccount ? `${newAccount.name} (${newAccount.owner === 'istri' ? 'Istri' : 'Suami'})` : 'Rekening Baru';
    const updatedText = `${baseText}\n\n✅ _Rekening dipindahkan ke *${newAccName}*._`;

    await editTelegramMessageText(chatId, messageId, updatedText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
            { text: '❌ Batalkan', callback_data: `tx_wrong_menu:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 2. Menu Pilihan Alasan Penolakan: [❌ Salah / Bukan Belanja]
  if (data.startsWith('tx_wrong_menu:')) {
    const txId = data.replace('tx_wrong_menu:', '').trim();
    await answerCallbackQuery(cq.id);

    const baseText = originalText
      .replace(/\n\n\*Pilih Alasan Penolakan:\*.*$/s, '')
      .replace(/\n\n\*Pilih Koreksi Mutasi:\*.*$/s, '')
      .replace(/\n\n\*Pilih rekening baru:\*.*$/s, '');
    const newText = `${baseText}\n\n*Pilih Alasan Penolakan:*`;

    await editTelegramMessageText(chatId, messageId, newText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Promo / Iklan', callback_data: `tx_rej_promo:${txId}` }],
          [{ text: '👥 Tercatat Dobel', callback_data: `tx_rej_dup:${txId}` }],
          [{ text: '✍️ Tulis Alasan Lain', callback_data: `tx_rej_custom:${txId}` }],
          [{ text: '⬅️ Kembali', callback_data: `tx_back:${txId}` }],
        ],
      },
    });
    return;
  }

  // 3. Tombol Kembali ke Opsi Utama
  if (data.startsWith('tx_back:')) {
    const txId = data.replace('tx_back:', '').trim();
    await answerCallbackQuery(cq.id);

    const baseText = originalText
      .replace(/\n\n\*Pilih Alasan Penolakan:\*.*$/s, '')
      .replace(/\n\n\*Pilih Koreksi Mutasi:\*.*$/s, '')
      .replace(/\n\n\*Pilih rekening baru:\*.*$/s, '');

    await editTelegramMessageText(chatId, messageId, baseText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Koreksi Mutasi', callback_data: `tx_edit:${txId}` },
            { text: '❌ Batalkan', callback_data: `tx_wrong_menu:${txId}` },
          ],
        ],
      },
    });
    return;
  }

  // 4. Alasan 1: [📢 Promo / Iklan] (Closed-Loop Learning)
  if (data.startsWith('tx_rej_promo:')) {
    const txId = data.replace('tx_rej_promo:', '').trim();

    const { data: targetTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, merchant, amount, direction, account_id, status, raw_notification')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !targetTx) {
      console.error('[Telegram Callback tx_rej_promo Fetch Error]:', fetchErr?.message);
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const { success, error: updateErr } = await updateTransactionStatus(
      supabase,
      householdId,
      txId,
      'ignored',
      'Ditolak via Telegram: Promo / Iklan'
    );

    if (!success) {
      console.error('[Telegram Callback tx_rej_promo Update Error]:', updateErr);
      await answerCallbackQuery(cq.id, '⚠️ Gagal memperbarui status transaksi.', true);
      return;
    }

    // Jika transaksi sebelumnya reconciled, pulihkan saldo akun
    if (targetTx.status === 'reconciled' && targetTx.account_id && targetTx.amount) {
      const revertDelta = targetTx.direction === 'in' ? -Number(targetTx.amount) : Number(targetTx.amount);
      await applyAccountBalanceDelta(supabase, targetTx.account_id, revertDelta);
    }

    await answerCallbackQuery(cq.id, 'Pola promo dipelajari oleh AI.');

    const merchant = targetTx.merchant || '';
    const rawText = targetTx.raw_notification || '';
    const keywords = extractPromoKeywordsFromText(
      merchant,
      rawText,
      'Ditolak manual via Telegram sebagai promo',
      true
    );

    // Simpan kata kunci ke learned_promo_rules untuk closed-loop learning (hanya jika ada kata promo valid)
    for (const kw of keywords) {
      await supabase.from('learned_promo_rules').upsert(
        {
          household_id: householdId,
          keyword: kw,
          source: 'user_manual',
          sample_text: merchant,
        },
        { onConflict: 'household_id,keyword' }
      );
    }

    const text = formatExpenseRejectedMessage({
      merchant: merchant || 'Transaksi',
      amount: Number(targetTx.amount || 0),
      reason: 'Promo / Iklan',
      learnedByAi: keywords.length > 0,
    });

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  // 5. Alasan 2: [👥 Tercatat Dobel]
  if (data.startsWith('tx_rej_dup:')) {
    const txId = data.replace('tx_rej_dup:', '').trim();

    const { data: targetTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, merchant, amount, direction, account_id, status')
      .eq('id', txId)
      .eq('household_id', householdId)
      .maybeSingle();

    if (fetchErr || !targetTx) {
      console.error('[Telegram Callback tx_rej_dup Fetch Error]:', fetchErr?.message);
      await answerCallbackQuery(cq.id, '⚠️ Data transaksi tidak ditemukan.', true);
      return;
    }

    const { success, error: updateErr } = await updateTransactionStatus(
      supabase,
      householdId,
      txId,
      'ignored',
      'Ditolak via Telegram: Tercatat Dobel / Duplikat'
    );

    if (!success) {
      console.error('[Telegram Callback tx_rej_dup Update Error]:', updateErr);
      await answerCallbackQuery(cq.id, '⚠️ Gagal memperbarui status transaksi.', true);
      return;
    }

    // Jika transaksi sebelumnya reconciled, pulihkan saldo akun
    if (targetTx.status === 'reconciled' && targetTx.account_id && targetTx.amount) {
      const revertDelta = targetTx.direction === 'in' ? -Number(targetTx.amount) : Number(targetTx.amount);
      await applyAccountBalanceDelta(supabase, targetTx.account_id, revertDelta);
    }

    await answerCallbackQuery(cq.id, 'Ditandai transaksi dobel.');

    const text = formatExpenseRejectedMessage({
      merchant: targetTx.merchant || 'Transaksi',
      amount: Number(targetTx.amount || 0),
      reason: 'Tercatat Dobel / Duplikat',
      learnedByAi: false,
    });

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  // 6. Alasan 3: [✍️ Tulis Alasan Lain] (Memicu Balasan Pengguna)
  if (data.startsWith('tx_rej_custom:')) {
    const txId = data.replace('tx_rej_custom:', '').trim();
    await answerCallbackQuery(cq.id);

    const shortId = txId.slice(0, 8);
    await sendTelegramMessage(
      chatId,
      `✍️ *Tulis Alasan Pembatalan*\n\nBalas pesan ini dengan alasan penolakan mutasi #${shortId} [REF:${txId}]:\n_(Contoh: transfer ke orang tua, tarik tunai, pindah kantong)_`,
      {
        reply_markup: { force_reply: true },
      }
    );
    return;
  }

  // Default fallback jika callback tidak dikenal
  await answerCallbackQuery(cq.id);
}
