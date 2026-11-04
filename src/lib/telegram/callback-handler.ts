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
  amount: number;
  merchant: string;
  raw_notification?: string;
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
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
    await answerCallbackQuery(cq.id, '✅ Transaksi diverifikasi!');

    const { data: updatedTx } = await supabase
      .from('transactions')
      .update({ status: 'reconciled' })
      .eq('id', txId)
      .eq('household_id', householdId)
      .select('id, amount, merchant, categories(name), accounts(name)')
      .maybeSingle();

    if (updatedTx) {
      const tx = updatedTx as unknown as TxWithRelations;
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
    }
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
    await answerCallbackQuery(cq.id, 'Pola promo dipelajari oleh AI.');

    const { data: updatedTx } = await supabase
      .from('transactions')
      .update({
        status: 'ignored',
        notes: 'Ditolak via Telegram: Promo / Iklan',
      })
      .eq('id', txId)
      .eq('household_id', householdId)
      .select('merchant, amount, raw_notification')
      .maybeSingle();

    if (updatedTx) {
      const merchant = updatedTx.merchant || '';
      const rawText = updatedTx.raw_notification || '';
      const keywords = extractPromoKeywordsFromText(
        merchant,
        rawText,
        'Ditolak manual via Telegram sebagai promo',
        true
      );

      // Simpan kata kunci ke learned_promo_rules untuk closed-loop learning
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
        amount: Number(updatedTx.amount || 0),
        reason: 'Promo / Iklan',
        learnedByAi: keywords.length > 0,
      });

      await editTelegramMessageText(chatId, messageId, text, {
        reply_markup: { inline_keyboard: [] },
      });
    }
    return;
  }

  // 5. Alasan 2: [👥 Tercatat Dobel]
  if (data.startsWith('tx_rej_dup:')) {
    const txId = data.replace('tx_rej_dup:', '').trim();
    await answerCallbackQuery(cq.id, 'Ditandai transaksi dobel.');

    const { data: updatedTx } = await supabase
      .from('transactions')
      .update({
        status: 'ignored',
        notes: 'Ditolak via Telegram: Tercatat Dobel / Duplikat',
      })
      .eq('id', txId)
      .eq('household_id', householdId)
      .select('merchant, amount')
      .maybeSingle();

    if (updatedTx) {
      const text = formatExpenseRejectedMessage({
        merchant: updatedTx.merchant || 'Transaksi',
        amount: Number(updatedTx.amount || 0),
        reason: 'Tercatat Dobel / Duplikat',
        learnedByAi: false,
      });

      await editTelegramMessageText(chatId, messageId, text, {
        reply_markup: { inline_keyboard: [] },
      });
    }
    return;
  }

  // 6. Alasan 3: [✍️ Tulis Alasan Lain] (Memicu Balasan Pengguna)
  if (data.startsWith('tx_rej_custom:')) {
    const txId = data.replace('tx_rej_custom:', '').trim();
    await answerCallbackQuery(cq.id);

    const shortId = txId.slice(0, 8);
    await sendTelegramMessage(
      chatId,
      `✍️ *Tulis Alasan Pembatalan*\n\nBalas (reply) pesan ini dengan alasan penolakan mutasi #${shortId}:\n_(Contoh: transfer ke ibu, tarik tunai, pindah kantong)_`,
      {
        reply_markup: { force_reply: true },
      }
    );
    return;
  }

  // Default fallback jika callback tidak dikenal
  await answerCallbackQuery(cq.id);
}
