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
  formatBudgetUpdatedWithStatusMessage,
  CategoryBudgetItem,
} from '@/lib/telegram/formatters.ts';
import { formatRupiah } from '@/lib/utils.ts';
import { matchTargetCategory, TARGET_BUDGET_CATEGORIES } from '@/lib/budget/budget-guard.ts';
import { getMonthlyRange } from '@/lib/date-utils.ts';
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
import {
  parseSetSaldoCommand,
  parseSetAnggaranCommand,
  parseSetGajianCommand,
  processFinancialChatWithAI,
} from '@/lib/telegram/nlp-chat.ts';
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
 * 3. Handler Balasan Teks Pengguna untuk Alasan Pembatalan Custom
 */
async function handleCustomRejectionReply(
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

  // Update status menjadi ignored dengan catatan alasan
  const { data: updatedTx, error: updateErr } = await supabase
    .from('transactions')
    .update({
      status: 'ignored',
      notes: `Ditolak via Telegram: ${userReason}`,
    })
    .eq('id', fullTxId)
    .eq('household_id', householdId)
    .select('id, merchant')
    .maybeSingle();

  if (updateErr) {
    // Fallback jika kolom notes belum ada di schema cache
    await supabase
      .from('transactions')
      .update({ status: 'ignored' })
      .eq('id', fullTxId)
      .eq('household_id', householdId);
  }

  const merchantName = updatedTx?.merchant || 'Transaksi';
  await sendTelegramMessage(
    message.chat.id,
    `✅ *Alasan Disimpan*\n\nTransaksi *${merchantName}* telah dibatalkan dengan catatan:\n_"${userReason}"_.\n\nTerima kasih atas masukannya!`,
    { reply_to_message_id: message.message_id }
  );

  return true;
}

/**
 * 4. Handler Sinkronisasi Saldo dengan Transaksi Koreksi Resmi
 */
async function handleSetSaldoFlow(
  rawText: string,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const setSaldoCmd = parseSetSaldoCommand(rawText);
  if (!setSaldoCmd) return false;

  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, owner, balance')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (accErr) {
    console.error('[SetSaldo Account Fetch Error]:', accErr.message);
    await sendTelegramMessage(chatId, '⚠️ Gagal memuat daftar rekening dari database.', { reply_to_message_id: messageId });
    return true;
  }

  const targetAccount = (accounts || []).find((a) =>
    a.name.toLowerCase().includes(setSaldoCmd.accountName.toLowerCase()) ||
    setSaldoCmd.accountName.toLowerCase().includes(a.name.toLowerCase())
  );

  if (!targetAccount) {
    const list = (accounts || []).map((a) => `• *${a.name}* (Saldo: \`${formatRupiah(Number(a.balance || 0))}\`)`).join('\n');
    await sendTelegramMessage(
      chatId,
      `⚠️ Akun *${setSaldoCmd.accountName}* tidak ditemukan di dasbor.\n\nRekening aktif yang terdaftar saat ini:\n${list || 'Belum ada rekening'}\n\n_Contoh perintah:_ \`set saldo dana suami 2jt\``,
      { reply_to_message_id: messageId }
    );
    return true;
  }

  const currentBalance = Number(targetAccount.balance || 0);
  const targetBalance = setSaldoCmd.amount;
  const diff = targetBalance - currentBalance;

  // Catat transaksi koreksi saldo jika ada selisih nominal
  if (diff !== 0) {
    const owner = targetAccount.owner === 'istri' ? 'istri' : 'suami';
    await supabase.from('transactions').insert({
      household_id: householdId,
      account_id: targetAccount.id,
      amount: Math.abs(diff),
      direction: diff > 0 ? 'in' : 'out',
      merchant: `Koreksi Saldo: ${targetAccount.name}`,
      raw_notification: `Penyesuaian saldo manual via Telegram: ${targetAccount.name} menjadi ${formatRupiah(targetBalance)} (Selisih: ${formatRupiah(diff)})`,
      source_device: owner,
      transaction_date: new Date().toISOString(),
      status: 'reconciled',
      dedupe_hash: `adj_${targetAccount.id}_${Date.now()}`,
      needs_review: false,
    });
  }

  // Update nilai saldo akun
  await supabase
    .from('accounts')
    .update({ balance: targetBalance })
    .eq('id', targetAccount.id);

  await sendTelegramMessage(
    chatId,
    `💰 *Saldo Berhasil Diperbarui*\n\nAkun: *${targetAccount.name}*\nSaldo Sekarang: \`${formatRupiah(targetBalance)}\`\nSelisih Tercatat: \`${diff >= 0 ? '+' : ''}${formatRupiah(diff)}\``,
    { reply_to_message_id: messageId }
  );
  return true;
}

/**
 * 5. Handler Atur Pagu Anggaran Kategori
 * Melaporkan konfirmasi pembaruan sekaligus status pos apa saja yang sudah dan belum diset
 */
async function handleSetAnggaranFlow(
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
  const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

  const { error: bgErr } = await supabase.from('category_budgets').upsert(
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

  if (bgErr) {
    console.error('[SetAnggaran Upsert Error]:', bgErr.message);
    await sendTelegramMessage(
      chatId,
      `⚠️ *Gagal memperbarui anggaran ke database.*\n\nDetail: \`${bgErr.message}\``,
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
 * 6. Handler Atur Tanggal Gajian Siklus Bulanan
 */
async function handleSetGajianFlow(
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

/**
 * 7. Handler Perintah Slash Standar (/status, /anggaran, /rekap, /setup, dll)
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
