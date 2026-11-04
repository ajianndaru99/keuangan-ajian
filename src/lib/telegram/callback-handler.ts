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
import { extractPromoKeywordsFromText } from '../ai/adaptive-rules.ts';

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

  // 1. Verifikasi Transaksi: [✅ Benar & Sesuai]
  if (data.startsWith('tx_ok:')) {
    const txId = data.replace('tx_ok:', '').trim();

    // Validasi keberadaan & status transaksi
    const { data: currentTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('id, status, amount, merchant, categories(name), accounts(name)')
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
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  // 2. Menu Pilihan Alasan Penolakan: [❌ Salah / Bukan Belanja]
  if (data.startsWith('tx_wrong_menu:')) {
    const txId = data.replace('tx_wrong_menu:', '').trim();
    await answerCallbackQuery(cq.id);

    const baseText = originalText.replace(/\n\n\*Pilih Alasan Penolakan:\*.*$/s, '');
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

    const baseText = originalText.replace(/\n\n\*Pilih Alasan Penolakan:\*.*$/s, '');
    await editTelegramMessageText(chatId, messageId, baseText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Benar & Sesuai', callback_data: `tx_ok:${txId}` },
            { text: '❌ Salah / Bukan Belanja', callback_data: `tx_wrong_menu:${txId}` },
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
      .select('id, merchant, amount, raw_notification')
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
      .select('id, merchant, amount')
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
