// ==============================================================================
// TELEGRAM SETTINGS COMMANDS: src/lib/telegram/settings-commands.ts
// Handler perintah konfigurasi: set saldo, set anggaran, set gajian, & force-reply
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage, editTelegramMessageText } from './bot.ts';
import { formatBudgetUpdatedWithStatusMessage } from './formatters.ts';
import type { CategoryBudgetItem } from './formatters.ts';
import { formatRupiah } from '../utils.ts';
import { matchTargetCategory, TARGET_BUDGET_CATEGORIES } from '../budget/budget-guard.ts';
import { getMonthlyRange, getBudgetPeriodKey } from '../date-utils.ts';
import { buildFinancialContext } from './commands.ts';
import { syncAccountBalance } from '../account-balance.ts';
import { extractPromoKeywordsFromText } from '../ai/adaptive-rules.ts';
import { assignTransactionCategory } from './category-helper.ts';
import {
  parseNominal,
  parseSetSaldoCommand,
  parseSetAnggaranCommand,
  parseSetGajianCommand,
} from './nlp-chat.ts';

export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name?: string;
    username?: string;
    is_bot?: boolean;
  };
  chat: {
    id: number | string;
    title?: string;
    type: string;
  };
  date: number;
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    width: number;
    height: number;
  }>;
  reply_to_message?: {
    message_id: number;
    text?: string;
  };
}

/**
 * Kebijakan Tagging: Pastikan bot hanya merespon bila ditag di grup (Anti-Nyamber)
 */
export function shouldProcessChat(message: TelegramMessage, rawText: string): boolean {
  // 1. Chat pribadi 1-on-1 dengan bot selalu diproses
  if (message.chat?.type === 'private') return true;

  // 2. Perintah slash standar selalu diproses (/status, /anggaran, /rekap, dll)
  if (rawText.startsWith('/')) return true;

  // 3. Jika pengguna me-reply pesan dari bot
  if (message.reply_to_message) return true;

  // 4. Jika pesan menyebut / men-tag bot (@...)
  if (rawText.includes('@')) return true;

  // 5. Selain itu (obrolan bebas di grup tanpa tag): DIAM / ABAIKAN
  return false;
}

/**
 * Membersihkan mention bot (@username) dari teks pesan agar query bersih alami
 */
export function stripBotMentions(rawText: string): string {
  return rawText.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Mencari akun rekening yang paling cocok dengan memperhitungkan nama dan pemilik (owner)
 */
export function findMatchingAccount(
  accounts: Array<{ id: string; name: string; owner: string; balance: number }>,
  query: string
) {
  const clean = query.toLowerCase().trim();

  // 1. Prioritas 1: kecocokan nama dan pemilik sekaligus (misal "dana istri" -> nama 'dana' & owner 'istri')
  const exactBoth = accounts.find((a) => {
    const accName = a.name.toLowerCase();
    const accOwner = a.owner.toLowerCase();
    return clean.includes(accName) && clean.includes(accOwner);
  });
  if (exactBoth) return exactBoth;

  // 2. Prioritas 2: nama akun persis
  const exactName = accounts.find((a) => a.name.toLowerCase() === clean);
  if (exactName) return exactName;

  // 3. Prioritas 3: substring nama akun
  const substringName = accounts.find((a) =>
    a.name.toLowerCase().includes(clean) || clean.includes(a.name.toLowerCase())
  );
  return substringName || null;
}

/**
 * Mengecek apakah balasan pengguna merupakan komplain / pembatalan / laporan spam
 */
export function isDirectRejectionFeedback(text: string): boolean {
  const clean = text.trim();
  if (!clean || clean.length > 100) return false;
  return /\b(salah|spam|promo|iklan|batal|batalkan|hapus|bukan\s+transaksi|bukan\s+belanja|dobel|duplikat|keliru|abaikan|ngaco|ngawur|hoax)\b/i.test(clean);
}

/**
 * Mengecek apakah balasan pengguna merupakan instruksi koreksi kategori (misal: "masuk dapur", "kategori belanja dapur")
 */
export function isDirectCategoryFeedback(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean || clean.length > 60) return false;
  return (
    /^(?:masuk|kategori|pos|ke|ubah\s+ke|pindah\s+ke|set\s+kategori)\s+([a-zA-Z\s&/]+)$/i.test(clean) ||
    /^(?:dapur|belanja dapur|makan|jajan|makan & jajan|bensin|transport|transportasi|tagihan|utilitas|kebutuhan rumah|jalan-jalan|liburan|darurat|keperluan mendadak)$/i.test(clean)
  );
}

/**
 * Mengekstrak nominal Rupiah dari teks pesan notifikasi bot Telegram
 */
export function extractAmountFromBotAlertText(alertText: string): number {
  const match = alertText.match(/(?:Nominal|Total\s+Belanja)[\s*:`]+(?:Rp|IDR)?\.?\s*([\d.,]+)/i);
  if (!match || !match[1]) return 0;
  return parseNominal(match[1]);
}

/**
 * Membatalkan transaksi, menyinkronkan saldo akun, dan mempelajari pola spam/promo jika relevan
 */
async function cancelTransactionAndLearnSpam(
  targetTx: {
    id: string;
    merchant?: string | null;
    amount?: number | null;
    direction?: string | null;
    account_id?: string | null;
    status?: string | null;
    raw_notification?: string | null;
  },
  userReason: string,
  message: TelegramMessage,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const isSpamOrPromo = /\b(spam|promo|iklan|penawaran|voucher|diskon|undian|game|hadiah)\b/i.test(userReason);
  const notesText = isSpamOrPromo
    ? `Ditolak via Reply Telegram (Spam/Promo): ${userReason}`
    : `Ditolak via Reply Telegram: ${userReason}`;

  let { error: updateErr } = await supabase
    .from('transactions')
    .update({
      status: 'ignored',
      notes: notesText,
    })
    .eq('id', targetTx.id)
    .eq('household_id', householdId);

  if (updateErr && (updateErr.message?.includes('notes') || updateErr.code === '42703')) {
    const retryRes = await supabase
      .from('transactions')
      .update({ status: 'ignored' })
      .eq('id', targetTx.id)
      .eq('household_id', householdId);
    updateErr = retryRes.error;
  }

  if (updateErr) {
    console.error('[HandleCustomRejection Update Error]:', updateErr.message);
    await sendTelegramMessage(
      message.chat.id,
      '[ERROR] Gagal memperbarui status pembatalan ke database.',
      { reply_to_message_id: message.message_id }
    );
    return true;
  }

  // Pulihkan / sinkronkan saldo akun secara idempoten
  if (targetTx.account_id) {
    await syncAccountBalance(supabase, targetTx.account_id);
  }

  // Closed-Loop Learning jika ditandai sebagai spam / promo / iklan
  let learnedCount = 0;
  if (isSpamOrPromo) {
    const merchant = targetTx.merchant || '';
    const rawNotif = targetTx.raw_notification || '';
    const keywords = extractPromoKeywordsFromText(merchant, rawNotif, userReason, true);
    for (const kw of keywords) {
      await supabase.from('learned_promo_rules').upsert(
        {
          household_id: householdId,
          keyword: kw,
          source: 'user_manual',
          sample_text: merchant || rawNotif.slice(0, 80),
        },
        { onConflict: 'household_id,keyword' }
      );
      learnedCount++;
    }
  }

  const txName = targetTx.merchant || 'Transaksi';
  const txAmount = targetTx.amount ? formatRupiah(Number(targetTx.amount)) : '';
  const aiNote = isSpamOrPromo
    ? `\n[INFO AI] _Notifikasi ini ditandai sebagai Spam/Promo${learnedCount > 0 ? ' dan polanya telah dipelajari agar otomatis diblokir di kemudian hari' : ''}._`
    : '';

  // Perbarui pesan alert asli bot jika memungkinkan agar tombol hilang dan status jelas
  if (message.reply_to_message?.message_id && message.reply_to_message.text && !message.reply_to_message.text.includes('Tulis Alasan Pembatalan')) {
    const rejectedAlertText =
      `*[DIBATALKAN] TRANSAKSI DIBATALKAN / SPAM*\n\n` +
      `Mutasi: ${txName}\n` +
      `Nominal: \`${txAmount}\`\n` +
      `Catatan: ${userReason}`;
    try {
      await editTelegramMessageText(message.chat.id, message.reply_to_message.message_id, rejectedAlertText, {
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // Abaikan jika pesan lama tidak bisa diedit
    }
  }

  await sendTelegramMessage(
    message.chat.id,
    `*[DIBATALKAN] Transaksi Berhasil Dibatalkan*\n\nTransaksi: *${txName}* ${txAmount ? `(\`${txAmount}\`)` : ''}\nAlasan: _"${userReason}"_\n\n_Data telah diabaikan, saldo akun diselaraskan ulang, dan tidak akan dihitung ke rekap keluarga._${aiNote}`,
    { reply_to_message_id: message.message_id }
  );

  return true;
}

/**
 * Memperbarui kategori transaksi via reply teks pengguna
 */
async function updateTransactionCategoryFromReply(
  targetTx: {
    id: string;
    merchant?: string | null;
    amount?: number | null;
    account_id?: string | null;
  },
  userCategoryText: string,
  message: TelegramMessage,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const changerName = message.from?.first_name || 'Keluarga';
  const result = await assignTransactionCategory(supabase, householdId, targetTx.id, userCategoryText, changerName);

  if (!result.success) {
    console.error('[UpdateCategoryFromReply Error]:', result.error);
    await sendTelegramMessage(
      message.chat.id,
      '[ERROR] Gagal memperbarui kategori ke database.',
      { reply_to_message_id: message.message_id }
    );
    return true;
  }

  const txName = targetTx.merchant || 'Transaksi';
  const txAmount = targetTx.amount ? formatRupiah(Number(targetTx.amount)) : '';

  await sendTelegramMessage(
    message.chat.id,
    `*[BERHASIL] Kategori Berhasil Diperbarui*\n\nTransaksi: *${txName}* ${txAmount ? `(\`${txAmount}\`)` : ''}\nKategori Baru: *${result.categoryName}*\n\n_Transaksi berstatus Reconciled dan dialokasikan ke pos belanja ${result.categoryName}._`,
    { reply_to_message_id: message.message_id }
  );

  return true;
}

/**
 * Handler Balasan Teks Pengguna untuk Pembatalan Transaksi / Laporan Spam
 * Mendukung:
 * 1. Force Reply resmi dengan tag [REF:uuid]
 * 2. Reply langsung ("Ini salah", "Itu spam", "Promo", "Batalkan") ke pesan notifikasi transaksi bot
 * 3. Reply langsung koreksi kategori ("masuk dapur", "kategori belanja dapur")
 * 4. Pesan susulan ("Itu spam", "Ini salah") terhadap transaksi terakhir yang baru tercatat
 */
export async function handleCustomRejectionReply(
  message: TelegramMessage,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const replyText = message.reply_to_message?.text || '';
  const userReason = stripBotMentions(message.text || '').trim();
  if (!userReason) return false;

  // Kasus 1: Balasan ke Force Reply "Tulis Alasan Pembatalan [REF:uuid]"
  if (replyText.includes('Tulis Alasan Pembatalan')) {
    const match = replyText.match(/\[REF:([a-f0-9-]{36})\]/i);
    if (!match) return false;

    const fullTxId = match[1];
    const { data: prevTx } = await supabase
      .from('transactions')
      .select('id, merchant, amount, direction, account_id, status, raw_notification')
      .eq('id', fullTxId)
      .eq('household_id', householdId)
      .maybeSingle();

    return cancelTransactionAndLearnSpam(
      prevTx || { id: fullTxId },
      userReason,
      message,
      supabase,
      householdId
    );
  }

  // Kasus 2: Balasan langsung ke kartu notifikasi transaksi/perpindahan dana bot
  const isBotTransactionAlert =
    replyText.includes('PERPINDAHAN DANA') ||
    replyText.includes('PENGELUARAN') ||
    replyText.includes('PEMASUKAN') ||
    replyText.includes('STRUK BERHASIL DIPINDAI');

  if (isBotTransactionAlert) {
    const refMatch = replyText.match(/\[REF:([a-f0-9-]{36})\]/i);

    // 2.A: Koreksi Kategori ("masuk dapur", "kategori bensin", dll)
    if (isDirectCategoryFeedback(userReason)) {
      if (refMatch) {
        const { data: txByRef } = await supabase
          .from('transactions')
          .select('id, merchant, amount, direction, account_id, status, raw_notification')
          .eq('id', refMatch[1])
          .eq('household_id', householdId)
          .maybeSingle();
        if (txByRef) {
          return updateTransactionCategoryFromReply(txByRef, userReason, message, supabase, householdId);
        }
      }

      const alertAmount = extractAmountFromBotAlertText(replyText);
      let query = supabase
        .from('transactions')
        .select('id, merchant, amount, direction, account_id, status, raw_notification')
        .eq('household_id', householdId)
        .neq('status', 'ignored')
        .order('created_at', { ascending: false })
        .limit(1);

      if (alertAmount > 0) {
        query = query.eq('amount', alertAmount);
      }

      const { data: matchedTx } = await query.maybeSingle();
      if (matchedTx) {
        return updateTransactionCategoryFromReply(matchedTx, userReason, message, supabase, householdId);
      }
    }

    // 2.B: Pembatalan / Laporan Spam
    if (isDirectRejectionFeedback(userReason)) {
      if (refMatch) {
        const { data: txByRef } = await supabase
          .from('transactions')
          .select('id, merchant, amount, direction, account_id, status, raw_notification')
          .eq('id', refMatch[1])
          .eq('household_id', householdId)
          .maybeSingle();
        if (txByRef) {
          return cancelTransactionAndLearnSpam(txByRef, userReason, message, supabase, householdId);
        }
      }

      const alertAmount = extractAmountFromBotAlertText(replyText);
      let query = supabase
        .from('transactions')
        .select('id, merchant, amount, direction, account_id, status, raw_notification')
        .eq('household_id', householdId)
        .neq('status', 'ignored')
        .order('created_at', { ascending: false })
        .limit(1);

      if (alertAmount > 0) {
        query = query.eq('amount', alertAmount);
      }

      const { data: matchedTx } = await query.maybeSingle();
      if (matchedTx) {
        return cancelTransactionAndLearnSpam(matchedTx, userReason, message, supabase, householdId);
      }
    }
  }

  // Kasus 3: Pesan komplain ("Itu spam", "Ini salah", "Itu promo", "Batalkan")
  const isComplaint = isDirectRejectionFeedback(userReason) || /^(?:itu|ini|yg\s+tadi|yang\s+barusan)?\s*(?:salah|spam|promo|iklan|bukan\s+transaksi|hapus|batalkan)\s*[.!?]*$/i.test(userReason);
  if (isComplaint) {
    const { data: latestTx } = await supabase
      .from('transactions')
      .select('id, merchant, amount, direction, account_id, status, raw_notification')
      .eq('household_id', householdId)
      .neq('status', 'ignored')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestTx) {
      return cancelTransactionAndLearnSpam(latestTx, userReason, message, supabase, householdId);
    }
  }

  return false;
}

/**
 * Menampilkan Kartu Konfirmasi atau Pemilihan Rekening Penyesuaian Saldo
 */
export async function promptSetSaldoConfirmation(
  accountName: string,
  targetAmount: number,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, owner, balance')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (accErr || !accounts || accounts.length === 0) {
    console.error('[SetSaldo Account Fetch Error]:', accErr?.message);
    await sendTelegramMessage(chatId, '[ERROR] Gagal memuat daftar rekening dari database.', { reply_to_message_id: messageId });
    return true;
  }

  // Kasus A: Penyesuaian Total Kas (tampilkan pilihan rekening dengan konfirmasi perantara sask:)
  if (accountName === 'total_kas') {
    const totalKas = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const buttons = accounts.map((a) => [
      {
        text: `${a.name} (Saldo: ${formatRupiah(Number(a.balance || 0))}) -> ${formatRupiah(targetAmount)}`,
        callback_data: `sask:${a.id}:${targetAmount}`,
      },
    ]);
    buttons.push([{ text: 'Batalkan', callback_data: 'scancel' }]);

    const text = `*[PENYESUAIAN KAS] PENYESUAIAN TOTAL KAS KELUARGA*\n\n` +
      `Total kas siap pakai saat ini: \`${formatRupiah(totalKas)}\`\n` +
      `Target nominal baru: \`${formatRupiah(targetAmount)}\`\n\n` +
      `_Pilih rekening mana yang ingin disesuaikan saldonya ke nominal ini (akan ada layar konfirmasi):_`;

    await sendTelegramMessage(chatId, text, {
      reply_to_message_id: messageId,
      reply_markup: { inline_keyboard: buttons },
    });
    return true;
  }

  // Kasus B: Penyesuaian Akun Spesifik
  const targetAccount = findMatchingAccount(
    accounts.map((a) => ({
      id: a.id,
      name: a.name,
      owner: a.owner,
      balance: Number(a.balance || 0),
    })),
    accountName
  );

  if (!targetAccount) {
    const list = accounts.map((a) => `• *${a.name}* (${a.owner === 'istri' ? 'Istri' : 'Suami'}) — Saldo: \`${formatRupiah(Number(a.balance || 0))}\``).join('\n');
    await sendTelegramMessage(
      chatId,
      `*[PERHATIAN] Akun ${accountName} tidak ditemukan di dasbor.*\n\nRekening aktif yang terdaftar saat ini:\n${list || 'Belum ada rekening'}\n\n_Contoh perintah:_ \`set saldo dana suami 2jt\` atau \`total kas ganti 1jt\``,
      { reply_to_message_id: messageId }
    );
    return true;
  }

  const currentBalance = Number(targetAccount.balance || 0);
  const diff = targetAmount - currentBalance;
  const otherAccountsTotal = accounts
    .filter((a) => a.id !== targetAccount.id)
    .reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const projectedTotalKas = otherAccountsTotal + targetAmount;

  const confirmText = `*[KONFIRMASI] PERUBAHAN SALDO REKENING*\n\n` +
    `Akun: ${targetAccount.name} (${targetAccount.owner === 'istri' ? 'Istri' : 'Suami'})\n` +
    `Saldo Saat Ini: \`${formatRupiah(currentBalance)}\`\n` +
    `Saldo Baru: \`${formatRupiah(targetAmount)}\`\n` +
    `Selisih Koreksi: \`${diff >= 0 ? '+' : ''}${formatRupiah(diff)}\`\n` +
    `Proyeksi Total Kas: \`${formatRupiah(projectedTotalKas)}\`\n\n` +
    `_Tindakan ini akan mempengaruhi total kas siap pakai keluarga. Pastikan angka sudah benar sebelum konfirmasi._`;

  await sendTelegramMessage(chatId, confirmText, {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Ya, Perbarui Saldo', callback_data: `sok:${targetAccount.id}:${targetAmount}` },
          { text: 'Batalkan', callback_data: 'scancel' },
        ],
      ],
    },
  });
  return true;
}

/**
 * Handler Alur Konfirmasi Dua Langkah Penyesuaian Saldo / Total Kas
 */
export async function handleSetSaldoFlow(
  rawText: string,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const setSaldoCmd = parseSetSaldoCommand(rawText);
  if (!setSaldoCmd) return false;
  return promptSetSaldoConfirmation(setSaldoCmd.accountName, setSaldoCmd.amount, chatId, messageId, supabase, householdId);
}

/**
 * Handler Atur Pagu Anggaran Kategori
 */
export async function handleSetAnggaranFlow(
  rawText: string,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<boolean> {
  const setAnggaranCmd = parseSetAnggaranCommand(rawText);
  if (!setAnggaranCmd) return false;

  const target = matchTargetCategory(setAnggaranCmd.categoryName);
  const dateRange = getMonthlyRange(0, monthStartDay);
  const periodMonth = getBudgetPeriodKey(dateRange.startDate, monthStartDay);

  let { error: bgErr } = await supabase.from('category_budgets').upsert(
    {
      household_id: householdId,
      category_id: target.id,
      category_name: target.name,
      limit_amount: setAnggaranCmd.amount,
      period_month: periodMonth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_id,category_id,period_month' }
  );

  // Fallback 1: Jika kolom updated_at belum ada di schema database
  if (bgErr && bgErr.code === '42703') {
    const retry = await supabase.from('category_budgets').upsert(
      {
        household_id: householdId,
        category_id: target.id,
        category_name: target.name,
        limit_amount: setAnggaranCmd.amount,
        period_month: periodMonth,
      },
      { onConflict: 'household_id,category_id,period_month' }
    );
    bgErr = retry.error;
  }

  // Fallback 2: Jika constraint onConflict belum dibuat atau gagal dicocokkan
  if (bgErr && (bgErr.code === '42P10' || bgErr.message?.includes('ON CONFLICT') || bgErr.message?.includes('constraint'))) {
    const { data: existingBudget } = await supabase
      .from('category_budgets')
      .select('id')
      .eq('household_id', householdId)
      .eq('category_id', target.id)
      .eq('period_month', periodMonth)
      .maybeSingle();

    if (existingBudget?.id) {
      const updateRes = await supabase
        .from('category_budgets')
        .update({
          limit_amount: setAnggaranCmd.amount,
          category_name: target.name,
        })
        .eq('id', existingBudget.id);
      bgErr = updateRes.error;
    } else {
      const insertRes = await supabase
        .from('category_budgets')
        .insert({
          household_id: householdId,
          category_id: target.id,
          category_name: target.name,
          limit_amount: setAnggaranCmd.amount,
          period_month: periodMonth,
        });
      bgErr = insertRes.error;
    }
  }

  if (bgErr) {
    console.error('[SetAnggaran Upsert Error]:', bgErr.message);
    const isMissingTable = bgErr.code === '42P01' || bgErr.message?.includes('does not exist');
    const errorDetail = isMissingTable
      ? 'Tabel category_budgets belum dibuat di database. Jalankan migration 20261022000000_category_budgets_and_alert_logs.sql di Supabase SQL Editor.'
      : bgErr.message;

    await sendTelegramMessage(
      chatId,
      `*[ERROR] Gagal memperbarui anggaran ke database.*\n\nDetail: \`${errorDetail}\``,
      { reply_to_message_id: messageId }
    );
    return true;
  }

  // Ambil konteks terbaru untuk menampilkan status seluruh 8 pos anggaran
  const context = await buildFinancialContext(supabase, householdId, monthStartDay);
  const categoryItems: CategoryBudgetItem[] = TARGET_BUDGET_CATEGORIES.map((t) => {
    const item = context.categoryBudgets.find((b) => b.name === t.name);
    const limit = item?.limit || 0;
    const spent = item?.spent || 0;
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return {
      name: t.name,
      emoji: t.emoji,
      spent,
      limit,
      percentage,
    };
  });

  const responseText = formatBudgetUpdatedWithStatusMessage(
    target,
    setAnggaranCmd.amount,
    categoryItems,
    dateRange.label
  );

  await sendTelegramMessage(chatId, responseText, { reply_to_message_id: messageId });
  return true;
}

/**
 * Handler Atur Tanggal Gajian Siklus Bulanan
 */
export async function handleSetGajianFlow(
  rawText: string,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const day = parseSetGajianCommand(rawText);
  if (!day) return false;

  const { error: setErr } = await supabase
    .from('settings')
    .upsert(
      {
        household_id: householdId,
        month_start_day: day,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' }
    );

  if (setErr) {
    console.error('[SetGajian Upsert Error]:', setErr.message);
    await sendTelegramMessage(chatId, '[ERROR] Gagal memperbarui tanggal gajian ke database.', { reply_to_message_id: messageId });
    return true;
  }

  const dateRange = getMonthlyRange(0, day);
  await sendTelegramMessage(
    chatId,
    `*[BERHASIL] Tanggal Siklus Gajian Berhasil Diperbarui*\n\nTanggal Gajian Baru: *Tanggal ${day} setiap bulan*\nSiklus Finansial Aktif: *${dateRange.label}*\n\n_Batas aman harian dan penghitungan rekapitulasi keluarga kini otomatis diselaraskan ke tanggal ${day}._`,
    { reply_to_message_id: messageId }
  );
  return true;
}
