// ==============================================================================
// API ROUTE: src/app/api/notification/route.ts
// Endpoint penerima notifikasi perbankan & e-wallet otomatis (SmsForwarder & MacroDroid)
// Kompatibel dengan Vercel, Next.js App Router, dan Supabase Database
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { suggestCategoryForMerchant } from '@/lib/vision/gemini';
import { parseNotificationPayload } from '@/lib/ai/notification-parser';
import { evaluateBudgetAlert, type BudgetAlert, type ReviewAlert } from '@/lib/budget/budget-guard';
import { formatRupiah } from '@/lib/utils';
import { isTelegramConfigured, broadcastToAllowedChats } from '@/lib/telegram/bot';
import {
  formatOverbudgetAlert,
  formatExpenseAlertMessage,
  formatInternalTransferAlertMessage,
} from '@/lib/telegram/formatters';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export async function OPTIONS() {
  return new NextResponse('ok', { headers: corsHeaders });
}

function isValidApiKey(clientKey: string | null, configuredKey: string | undefined): boolean {
  if (!clientKey) return false;

  // Kunci default dev hanya diterima di luar production (testing lokal)
  if (process.env.NODE_ENV !== 'production') {
    const allowedDevKeys = ['mock_dev_key_suami', 'mock_dev_key_istri'];
    if (allowedDevKeys.includes(clientKey)) return true;
  }

  if (!configuredKey) return false;
  const validKeys = configuredKey.split(',').map(k => k.trim()).filter(Boolean);
  return validKeys.some(expected => expected === clientKey);
}

// Pola kata kunci OTP dan verifikasi untuk sensor otomatis
const SENSITIVE_KEYWORDS = [
  'otp',
  'kode verifikasi',
  'verification code',
  'kode rahasia',
  'jangan berikan',
  'pin anda',
  'security code',
];

function isSensitiveContent(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some(kw => lower.includes(kw));
}
 
// Cache memori aturan promo adaptif (TTL 60 detik)
let cachedRules: { rules: string[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

async function getLearnedPromoRules(supabaseUrl: string, supabaseKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedRules && now - cachedRules.timestamp < CACHE_TTL_MS) {
    return cachedRules.rules;
  }

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const client = createSupabaseClient(supabaseUrl, supabaseKey);
    const { data } = await client
      .from('learned_promo_rules')
      .select('keyword')
      .limit(200);

    const rules = data && Array.isArray(data) ? data.map((r: { keyword: string }) => r.keyword) : [];
    cachedRules = { rules, timestamp: now };
    return rules;
  } catch {
    return cachedRules ? cachedRules.rules : [];
  }
}

interface TransactionRecord {
  id: string;
  household_id: string;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  direction: 'in' | 'out';
  merchant: string;
  raw_notification: string;
  source_device: 'suami' | 'istri';
  transaction_date: string;
  status: string;
  dedupe_hash: string;
  needs_review: boolean;
  parse_method?: string;
}

export async function POST(req: NextRequest) {
  try {
    const configuredApiKey = process.env.WEBHOOK_API_KEY;
    const clientApiKey = req.headers.get('x-api-key') || req.headers.get('X-API-KEY');

    if (!isValidApiKey(clientApiKey, configuredApiKey)) {
      return NextResponse.json(
        { error: 'Unauthorized: Header X-API-KEY tidak valid.' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Baca Payload
    const contentType = req.headers.get('content-type') || '';
    let app_name = '';
    let title = '';
    let content = '';
    let device_id = '';
    let received_at_raw: string | number = '';

    if (contentType.includes('application/json')) {
      try {
        const json = await req.json();
        app_name = String(json.app_name || json.packageName || '').trim();
        title = String(json.title || '').trim();
        content = String(json.content || json.text || '').trim();
        device_id = String(json.device_id || '').trim();
        received_at_raw = json.received_at !== undefined ? json.received_at : '';
      } catch {
        return NextResponse.json(
          { error: 'Format JSON tidak valid' },
          { status: 400, headers: corsHeaders }
        );
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      app_name = String(formData.get('app_name') || '');
      title = String(formData.get('title') || '');
      content = String(formData.get('content') || formData.get('text') || '');
      device_id = String(formData.get('device_id') || '');
      received_at_raw = String(formData.get('received_at') || '');
    } else {
      return NextResponse.json(
        { error: 'Unsupported Media Type. Gunakan application/json atau application/x-www-form-urlencoded' },
        { status: 415, headers: corsHeaders }
      );
    }

    if (!app_name || (!title && !content)) {
      return NextResponse.json(
        { error: 'Payload tidak lengkap. Parameter app_name dan title/content wajib diisi.' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Sensor data sensitif (OTP/PIN)
    const isSensitive = isSensitiveContent(`${title} ${content}`);
    const safeTitle = isSensitive ? '[REDACTED]' : title;
    const safeContent = isSensitive ? '[REDACTED]' : content;

    // Identifikasi device / role pengirim
    const sourceDevice = device_id.includes('istri') || clientApiKey?.includes('istri') ? 'istri' : 'suami';

    // Inisialisasi Supabase Client Env
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Ambil aturan promo adaptif dari database (dengan cache 60s)
    const learnedRules = await getLearnedPromoRules(supabaseUrl, supabaseKey);

    // Ekstraksi notifikasi cerdas (Regex presisi + Layer Adaptif + AI Fallback)
    const parsed = await parseNotificationPayload(
      app_name,
      safeTitle,
      safeContent,
      process.env.GEMINI_API_KEY,
      learnedRules
    );
    const { amount, direction, merchant, accountName, isTransaction } = parsed;

    // Tanggal transaksi (prioritas: tanggal dalam teks notifikasi -> received_at dari HP -> waktu sekarang)
    let transactionDate = new Date().toISOString();
    if (parsed.transactionDate) {
      transactionDate = parsed.transactionDate;
    } else if (typeof received_at_raw === 'number' && received_at_raw > 1000000000) {
      transactionDate = new Date(received_at_raw).toISOString();
    } else if (typeof received_at_raw === 'string' && received_at_raw.trim()) {
      const parsedEpoch = parseInt(received_at_raw, 10);
      if (!isNaN(parsedEpoch) && parsedEpoch > 1000000000) {
        transactionDate = new Date(parsedEpoch).toISOString();
      } else {
        const d = new Date(received_at_raw);
        if (!isNaN(d.getTime())) transactionDate = d.toISOString();
      }
    }

    if (!supabaseUrl || !supabaseKey) {
      // Mock response jika env belum diisi
      return NextResponse.json(
        {
          status: 'success',
          is_transaction: isTransaction,
          message: 'Notifikasi diterima (mode simulasi lokal).',
          data: {
            app_name,
            title: safeTitle,
            content: safeContent,
            amount,
            merchant,
            direction,
          },
        },
        { status: 201, headers: corsHeaders }
      );
    }

    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Dapatkan default household
    const { data: defaultProfile } = await supabase
      .from('profiles')
      .select('household_id')
      .limit(1)
      .maybeSingle();

    const householdId = defaultProfile?.household_id;

    // Hitung Dedupe Hash unik (tahan terhadap retry jaringan per-menit)
    const timeSeed = received_at_raw || Math.floor(Date.now() / 60000);
    const rawDedupeSeed = `notif:${sourceDevice}:${app_name}:${timeSeed}:${amount}:${merchant}`;
    const dedupeHash = crypto.createHash('sha256').update(rawDedupeSeed).digest('hex');

    // 1. Simpan ke raw_notifications SELALU (Fase 0: simpan log mentah apa adanya)
    if (householdId) {
      try {
        const epochMs = typeof received_at_raw === 'number' && received_at_raw > 1000000000 
          ? received_at_raw 
          : typeof received_at_raw === 'string' && !isNaN(parseInt(received_at_raw, 10)) && parseInt(received_at_raw, 10) > 1000000000
          ? parseInt(received_at_raw, 10)
          : Date.now();

        const { error: rawErr } = await supabase.from('raw_notifications').insert({
          household_id: householdId,
          device_id: sourceDevice,
          source: 'notification',
          app_name,
          title: safeTitle,
          content: safeContent,
          received_at_raw: String(received_at_raw || Date.now()),
          received_at: epochMs,
          outcome: isTransaction ? 'transaction' : 'ignored',
          reasons: parsed.reasons,
          parser_version: parsed.parseMethod,
          sensitive: isSensitive,
        });
        if (rawErr) {
          console.error('Gagal simpan raw_notification:', rawErr.message);
        }
      } catch (err: unknown) {
        console.error('Exception simpan raw_notification:', err instanceof Error ? err.message : err);
      }
    }

    // 2. Filter: Abaikan jika terkonfirmasi bukan transaksi finansial (misal obrolan chat penjual / promo iklan / nominal 0)
    // Transaksi resmi HANYA boleh masuk ke tabel transactions jika isTransaction = true, amount > 0, dan bukan ignored
    if (!isTransaction || amount <= 0 || parsed.outcome === 'ignored') {
      let unparsedReviewAlert: ReviewAlert | null = null;
      const isBankApp = /jago|mandiri|livin|bmri|bca|mybca|bri|brimo|bni|wondr|bsi|bsm|byond|seabank|bankbke|saqu|bjj|blu|shopeepay|gopay|dana|ovo|linkaja/i.test(`${app_name} ${safeTitle}`);
      const isChatOrPromo = parsed.reasons.some(r => r.includes('promo') || r.includes('chat') || r.includes('obrolan'));
      if (isBankApp && !isChatOrPromo) {
        unparsedReviewAlert = {
          amount: 0,
          merchant: safeTitle || app_name,
          accountName: app_name,
          title: '⚠️ Format Mutasi Baru Terdeteksi',
          message: `${app_name}: Notifikasi masuk tapi nominal belum terbaca otomatis. Ketuk untuk periksa.`,
          reason: parsed.reasons.join(', ') || 'Format belum dikenali Regex',
        };
      }

      return NextResponse.json(
        {
          status: 'success',
          is_transaction: false,
          review_alert: unparsedReviewAlert,
          budget_alert: null,
          message: 'Notifikasi dicatat di raw stream, diabaikan dari riwayat transaksi karena bukan transaksi finansial valid.',
          data: {
            app_name,
            title: safeTitle,
            amount: 0,
            merchant,
            reasons: parsed.reasons,
            parse_method: parsed.parseMethod,
          },
        },
        { status: 201, headers: corsHeaders }
      );
    }

    // 3. Masukkan ke tabel transactions jika sah bernilai > 0
    let newTransaction: TransactionRecord | null = null;
    let budgetAlert: BudgetAlert | null = null;

    if (householdId) {
      // Cari akun yang paling cocok
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name, owner, type')
        .eq('household_id', householdId);

      let accountId = accounts?.[0]?.id || null;
      if (accounts && accounts.length > 0) {
        const target = (accountName || app_name).toLowerCase();
        // Prioritas 1: nama bank/wallet cocok dan pemilik sesuai sourceDevice
        const exactMatch = accounts.find(a => 
          (target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)) && a.owner === sourceDevice
        );
        // Prioritas 2: nama bank/wallet cocok (apapun pemiliknya)
        const nameMatch = accounts.find(a =>
          target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)
        );
        // Prioritas 3: akun default milik sourceDevice
        const deviceDefault = accounts.find(a => a.owner === sourceDevice);

        accountId = exactMatch?.id || nameMatch?.id || deviceDefault?.id || accounts[0].id;
      }

      // Cari kategori
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('household_id', householdId);

      const suggestedCategoryId = categories ? suggestCategoryForMerchant(merchant, categories) : null;

      // Cek apakah ada notifikasi konfirmasi ganda pada waktu bersamaan (+/- 3 menit)
      const txTimeMs = new Date(transactionDate).getTime();
      const minTimeIso = new Date(txTimeMs - 3 * 60 * 1000).toISOString();
      const maxTimeIso = new Date(txTimeMs + 3 * 60 * 1000).toISOString();

      const { data: existingSameTimeTx } = await supabase
        .from('transactions')
        .select('id, merchant, raw_notification')
        .eq('household_id', householdId)
        .eq('amount', amount)
        .eq('direction', direction)
        .eq('source_device', sourceDevice)
        .gte('transaction_date', minTimeIso)
        .lte('transaction_date', maxTimeIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSameTimeTx) {
        // Jika notifikasi baru memiliki nama merchant spesifik (misal 'warung sayur mas Eko') sedangkan sebelumnya nama kantong generik ('your Daily Pocket')
        const isGeneric = (m: string) => /daily\s*pocket|kantong|saldo|dana|gopay|ovo|shopeepay|rekening|merchant\s*transaksi|transaksi\s*digital/i.test(m);
        if (isGeneric(existingSameTimeTx.merchant) && !isGeneric(merchant)) {
          await supabase
            .from('transactions')
            .update({
              merchant,
              raw_notification: `${existingSameTimeTx.raw_notification} | [Notif Ganda] ${safeTitle}: ${safeContent}`,
            })
            .eq('id', existingSameTimeTx.id);
        }

        return NextResponse.json(
          {
            status: 'success',
            duplicate: true,
            review_alert: null,
            budget_alert: null,
            message: 'Notifikasi konfirmasi kedua pada waktu dan nominal bersamaan disatukan otomatis.',
            dedupe_hash: dedupeHash,
          },
          { status: 200, headers: corsHeaders }
        );
      }

      // Ambil tanggal siklus gajian dari settings
      const { data: settingData } = await supabase
        .from('settings')
        .select('month_start_day')
        .eq('household_id', householdId)
        .maybeSingle();
      const monthStartDay = settingData?.month_start_day || 1;

      // Cek apakah ada pasangan mutasi arah berlawanan dalam rentang +/- 3 menit (Transfer Internal / Top-Up)
      const oppositeDirection = direction === 'out' ? 'in' : 'out';
      const { data: pairedTransferTx } = await supabase
        .from('transactions')
        .select('id, merchant, account_id, raw_notification, accounts(name)')
        .eq('household_id', householdId)
        .eq('amount', amount)
        .eq('direction', oppositeDirection)
        .gte('transaction_date', minTimeIso)
        .lte('transaction_date', maxTimeIso)
        .neq('status', 'ignored')
        .not('merchant', 'ilike', 'Transfer Internal:%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isTopUpKeyword = /\b(top\s*up|isi\s*saldo|isi\s*ulang)\s*(?:ke\s*)?(gopay|dana|ovo|shopeepay|linkaja|kantong)/i.test(`${safeTitle} ${safeContent}`) ||
        /\b(top\s*up|isi\s*saldo)\b/i.test(merchant);

      let isInternalTransfer = false;
      let finalMerchant = merchant;
      let finalNotes = '';

      if (pairedTransferTx) {
        isInternalTransfer = true;
        const pairedAccName = (pairedTransferTx.accounts as unknown as { name?: string })?.name || pairedTransferTx.merchant || 'Akun Lain';
        const currentAccName = accountName || app_name || 'Akun';
        const fromAccount = direction === 'out' ? currentAccName : pairedAccName;
        const toAccount = direction === 'out' ? pairedAccName : currentAccName;

        finalMerchant = `Transfer Internal: ${fromAccount} ➔ ${toAccount}`;
        finalNotes = 'Dipasangkan otomatis sebagai perpindahan dana internal';

        // Update pasangan transaksi sebelumnya
        await supabase
          .from('transactions')
          .update({
            merchant: finalMerchant,
            status: 'reconciled',
            notes: finalNotes,
          })
          .eq('id', pairedTransferTx.id);

        if (isTelegramConfigured()) {
          const transferAlert = formatInternalTransferAlertMessage({
            fromAccount,
            toAccount,
            amount,
          });
          try {
            await broadcastToAllowedChats(transferAlert);
          } catch (tErr) {
            console.warn('[Telegram Broadcast Paired Transfer Alert Warn]:', tErr);
          }
        }
      } else if (isTopUpKeyword) {
        isInternalTransfer = true;
        finalMerchant = `Transfer Internal: Top Up ${merchant || 'E-Wallet'}`;
        finalNotes = 'Terdeteksi top-up dompet digital / perpindahan internal';

        if (isTelegramConfigured()) {
          const transferAlert = formatInternalTransferAlertMessage({
            fromAccount: accountName || app_name || 'Bank',
            toAccount: merchant || 'E-Wallet',
            amount,
          });
          try {
            await broadcastToAllowedChats(transferAlert);
          } catch (tErr) {
            console.warn('[Telegram Broadcast TopUp Alert Warn]:', tErr);
          }
        }
      }

      // Penentuan status otomatis: jika format baku regex atau transfer internal -> langsung 'reconciled'
      const isFixFormat = parsed.parseMethod === 'regex' && !isSensitive && amount > 0;
      const initialStatus = (isInternalTransfer || isFixFormat) ? 'reconciled' : 'pending';

      let { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          account_id: accountId,
          category_id: isInternalTransfer ? null : suggestedCategoryId,
          amount,
          direction,
          merchant: finalMerchant,
          raw_notification: `[Notifikasi ${accountName || app_name}] ${safeTitle}: ${safeContent}`,
          source_device: sourceDevice,
          transaction_date: transactionDate,
          status: initialStatus,
          notes: finalNotes || null,
          dedupe_hash: dedupeHash,
          needs_review: isSensitive || amount === 0,
          parse_method: parsed.parseMethod,
        })
        .select('*')
        .single();

      // Retry tanpa parse_method atau notes jika kolom belum termigrasi
      if (txError && txError.code === '42703') {
        const retryRes = await supabase
          .from('transactions')
          .insert({
            household_id: householdId,
            account_id: accountId,
            category_id: isInternalTransfer ? null : suggestedCategoryId,
            amount,
            direction,
            merchant: finalMerchant,
            raw_notification: `[Notifikasi ${accountName || app_name}] ${safeTitle}: ${safeContent}`,
            source_device: sourceDevice,
            transaction_date: transactionDate,
            status: initialStatus,
            dedupe_hash: dedupeHash,
            needs_review: isSensitive || amount === 0,
          })
          .select('*')
          .single();
        tx = retryRes.data;
        txError = retryRes.error;
      }

      if (txError) {
        if (txError.code === '23505') {
          return NextResponse.json(
            {
              status: 'success',
              duplicate: true,
              review_alert: null,
              budget_alert: null,
              message: 'Notifikasi transaksi sudah pernah dicatat sebelumnya.',
              dedupe_hash: dedupeHash,
            },
            { status: 200, headers: corsHeaders }
          );
        }
        console.error('[Notification Insert Error]:', txError.message);
      } else {
        newTransaction = tx as TransactionRecord;

        // Evaluasi ambang batas anggaran jika pengeluaran riil (bukan transfer internal)
        if (direction === 'out' && amount > 0 && !isInternalTransfer) {
          const catName = categories?.find(c => c.id === suggestedCategoryId)?.name || merchant || 'Lainnya';
          const accName = accounts?.find(a => a.id === accountId)?.name || 'Akun Keluarga';

          // 1. Kirim Notifikasi Pengeluaran Realtime ke Telegram (Hanya untuk Uang Keluar Sah)
          if (isTelegramConfigured() && newTransaction?.id) {
            const alertMsg = formatExpenseAlertMessage({
              merchant: finalMerchant,
              amount,
              categoryName: catName,
              accountName: accName,
              sourceDevice,
              isAutoReconciled: isFixFormat,
            });

            const replyMarkup = isFixFormat
              ? {
                  inline_keyboard: [
                    [
                      { text: '🔄 Itu Transfer Sendiri', callback_data: `tx_mark_transfer:${newTransaction.id}` },
                      { text: '❌ Batalkan / Promo', callback_data: `tx_wrong_menu:${newTransaction.id}` },
                    ],
                  ],
                }
              : {
                  inline_keyboard: [
                    [
                      { text: '✅ Benar & Sesuai', callback_data: `tx_ok:${newTransaction.id}` },
                      { text: '❌ Salah / Bukan Belanja', callback_data: `tx_wrong_menu:${newTransaction.id}` },
                    ],
                  ],
                };

            try {
              await broadcastToAllowedChats(alertMsg, {
                reply_markup: replyMarkup,
              });
            } catch (tErr) {
              console.warn('[Telegram Broadcast Expense Alert Warn]:', tErr);
            }
          }

          // 2. Evaluasi Ambang Batas Anggaran
          try {
            budgetAlert = await evaluateBudgetAlert(supabase, householdId, catName, transactionDate, monthStartDay);

            // Memicu notifikasi darurat ke Telegram jika batas anggaran mencapai 100%
            if (budgetAlert && budgetAlert.level === '100' && isTelegramConfigured()) {
              const overspent = Math.max(0, budgetAlert.totalSpent - budgetAlert.limitAmount);
              const telegramMsg = formatOverbudgetAlert(
                budgetAlert.categoryName,
                budgetAlert.totalSpent,
                budgetAlert.limitAmount,
                overspent
              );
              try {
                await broadcastToAllowedChats(telegramMsg);
              } catch (tErr) {
                console.warn('[Telegram Broadcast Overbudget Alert Warn]:', tErr);
              }
            }
          } catch (bErr) {
            console.warn('Gagal evaluasi budget alert:', bErr);
          }
        }
      }
    }

    // Evaluasi apakah butuh validasi langsung dari pengguna (needs_review)
    let reviewAlert: ReviewAlert | null = null;
    if (isSensitive || amount === 0 || parsed.parseMethod === 'ai_gemini') {
      const reason = isSensitive
        ? 'Terdeteksi data sensitif dalam notifikasi'
        : amount === 0
        ? 'Nominal transaksi belum terdeteksi otomatis'
        : 'Kategori dianalisis otomatis oleh AI Gemini, mohon konfirmasi';
      reviewAlert = {
        transactionId: newTransaction?.id,
        amount,
        merchant,
        accountName: accountName || app_name,
        title: '⚠️ Verifikasi Transaksi Baru',
        message: `${accountName || app_name}: ${merchant || 'Mutasi'} ${amount > 0 ? formatRupiah(amount) : ''} perlu Anda periksa.`.trim(),
        reason,
      };
    }

    return NextResponse.json(
      {
        status: 'success',
        is_transaction: true,
        message: 'Notifikasi berhasil dicatat ke sistem.',
        review_alert: reviewAlert,
        budget_alert: budgetAlert,
        data: newTransaction || {
          app_name,
          title: safeTitle,
          amount,
          merchant,
          direction,
          parse_method: parsed.parseMethod,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Notification Route Error]:', errorMessage);
    return NextResponse.json(
      {
        error: 'Terjadi kesalahan pemrosesan notifikasi.',
        message: errorMessage,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
