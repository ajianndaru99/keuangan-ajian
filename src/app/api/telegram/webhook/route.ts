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
} from '@/lib/telegram/formatters.ts';
import { formatRupiah } from '@/lib/utils.ts';
import { matchTargetCategory } from '@/lib/budget/budget-guard.ts';
import {
  handleStatusCommand,
  handleAnggaranCommand,
  handleRekapCommand,
  handleInboxCommand,
  buildFinancialContext,
} from '@/lib/telegram/commands.ts';
import {
  handleTelegramCallbackQuery,
  TelegramCallbackQuery,
} from '@/lib/telegram/callback-handler.ts';
import {
  handleTelegramPhotoMessage,
  TelegramPhotoItem,
} from '@/lib/telegram/photo-handler.ts';
import { processFinancialChatWithAI } from '@/lib/telegram/nlp-chat.ts';
import {
  handleCustomRejectionReply,
  handleSetSaldoFlow,
  handleSetAnggaranFlow,
  handleSetGajianFlow,
} from '@/lib/telegram/settings-commands.ts';
import { generateScreenshotDedupeHash, suggestCategoryForMerchant } from '@/lib/vision/gemini.ts';

export const dynamic = 'force-dynamic';

function getServiceSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

interface TelegramMessage {
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
  photo?: TelegramPhotoItem[];
  reply_to_message?: {
    message_id: number;
    text?: string;
  };
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
 * 2. Filter Anti-Spam: Pastikan pesan grup memang ditujukan untuk Bot
 */
function shouldProcessChat(message: TelegramMessage, rawText: string): boolean {
  // Chat pribadi 1-on-1 dengan bot selalu diproses
  if (message.chat.type === 'private') return true;

  // Jika di grup: proses jika me-reply bot atau menyebut bot
  if (message.reply_to_message || rawText.includes('@')) return true;

  // Jika diawali kata pemicu finansial eksplisit
  const lower = rawText.toLowerCase().trim();
  const triggers = [
    'catat', 'tanya', 'cek', 'saldo', 'anggaran', 'budget',
    'rekap', 'set', 'ubah', 'atur', 'beli', 'bayar', 'gaji', 'transfer',
  ];
  return triggers.some((t) => lower.startsWith(t));
}

/**
 * 3. Handler Perintah Slash Standar (/status, /anggaran, /rekap, /setup, dll)
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
    default: {
      await sendTelegramMessage(
        chatId,
        `❓ Perintah \`${command}\` tidak dikenali.\n\nKetik \`/help\` untuk melihat panduan atau langsung ajukan pertanyaan finansial Anda.`
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
  const context = await buildFinancialContext(supabase, householdId, monthStartDay);
  const nlpResult = await processFinancialChatWithAI(rawText, context);

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
      .select('id, name')
      .eq('household_id', householdId);

    const targetCat = matchTargetCategory(tx.categoryName);
    const suggestedCategoryId = categories
      ? suggestCategoryForMerchant(tx.merchant, categories)
      : null;

    const categoryName = targetCat.name || 'Lainnya';

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
        source_device: accountOwner,
        transaction_date: new Date().toISOString(),
        status: 'pending',
        dedupe_hash: dedupeHash,
      })
      .select('id')
      .maybeSingle();

    if (txErr) {
      console.error('[NLP Transaction Insert Error]:', txErr.message);
      await sendTelegramMessage(
        message.chat.id,
        '⚠️ Gagal mencatat transaksi ke database.',
        { reply_to_message_id: message.message_id }
      );
      return;
    }

    const alertText = formatExpenseAlertMessage({
      merchant: tx.merchant,
      amount: tx.amount,
      categoryName,
      accountName,
    });

    const replyMarkup = newTx?.id
      ? {
          inline_keyboard: [
            [
              { text: '✅ Benar & Sesuai', callback_data: `tx_ok:${newTx.id}` },
              { text: '❌ Salah / Bukan Belanja', callback_data: `tx_wrong_menu:${newTx.id}` },
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
        '⛔ *Akses Ditolak*\n\nAkun atau grup Anda belum terdaftar dalam daftar izin keluarga. Hubungi admin dasbor untuk mendaftarkan Chat ID ini.'
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

    // 6. Handler Balasan Penolakan Custom (Force Reply)
    const wasHandledAsReply = await handleCustomRejectionReply(message, supabase, householdId);
    if (wasHandledAsReply) {
      return NextResponse.json({ ok: true });
    }

    // 7. Handler Perintah Set Saldo
    const wasHandledAsSetSaldo = await handleSetSaldoFlow(rawText, chatId, message.message_id, supabase, householdId);
    if (wasHandledAsSetSaldo) {
      return NextResponse.json({ ok: true });
    }

    // 8. Handler Perintah Set Anggaran
    const wasHandledAsSetAnggaran = await handleSetAnggaranFlow(rawText, chatId, message.message_id, supabase, householdId, monthStartDay);
    if (wasHandledAsSetAnggaran) {
      return NextResponse.json({ ok: true });
    }

    // 9. Handler Perintah Set Tanggal Gajian
    const wasHandledAsSetGajian = await handleSetGajianFlow(rawText, chatId, message.message_id, supabase, householdId);
    if (wasHandledAsSetGajian) {
      return NextResponse.json({ ok: true });
    }

    // 10. Handler Perintah Slash
    if (rawText.startsWith('/')) {
      const commandPart = rawText.split(/\s+/)[0].toLowerCase();
      const command = commandPart.split('@')[0];
      await handleSlashCommands(command, chatId, supabase, householdId, monthStartDay);
      return NextResponse.json({ ok: true });
    }

    // 10. Filter Anti-Spam Obrolan Grup & Natural Language AI Chat
    if (!shouldProcessChat(message, rawText)) {
      return NextResponse.json({ ok: true });
    }

    await handleNaturalLanguageFlow(rawText, message, supabase, householdId, monthStartDay);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[Telegram Webhook Exception]:', err);
    return NextResponse.json({ ok: true });
  }
}
