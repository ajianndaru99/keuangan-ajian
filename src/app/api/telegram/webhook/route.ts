// ==============================================================================
// TELEGRAM WEBHOOK ROUTE: src/app/api/telegram/webhook/route.ts
// Menerima Update Pesan Interaktif, Tombol Callback, Foto Struk & NLP Chat AI
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isChatIdAllowed, sendTelegramMessage } from '@/lib/telegram/bot';
import {
  formatHelpMessage,
  formatExpenseAlertMessage,
} from '@/lib/telegram/formatters';
import { formatRupiah } from '@/lib/utils';
import { matchTargetCategory } from '@/lib/budget/budget-guard';
import { getMonthlyRange } from '@/lib/date-utils';
import {
  handleStatusCommand,
  handleAnggaranCommand,
  handleRekapCommand,
  handleInboxCommand,
  buildFinancialContext,
} from '@/lib/telegram/commands';
import {
  handleTelegramCallbackQuery,
  TelegramCallbackQuery,
} from '@/lib/telegram/callback-handler';
import {
  handleTelegramPhotoMessage,
  TelegramPhotoItem,
} from '@/lib/telegram/photo-handler';
import {
  parseSetSaldoCommand,
  parseSetAnggaranCommand,
  processFinancialChatWithAI,
} from '@/lib/telegram/nlp-chat';
import { generateScreenshotDedupeHash, suggestCategoryForMerchant } from '@/lib/vision/gemini';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      username?: string;
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
  };
  callback_query?: TelegramCallbackQuery;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verifikasi Secret Token Webhook (Fail-Closed)
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret && secretHeader !== configuredSecret) {
      console.warn('[Telegram Webhook Rejected] Token rahasia webhook tidak valid.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TelegramUpdate = await req.json().catch(() => ({ update_id: 0 }));

    // Inisialisasi Database Backend Supabase
    const supabase = getServiceSupabase();
    if (!supabase) {
      console.warn('[Telegram Webhook Warn] Koneksi database backend belum siap.');
      return NextResponse.json({ ok: true });
    }

    // Ambil default household
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

    // 2. Handler Tombol Inline: Callback Query
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

    // 3. Keamanan: Whitelist Chat ID Keluarga
    if (!isChatIdAllowed(chatId)) {
      console.warn(`[Telegram Webhook Access Denied] Chat ID ${chatId} tidak terdaftar di TELEGRAM_ALLOWED_CHAT_IDS.`);
      await sendTelegramMessage(
        chatId,
        '⛔ *Akses Ditolak*\n\nAkun atau grup Anda belum terdaftar dalam daftar izin keluarga. Hubungi pengelola dasbor untuk mendaftarkan Chat ID ini.'
      );
      return NextResponse.json({ ok: true });
    }

    // Ambil konfigurasi tanggal gajian dari settings
    const { data: settingData } = await supabase
      .from('settings')
      .select('month_start_day')
      .eq('household_id', householdId)
      .maybeSingle();
    const monthStartDay = settingData?.month_start_day || 1;

    // 4. Handler Foto Struk Belanja / Bukti Transfer (Vision AI)
    if (message.photo && message.photo.length > 0) {
      await handleTelegramPhotoMessage(message.photo, chatId, message.message_id, supabase, householdId);
      return NextResponse.json({ ok: true });
    }

    // Abaikan jika tidak ada pesan teks
    if (!message.text) {
      return NextResponse.json({ ok: true });
    }

    const rawText = message.text.trim();

    // 5. Handler Balasan Teks Pengguna untuk Alasan Pembatalan Custom (Force Reply)
    if (message.reply_to_message?.text?.includes('Tulis Alasan Pembatalan')) {
      const match = message.reply_to_message.text.match(/mutasi\s*#([a-f0-9-]+)/i);
      if (match) {
        const prefix = match[1];
        const { data: updatedTx } = await supabase
          .from('transactions')
          .update({
            status: 'ignored',
            notes: `Ditolak via Telegram: ${rawText}`,
          })
          .ilike('id', `${prefix}%`)
          .eq('household_id', householdId)
          .select('id, merchant')
          .maybeSingle();

        if (updatedTx) {
          await sendTelegramMessage(
            chatId,
            `✅ *Alasan Disimpan*\n\nTransaksi #${prefix} (*${updatedTx.merchant || 'Transaksi'}*) telah ditandai ditolak dengan catatan:\n_"${rawText}"_.\n\nTerima kasih atas masukannya!`,
            { reply_to_message_id: message.message_id }
          );
          return NextResponse.json({ ok: true });
        }
      }
    }

    // 6. Handler Perintah Cepat: Set Saldo Rekening
    const setSaldoCmd = parseSetSaldoCommand(rawText);
    if (setSaldoCmd) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', householdId)
        .eq('is_active', true);

      let targetAccount = (accounts || []).find((a) =>
        a.name.toLowerCase().includes(setSaldoCmd.accountName.toLowerCase()) ||
        setSaldoCmd.accountName.toLowerCase().includes(a.name.toLowerCase())
      );

      if (targetAccount) {
        await supabase
          .from('accounts')
          .update({ balance: setSaldoCmd.amount })
          .eq('id', targetAccount.id);
      } else {
        const { data: newAcc } = await supabase
          .from('accounts')
          .insert({
            household_id: householdId,
            name: setSaldoCmd.accountName,
            balance: setSaldoCmd.amount,
            initial_balance: setSaldoCmd.amount,
            owner: 'suami',
            type: 'bank',
            is_active: true,
          })
          .select('id, name')
          .single();
        targetAccount = newAcc || { id: '', name: setSaldoCmd.accountName };
      }

      await sendTelegramMessage(
        chatId,
        `💰 *Saldo Berhasil Diperbarui*\n\nAkun: *${targetAccount.name}*\nSaldo Sekarang: \`${formatRupiah(setSaldoCmd.amount)}\``,
        { reply_to_message_id: message.message_id }
      );
      return NextResponse.json({ ok: true });
    }

    // 7. Handler Perintah Cepat: Set Anggaran Kategori
    const setAnggaranCmd = parseSetAnggaranCommand(rawText);
    if (setAnggaranCmd) {
      const target = matchTargetCategory(setAnggaranCmd.categoryName);
      const dateRange = getMonthlyRange(0, monthStartDay);
      const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

      await supabase.from('category_budgets').upsert(
        {
          household_id: householdId,
          category_id: target.id,
          category_name: target.name,
          limit_amount: setAnggaranCmd.amount,
          period_month: periodMonth,
        },
        { onConflict: 'household_id,category_id,period_month' }
      );

      await sendTelegramMessage(
        chatId,
        `📋 *Anggaran Berhasil Diperbarui*\n\nPos: ${target.emoji} *${target.name}*\nPeriode: *${dateRange.label}*\nPagu Baru: \`${formatRupiah(setAnggaranCmd.amount)}\``,
        { reply_to_message_id: message.message_id }
      );
      return NextResponse.json({ ok: true });
    }

    // 8. Parser Perintah Slash Standar (/status, /anggaran, /rekap, dll)
    const commandPart = rawText.split(/\s+/)[0].toLowerCase();
    const command = commandPart.split('@')[0];

    if (command.startsWith('/')) {
      switch (command) {
        case '/start':
        case '/help':
        case '/guide':
        case '/panduan': {
          const text = formatHelpMessage();
          await sendTelegramMessage(chatId, text);
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
            `❓ Perintah \`${command}\` tidak dikenali.\n\nKetik \`/help\` untuk melihat daftar panduan perintah atau langsung tanyakan ke AI bot.`
          );
          break;
        }
      }
      return NextResponse.json({ ok: true });
    }

    // 9. Natural Language AI Chat (Pencatatan Cepat & Q&A Finansial Percakapan)
    const context = await buildFinancialContext(supabase, householdId, monthStartDay);
    const nlpResult = await processFinancialChatWithAI(rawText, context);

    if (nlpResult.type === 'transaction') {
      const tx = nlpResult.data;

      // Cari atau petakan akun
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', householdId)
        .eq('is_active', true);

      let accountId: string | null = null;
      let accountName = tx.accountName;
      if (accounts && accounts.length > 0) {
        const matched = accounts.find((a) =>
          a.name.toLowerCase().includes(tx.accountName.toLowerCase()) ||
          tx.accountName.toLowerCase().includes(a.name.toLowerCase())
        );
        if (matched) {
          accountId = matched.id;
          accountName = matched.name;
        } else {
          accountId = accounts[0].id;
          accountName = accounts[0].name;
        }
      }

      // Rekomendasi Kategori
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
        'telegram_chat',
        accountName,
        '',
        tx.amount,
        new Date().toISOString()
      );

      const { data: newTx } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          account_id: accountId,
          category_id: suggestedCategoryId,
          amount: tx.amount,
          direction: tx.direction,
          merchant: tx.merchant,
          raw_notification: `[Chat Telegram] ${rawText}`,
          source_device: 'telegram',
          transaction_date: new Date().toISOString(),
          status: 'pending',
          dedupe_hash: dedupeHash,
        })
        .select('id')
        .maybeSingle();

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

      await sendTelegramMessage(chatId, alertText, {
        reply_to_message_id: message.message_id,
        reply_markup: replyMarkup,
      });
      return NextResponse.json({ ok: true });
    }

    // Jawaban Percakapan / Tanya-Jawab Finansial
    await sendTelegramMessage(chatId, nlpResult.replyText, {
      reply_to_message_id: message.message_id,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[Telegram Webhook Exception]:', err);
    return NextResponse.json({ ok: true });
  }
}
