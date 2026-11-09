// ==============================================================================
// TELEGRAM WEBHOOK ROUTE: src/app/api/telegram/webhook/route.ts
// Menerima Update Pesan Interaktif, Tombol Callback, Foto Struk & NLP Chat AI
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient, SupabaseClient } from '@supabase/supabase-js';
import { isChatIdAllowed, sendTelegramMessage } from '@/lib/telegram/bot.ts';
import {
  formatHelpMessage,
  formatExpenseAlertMessage,
  formatIncomeAlertMessage,
} from '@/lib/telegram/formatters.ts';
import { matchTargetCategory } from '@/lib/budget/budget-guard.ts';
import {
  handleStatusCommand,
  handleAnggaranCommand,
  handleSpecificCategoryBudgetCommand,
  handleRekapCommand,
  handleInboxCommand,
  handleTodayExpensesCommand,
  handleDailyReportCommand,
  buildFinancialContext,
} from '@/lib/telegram/commands.ts';
import {
  handleTelegramCallbackQuery,
  TelegramCallbackQuery,
} from '@/lib/telegram/callback-handler.ts';
import {
  handleTelegramPhotoMessage,
} from '@/lib/telegram/photo-handler.ts';
import {
  processFinancialChatWithAI,
  isTodayExpenseQuery,
  isBudgetStatusQuery,
} from '@/lib/telegram/nlp-chat.ts';
import {
  handleCustomRejectionReply,
  handleSetSaldoFlow,
  promptSetSaldoConfirmation,
  handleSetAnggaranFlow,
  handleSetGajianFlow,
  shouldProcessChat,
  stripBotMentions,
  type TelegramMessage,
} from '@/lib/telegram/settings-commands.ts';
import { applyAccountBalanceDelta } from '@/lib/account-balance.ts';
import { generateScreenshotDedupeHash, suggestCategoryForMerchant } from '@/lib/vision/gemini.ts';
import { sendSettingsHubMenu, handleAccountTextCommands } from '@/lib/telegram/settings-hub.ts';

export const dynamic = 'force-dynamic';

function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/**
 * 1. Validasi Secret Token Webhook (Fail-Closed pada Production)
 */
function isWebhookAuthorized(req: NextRequest): boolean {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (process.env.NODE_ENV === 'production' && !configuredSecret) {
    console.error('[Telegram Webhook Rejected] TELEGRAM_WEBHOOK_SECRET wajib disetel di production.');
    return false;
  }

  if (configuredSecret) {
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    return secretHeader === configuredSecret;
  }

  return true;
}

/**
 * 2. Handler Perintah Slash Standar (/status, /anggaran, /rekap, /setup, dll)
 */
async function handleSlashCommands(
  command: string,
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<void> {
  switch (command) {
    case '/start':
    case '/help':
    case '/guide':
    case '/panduan': {
      await sendTelegramMessage(chatId, formatHelpMessage());
      break;
    }
    case '/status':
    case '/cek': {
      await handleStatusCommand(chatId, supabase, householdId, monthStartDay);
      break;
    }
    case '/hariini':
    case '/today': {
      await handleTodayExpensesCommand(chatId, supabase, householdId);
      break;
    }
    case '/laporansiang':
    case '/report':
    case '/cuaca': {
      await handleDailyReportCommand(chatId, supabase, householdId, monthStartDay);
      break;
    }
    case '/anggaran':
    case '/budget': {
      await handleAnggaranCommand(chatId, supabase, householdId, monthStartDay);
      break;
    }
    case '/setup':
    case '/pos': {
      // Menampilkan checklist kelengkapan setup pos anggaran
      await handleAnggaranCommand(chatId, supabase, householdId, monthStartDay);
      break;
    }
    case '/rekap': {
      await handleRekapCommand(chatId, supabase, householdId);
      break;
    }
    case '/inbox': {
      await handleInboxCommand(chatId, supabase, householdId);
      break;
    }
    case '/pengaturan':
    case '/settings':
    case '/atur':
    case '/hub': {
      await sendSettingsHubMenu(chatId);
      break;
    }
    default: {
      await sendTelegramMessage(
        chatId,
        `[INFO] Perintah \`${command}\` tidak dikenali.\n\nKetik \`/help\` untuk melihat panduan atau langsung ajukan pertanyaan finansial Anda.`
      );
      break;
    }
  }
}

/**
 * 7. Handler Natural Language Chat (Ekstraksi Transaksi & Tanya-Jawab AI)
 */
async function handleNaturalLanguageFlow(
  rawText: string,
  message: TelegramMessage,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<void> {
  // 0. Cek pertanyaan langsung pengeluaran hari ini (toleran variasi kalimat & typo seperti "berapa pngeluaran hari....")
  if (isTodayExpenseQuery(rawText)) {
    await handleTodayExpensesCommand(message.chat.id, supabase, householdId);
    return;
  }

  // 0.1. Cek pertanyaan status anggaran / pagu pos belanja
  const budgetQuery = isBudgetStatusQuery(rawText);
  if (budgetQuery.matched) {
    if (budgetQuery.targetCategory) {
      await handleSpecificCategoryBudgetCommand(
        message.chat.id,
        supabase,
        householdId,
        budgetQuery.targetCategory,
        monthStartDay
      );
    } else {
      await handleAnggaranCommand(message.chat.id, supabase, householdId, monthStartDay);
    }
    return;
  }

  const context = await buildFinancialContext(supabase, householdId, monthStartDay);
  const repliedText = message.reply_to_message?.text?.trim();
  const promptInput = repliedText
    ? `[Konteks pesan yang dibalas: "${repliedText.slice(0, 300)}"]\nBalasan pengguna: ${rawText}`
    : rawText;
  const nlpResult = await processFinancialChatWithAI(promptInput, context, { rawUserText: rawText });

  // 1. Intent Ubah Saldo / Total Kas (Dua Langkah dengan Konfirmasi)
  if (nlpResult.type === 'set_balance_intent') {
    let normalizedAccountName = nlpResult.accountName.trim();
    if (/^(total[\s_]*kas|kas[\s_]*(total|keluarga|siap\s*pakai))$/i.test(normalizedAccountName)) {
      normalizedAccountName = 'total_kas';
    }
    await promptSetSaldoConfirmation(
      normalizedAccountName,
      nlpResult.amount,
      message.chat.id,
      message.message_id,
      supabase,
      householdId
    );
    return;
  }

  // 2. Transaksi Finansial (Pengeluaran atau Pemasukan)
  if (nlpResult.type === 'transaction') {
    const tx = nlpResult.data;

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, owner')
      .eq('household_id', householdId)
      .eq('is_active', true);

    let accountId: string | null = null;
    let accountName = tx.accountName;
    let accountOwner: 'suami' | 'istri' = 'suami';

    if (accounts && accounts.length > 0) {
      const matched = accounts.find((a) =>
        a.name.toLowerCase().includes(tx.accountName.toLowerCase()) ||
        tx.accountName.toLowerCase().includes(a.name.toLowerCase())
      );
      if (matched) {
        accountId = matched.id;
        accountName = matched.name;
        accountOwner = matched.owner === 'istri' ? 'istri' : 'suami';
      } else {
        const defaultAcc = accounts.find((a) => a.owner === 'suami') || accounts[0];
        accountId = defaultAcc.id;
        accountName = defaultAcc.name;
        accountOwner = defaultAcc.owner === 'istri' ? 'istri' : 'suami';
      }
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('household_id', householdId);

    let categoryName = 'Gaji/Pemasukan';
    let suggestedCategoryId: string | null = null;

    if (tx.direction === 'in') {
      const incomeCat = categories?.find(
        (c) => c.type === 'income' || c.name.toLowerCase().includes('pemasukan') || c.name.toLowerCase().includes('gaji')
      );
      if (incomeCat) {
        categoryName = incomeCat.name;
        suggestedCategoryId = incomeCat.id;
      }
    } else {
      const targetCat = matchTargetCategory(tx.categoryName);
      categoryName = targetCat.name || 'Lainnya';
      suggestedCategoryId = categories
        ? suggestCategoryForMerchant(tx.merchant, categories)
        : null;
    }

    const dedupeHash = await generateScreenshotDedupeHash(
      accountOwner,
      accountName,
      '',
      tx.amount,
      new Date().toISOString()
    );

    const { data: newTx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        account_id: accountId,
        category_id: suggestedCategoryId,
        amount: tx.amount,
        direction: tx.direction,
        merchant: tx.merchant,
        raw_notification: `[Chat Telegram] ${rawText}`,
        notes: 'Dicatat via Chat Telegram',
        source_device: accountOwner,
        transaction_date: new Date().toISOString(),
        status: 'reconciled',
        dedupe_hash: dedupeHash,
      })
      .select('id')
      .maybeSingle();

    if (txErr) {
      console.error('[NLP Transaction Insert Error]:', txErr.message);
      await sendTelegramMessage(
        message.chat.id,
        '[ERROR] Gagal mencatat transaksi ke database.',
        { reply_to_message_id: message.message_id }
      );
      return;
    }

    // Sinkronisasi saldo akun secara instan dan idempoten di level aplikasi
    if (accountId) {
      const delta = tx.direction === 'in' ? tx.amount : -tx.amount;
      await applyAccountBalanceDelta(supabase, accountId, delta);
    }

    const isIncome = tx.direction === 'in';
    const alertText = isIncome
      ? formatIncomeAlertMessage({
          merchant: tx.merchant,
          amount: tx.amount,
          categoryName,
          accountName,
          isAutoReconciled: true,
          transactionDate: new Date(),
        })
      : formatExpenseAlertMessage({
          merchant: tx.merchant,
          amount: tx.amount,
          categoryName,
          accountName,
          isAutoReconciled: true,
          transactionDate: new Date(),
        });

    const replyMarkup = newTx?.id
      ? {
          inline_keyboard: [
            [
              { text: 'Kategori', callback_data: `tx_cat:${newTx.id}` },
              { text: 'Ubah', callback_data: `tx_edit:${newTx.id}` },
              { text: 'Batal', callback_data: `tx_wrong_menu:${newTx.id}` },
            ],
          ],
        }
      : undefined;

    await sendTelegramMessage(message.chat.id, alertText, {
      reply_to_message_id: message.message_id,
      reply_markup: replyMarkup,
    });
    return;
  }

  // Balas tanya-jawab finansial percakapan
  await sendTelegramMessage(message.chat.id, nlpResult.replyText, {
    reply_to_message_id: message.message_id,
  });
}

/**
 * MAIN ENTRYPOINT: Webhook Handler
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verifikasi Keaslian Webhook
    if (!isWebhookAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TelegramUpdate = await req.json().catch(() => ({ update_id: 0 }));

    // 2. Inisialisasi Database Supabase
    const supabase = getServiceSupabase();
    if (!supabase) {
      console.warn('[Telegram Webhook Warn] Koneksi database backend belum siap.');
      return NextResponse.json({ ok: true });
    }

    const { data: household } = await supabase
      .from('households')
      .select('id')
      .limit(1)
      .maybeSingle();

    const householdId = household?.id;
    if (!householdId) {
      console.warn('[Telegram Webhook Warn] Data household belum ditemukan.');
      return NextResponse.json({ ok: true });
    }

    // 3. Handler Tombol Inline (Callback Query)
    if (body.callback_query) {
      const cq = body.callback_query;
      const targetChatId = cq.message?.chat.id;
      if (targetChatId && isChatIdAllowed(targetChatId)) {
        await handleTelegramCallbackQuery(cq, supabase, householdId);
      }
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;

    // 4. Verifikasi Whitelist Chat ID Keluarga
    if (!isChatIdAllowed(chatId)) {
      console.warn(`[Telegram Webhook Access Denied] Chat ID ${chatId} tidak terdaftar di whitelist.`);
      await sendTelegramMessage(
        chatId,
        '*[AKSES DITOLAK]*\n\nAkun atau grup Anda belum terdaftar dalam daftar izin keluarga. Hubungi admin dasbor untuk mendaftarkan Chat ID ini.'
      );
      return NextResponse.json({ ok: true });
    }

    // Ambil tanggal gajian dari settings
    const { data: settingData } = await supabase
      .from('settings')
      .select('month_start_day')
      .eq('household_id', householdId)
      .maybeSingle();
    const monthStartDay = settingData?.month_start_day || 1;

    // 5. Handler Foto Struk Belanja / Bukti Transfer
    if (message.photo && message.photo.length > 0) {
      await handleTelegramPhotoMessage(message.photo, chatId, message.message_id, supabase, householdId);
      return NextResponse.json({ ok: true });
    }

    if (!message.text) {
      return NextResponse.json({ ok: true });
    }

    const rawText = message.text.trim();

    // 6. Verifikasi Kebijakan Respon Grup: Diam jika tidak ditag (Anti-Nyamber)
    if (!shouldProcessChat(message, rawText)) {
      return NextResponse.json({ ok: true });
    }

    // Bersihkan mention (@username) agar pemrosesan perintah dan NLP bersih alami
    const cleanedText = stripBotMentions(rawText);

    // 7. Handler Balasan Penolakan Custom (Force Reply)
    const wasHandledAsReply = await handleCustomRejectionReply(message, supabase, householdId);
    if (wasHandledAsReply) {
      return NextResponse.json({ ok: true });
    }

    // 8. Handler Perintah Set Saldo
    const wasHandledAsSetSaldo = await handleSetSaldoFlow(cleanedText, chatId, message.message_id, supabase, householdId);
    if (wasHandledAsSetSaldo) {
      return NextResponse.json({ ok: true });
    }

    // 9. Handler Perintah Set Anggaran
    const wasHandledAsSetAnggaran = await handleSetAnggaranFlow(cleanedText, chatId, message.message_id, supabase, householdId, monthStartDay);
    if (wasHandledAsSetAnggaran) {
      return NextResponse.json({ ok: true });
    }

    // 10. Handler Perintah Set Tanggal Gajian
    const wasHandledAsSetGajian = await handleSetGajianFlow(cleanedText, chatId, message.message_id, supabase, householdId);
    if (wasHandledAsSetGajian) {
      return NextResponse.json({ ok: true });
    }

    // 10.5. Handler Perintah Manajemen Akun / Rekening via Chat (tambah akun, nonaktifkan akun)
    const wasHandledAsAccCmd = await handleAccountTextCommands(cleanedText, chatId, message.message_id, supabase, householdId);
    if (wasHandledAsAccCmd) {
      return NextResponse.json({ ok: true });
    }

    // 10.6. Buka Pusat Pengaturan jika menyebut kata kunci pengaturan
    if (/^(?:buka\s+)?(?:menu\s+)?pengaturan$/i.test(cleanedText) || /^(?:buka\s+)?settings$/i.test(cleanedText)) {
      await sendSettingsHubMenu(chatId, message.message_id);
      return NextResponse.json({ ok: true });
    }

    // 11. Handler Perintah Slash
    if (rawText.startsWith('/')) {
      const commandPart = rawText.split(/\s+/)[0].toLowerCase();
      const command = commandPart.split('@')[0];
      await handleSlashCommands(command, chatId, supabase, householdId, monthStartDay);
      return NextResponse.json({ ok: true });
    }

    // 12. Natural Language AI Chat (Gemini Flash)
    await handleNaturalLanguageFlow(cleanedText, message, supabase, householdId, monthStartDay);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[Telegram Webhook Exception]:', err);
    return NextResponse.json({ ok: true });
  }
}
