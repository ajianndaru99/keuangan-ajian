// ==============================================================================
// TELEGRAM SETTINGS COMMANDS: src/lib/telegram/settings-commands.ts
// Handler perintah konfigurasi: set saldo, set anggaran, set gajian, & force-reply
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from './bot.ts';
import { formatBudgetUpdatedWithStatusMessage } from './formatters.ts';
import type { CategoryBudgetItem } from './formatters.ts';
import { formatRupiah } from '../utils.ts';
import { matchTargetCategory, TARGET_BUDGET_CATEGORIES } from '../budget/budget-guard.ts';
import { getMonthlyRange, getBudgetPeriodKey } from '../date-utils.ts';
import { buildFinancialContext } from './commands.ts';
import { applyAccountBalanceDelta } from '../account-balance.ts';
import {
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
 * Handler Balasan Teks Pengguna untuk Alasan Pembatalan Custom (Force Reply)
 */
export async function handleCustomRejectionReply(
  message: TelegramMessage,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const replyText = message.reply_to_message?.text || '';
  if (!replyText.includes('Tulis Alasan Pembatalan')) return false;

  const match = replyText.match(/\[REF:([a-f0-9-]{36})\]/i);
  if (!match) return false;

  const fullTxId = match[1];
  const userReason = (message.text || '').trim();

  // Ambil transaksi sebelumnya untuk cek status dan saldo
  const { data: prevTx } = await supabase
    .from('transactions')
    .select('id, merchant, amount, direction, account_id, status')
    .eq('id', fullTxId)
    .eq('household_id', householdId)
    .maybeSingle();

  const { data: updatedTx, error: updateErr } = await supabase
    .from('transactions')
    .update({
      status: 'ignored',
      notes: `Ditolak via Telegram: ${userReason}`,
    })
    .eq('id', fullTxId)
    .eq('household_id', householdId)
    .select('id, merchant, amount')
    .maybeSingle();

  if (updateErr) {
    console.error('[HandleCustomRejection Update Error]:', updateErr.message);
    await sendTelegramMessage(
      message.chat.id,
      '⚠️ Gagal memperbarui status pembatalan ke database.',
      { reply_to_message_id: message.message_id }
    );
    return true;
  }

  // Jika transaksi sebelumnya reconciled, pulihkan saldo akun
  if (prevTx?.status === 'reconciled' && prevTx.account_id && prevTx.amount) {
    const revertDelta = prevTx.direction === 'in' ? -Number(prevTx.amount) : Number(prevTx.amount);
    await applyAccountBalanceDelta(supabase, prevTx.account_id, revertDelta);
  }

  const txName = updatedTx?.merchant || 'Transaksi';
  const txAmount = updatedTx?.amount ? formatRupiah(Number(updatedTx.amount)) : '';

  await sendTelegramMessage(
    message.chat.id,
    `🚫 *Transaksi Berhasil Dibatalkan*\n\nTransaksi: *${txName}* ${txAmount}\nAlasan: _"${userReason}"_\n\n_Data telah diabaikan dan tidak akan dihitung ke rekap finansial keluarga._`,
    { reply_to_message_id: message.message_id }
  );

  return true;
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
    await sendTelegramMessage(chatId, '⚠️ Gagal memuat daftar rekening dari database.', { reply_to_message_id: messageId });
    return true;
  }

  // Kasus A: Penyesuaian Total Kas (tampilkan pilihan rekening dengan konfirmasi perantara sask:)
  if (accountName === 'total_kas') {
    const totalKas = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const buttons = accounts.map((a) => [
      {
        text: `🏦 ${a.name} (Saldo: ${formatRupiah(Number(a.balance || 0))}) ➔ ${formatRupiah(targetAmount)}`,
        callback_data: `sask:${a.id}:${targetAmount}`,
      },
    ]);
    buttons.push([{ text: '❌ Batalkan', callback_data: 'scancel' }]);

    const text = `💼 *PENYESUAIAN TOTAL KAS KELUARGA*\n\n` +
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
      `⚠️ Akun *${accountName}* tidak ditemukan di dasbor.\n\nRekening aktif yang terdaftar saat ini:\n${list || 'Belum ada rekening'}\n\n_Contoh perintah:_ \`set saldo dana suami 2jt\` atau \`total kas ganti 1jt\``,
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

  const confirmText = `⚠️ *KONFIRMASI PERUBAHAN SALDO REKENING*\n\n` +
    `🏦 *Akun:* ${targetAccount.name} (${targetAccount.owner === 'istri' ? 'Istri' : 'Suami'})\n` +
    `💰 *Saldo Saat Ini:* \`${formatRupiah(currentBalance)}\`\n` +
    `🎯 *Saldo Baru:* \`${formatRupiah(targetAmount)}\`\n` +
    `📉 *Selisih Koreksi:* \`${diff >= 0 ? '+' : ''}${formatRupiah(diff)}\`\n` +
    `💼 *Proyeksi Total Kas:* \`${formatRupiah(projectedTotalKas)}\`\n\n` +
    `_Tindakan ini akan mempengaruhi total kas siap pakai keluarga. Pastikan angka sudah benar sebelum konfirmasi._`;

  await sendTelegramMessage(chatId, confirmText, {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Ya, Perbarui Saldo', callback_data: `sok:${targetAccount.id}:${targetAmount}` },
          { text: '❌ Batalkan', callback_data: 'scancel' },
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
      `⚠️ *Gagal memperbarui anggaran ke database.*\n\nDetail: \`${errorDetail}\``,
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
    await sendTelegramMessage(chatId, '⚠️ Gagal memperbarui tanggal gajian ke database.', { reply_to_message_id: messageId });
    return true;
  }

  const dateRange = getMonthlyRange(0, day);
  await sendTelegramMessage(
    chatId,
    `🎉 *Tanggal Siklus Gajian Berhasil Diperbarui* ✅\n\nTanggal Gajian Baru: *Tanggal ${day} setiap bulan*\nSiklus Finansial Aktif: *${dateRange.label}*\n\n_Batas aman harian dan penghitungan rekapitulasi keluarga kini otomatis diselaraskan ke tanggal ${day}._`,
    { reply_to_message_id: messageId }
  );
  return true;
}
