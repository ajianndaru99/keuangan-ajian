// ==============================================================================
// API ROUTE: src/app/api/notification/route.ts
// Endpoint penerima notifikasi perbankan & e-wallet otomatis (SmsForwarder & MacroDroid)
// Kompatibel dengan Vercel, Next.js App Router, dan Supabase Database
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { suggestCategoryForMerchant } from '@/lib/vision/gemini';
import {
  parseNotificationPayload,
  enhanceNotificationWithSyncAI,
} from '@/lib/ai/notification-parser';
import { classifyExpenseCategoryRuleBased } from '@/lib/ai/category-classifier';
import { evaluateBudgetAlert, type BudgetAlert, type ReviewAlert } from '@/lib/budget/budget-guard';
import { formatRupiah } from '@/lib/utils';
import { isTelegramConfigured, broadcastToAllowedChats } from '@/lib/telegram/bot';
import {
  formatOverbudgetAlert,
  formatExpenseAlertMessage,
  formatIncomeAlertMessage,
  formatInternalTransferAlertMessage,
} from '@/lib/telegram/formatters';
import { applyAccountBalanceDelta } from '@/lib/account-balance';
import { syncTransactionsToSpreadsheet } from '@/lib/spreadsheet/sheets-sync';

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
 
// Cache memori aturan promo adaptif (TTL singkat 15 detik agar aturan baru Telegram cepat aktif)
let cachedRules: { rules: string[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 15 * 1000;

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
    let received_at_raw: string | number = '';
    let notificationKey = '';

    if (contentType.includes('application/json')) {
      try {
        const json = await req.json();
        app_name = String(json.app_name || json.packageName || '').trim();
        title = String(json.title || '').trim();
        content = String(json.content || json.text || '').trim();
        received_at_raw = json.received_at !== undefined ? json.received_at : '';
        notificationKey = String(json.notification_key || json.notificationKey || '').trim();
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
      received_at_raw = String(formData.get('received_at') || '');
      notificationKey = String(formData.get('notification_key') || '');
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

    // Sistem 1 Akun Utama (Suami Only)
    const sourceDevice = 'suami' as const;

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
          title: '[PERLU PERIKSA] Format Mutasi Baru Terdeteksi',
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
    let workingAmount = amount;
    let workingDirection = direction;
    let workingMerchant = merchant;
    let finalParseMethod: 'regex' | 'ai_gemini' | 'manual' = parsed.parseMethod;

    if (householdId) {
      // Ambil accounts, categories, dan settings secara paralel untuk memangkas latency
      const [{ data: accounts }, { data: categories }, { data: settingData }] = await Promise.all([
        supabase.from('accounts').select('id, name, owner, type').eq('household_id', householdId),
        supabase.from('categories').select('id, name, type').eq('household_id', householdId),
        supabase
          .from('settings')
          .select('month_start_day, show_full_notification_telegram')
          .eq('household_id', householdId)
          .maybeSingle(),
      ]);

      const monthStartDay = settingData?.month_start_day || 1;
      const showFullNotifTelegram = settingData?.show_full_notification_telegram !== false;

      // Cari akun Suami yang paling cocok
      let accountId = accounts?.[0]?.id || null;
      if (accounts && accounts.length > 0) {
        const target = (accountName || app_name).toLowerCase();
        const suamiMatch = accounts.find(
          (a) =>
            (a.owner === 'suami' || a.owner === 'bersama') &&
            (target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target))
        );
        const suamiDefault = accounts.find((a) => a.owner === 'suami');
        const nameMatch = accounts.find(
          (a) => target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)
        );
        accountId = suamiMatch?.id || nameMatch?.id || suamiDefault?.id || accounts[0].id;
      }

      const rawCombined = `${safeTitle} ${safeContent}`.trim();
      const ruleClassified = classifyExpenseCategoryRuleBased(workingMerchant, rawCombined, workingAmount);
      let suggestedCategoryId = categories
        ? suggestCategoryForMerchant(workingMerchant, categories, rawCombined, workingAmount)
        : null;

      // Fast-path Merchant Memory (lewatkan Sync AI jika merchant yang sama sudah pernah direkonsiliasi)
      let memoryMatched = false;
      if (workingDirection === 'out' && !ruleClassified.confident && workingMerchant.length >= 3) {
        const { data: memTx } = await supabase
          .from('transactions')
          .select('category_id')
          .eq('household_id', householdId)
          .eq('status', 'reconciled')
          .ilike('merchant', workingMerchant)
          .not('category_id', 'is', null)
          .order('transaction_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (memTx?.category_id) {
          suggestedCategoryId = memTx.category_id;
          memoryMatched = true;
        }
      }

      // Pengayaan AI Sinkron HANYA jika kategori belum yakin atau format belum terkonfirmasi ketat (cegah promo lolos)
      let syncAiConfirmed = false;
      const geminiApiKey = process.env.GEMINI_API_KEY || '';
      if (
        geminiApiKey &&
        !isSensitive &&
        !memoryMatched &&
        (!ruleClassified.confident || !parsed.hasStrictConfirmation)
      ) {
        const aiEnh = await enhanceNotificationWithSyncAI(
          app_name,
          safeTitle,
          safeContent,
          parsed,
          geminiApiKey
        );
        if (aiEnh) {
          if (!aiEnh.isTransaction) {
            return NextResponse.json(
              {
                status: 'success',
                is_transaction: false,
                review_alert: null,
                budget_alert: null,
                message: aiEnh.reason || 'Ditolak oleh verifikasi AI sinkron (indikasi promo/non-transaksi).',
                data: { app_name, title: safeTitle, amount: 0, merchant: workingMerchant },
              },
              { status: 201, headers: corsHeaders }
            );
          }

          syncAiConfirmed = true;
          finalParseMethod = 'ai_gemini';
          if (aiEnh.amount > 0) workingAmount = aiEnh.amount;
          if (aiEnh.merchant) workingMerchant = aiEnh.merchant;
          workingDirection = aiEnh.direction;

          const aiCat = (categories || []).find(
            (c) => c.name.toLowerCase() === aiEnh.categoryName.toLowerCase()
          );
          if (aiCat) suggestedCategoryId = aiCat.id;
        }
      }

      // Layer Anti-Double: Fingerprint konten + Rentang +/- 10 menit (ambil hingga 10 kandidat)
      const txTimeMs = new Date(transactionDate).getTime();
      const safeTxMs = Number.isNaN(txTimeMs) ? Date.now() : txTimeMs;
      const timeBucket10m = Math.floor(safeTxMs / (10 * 60 * 1000));
      const contentFingerprint = crypto
        .createHash('sha256')
        .update(
          `fp:${app_name.toLowerCase()}:${workingAmount}:${workingDirection}:${safeTitle.toLowerCase()}:${safeContent.toLowerCase()}:${timeBucket10m}`
        )
        .digest('hex');
      const notificationRef = parsed.reference || (notificationKey ? `${notificationKey}:${timeBucket10m}` : null);

      const minTimeIso = new Date(safeTxMs - 10 * 60 * 1000).toISOString();
      const maxTimeIso = new Date(safeTxMs + 10 * 60 * 1000).toISOString();

      const { data: sameTimeTxs } = await supabase
        .from('transactions')
        .select('id, merchant, account_id, source_device, raw_notification')
        .eq('household_id', householdId)
        .eq('amount', workingAmount)
        .eq('direction', workingDirection)
        .neq('status', 'ignored')
        .gte('transaction_date', minTimeIso)
        .lte('transaction_date', maxTimeIso)
        .order('created_at', { ascending: false })
        .limit(10);

      const isGenericLabel = (m: string) =>
        /^(?:jago|bank\s*jago|bca|mandiri|bri|bni|bsi|seabank|qris|pembayaran(?:\s*qris)?|daily\s*pocket|your\s*daily\s*pocket|kantong(?:\s*utama|\s*bersama)?|saldo|dana|gopay|ovo|shopeepay|linkaja|rekening|merchant(?:\s*transaksi)?|transaksi(?:\s*digital)?|umum|pengeluaran)$/i.test(
          (m || '').trim()
        ) ||
        /daily\s*pocket|kantong|saldo|dana|gopay|ovo|shopeepay|rekening|merchant\s*transaksi|transaksi\s*digital/i.test(
          m || ''
        );

      const incomingIsGeneric = isGenericLabel(workingMerchant);

      for (const existingTx of sameTimeTxs || []) {
        const existingIsGeneric =
          isGenericLabel(existingTx.merchant) || /transfer\s*internal/i.test(existingTx.merchant || '');

        if ((existingIsGeneric && !incomingIsGeneric) || (!existingIsGeneric && incomingIsGeneric)) {
          // Pasangan Transfer Antar Rekening vs Belanja Merchant Riil: pisahkan bukan duplikat
          if (existingIsGeneric && !/transfer\s*internal/i.test(existingTx.merchant || '')) {
            const fromName = existingTx.merchant || 'Bank Jago';
            const toName = accountName || app_name || 'GoPay';
            await supabase
              .from('transactions')
              .update({
                merchant: `Transfer Internal: ${fromName} ➔ ${toName}`,
                category_id: null,
                notes: 'Dikonversi otomatis sebagai transfer internal (pasangan belanja waktu bersamaan)',
              })
              .eq('id', existingTx.id);
          }
          continue;
        }

        if (
          !existingIsGeneric &&
          !incomingIsGeneric &&
          (existingTx.merchant || '').toLowerCase() !== (workingMerchant || '').toLowerCase()
        ) {
          // Merchant spesifik berbeda -> dua transaksi sah terpisah
          continue;
        }

        // Duplikat teknis pada rentang +/- 10 menit -> tolak pencatatan ganda
        const bestMerchant = existingIsGeneric && !incomingIsGeneric ? workingMerchant : existingTx.merchant;
        await supabase
          .from('transactions')
          .update({
            merchant: bestMerchant,
            raw_notification: `${existingTx.raw_notification} | [Notif Ganda Disaring] ${safeTitle}: ${safeContent}`,
          })
          .eq('id', existingTx.id);

        return NextResponse.json(
          {
            status: 'success',
            duplicate: true,
            review_alert: null,
            budget_alert: null,
            message: 'Notifikasi ganda dalam rentang waktu bersamaan otomatis disaring.',
            dedupe_hash: dedupeHash,
          },
          { status: 200, headers: corsHeaders }
        );
      }

      // Cek apakah ada pasangan mutasi arah berlawanan dalam rentang +/- 10 menit (Transfer Internal / Top-Up)
      const oppositeDirection = workingDirection === 'out' ? 'in' : 'out';
      let pairedQuery = supabase
        .from('transactions')
        .select('id, merchant, account_id, direction, amount, status, raw_notification, accounts(name)')
        .eq('household_id', householdId)
        .eq('amount', workingAmount)
        .eq('direction', oppositeDirection)
        .gte('transaction_date', minTimeIso)
        .lte('transaction_date', maxTimeIso)
        .neq('status', 'ignored');

      if (accountId) {
        pairedQuery = pairedQuery.neq('account_id', accountId);
      }

      const { data: pairedTransferTx } = await pairedQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentSourceName = (accountName || app_name || '').trim().toLowerCase();
      const cleanMerchantLower = (workingMerchant || '').trim().toLowerCase();
      const isSelfAccountMerchant =
        Boolean(currentSourceName) &&
        Boolean(cleanMerchantLower) &&
        (currentSourceName === cleanMerchantLower ||
          currentSourceName.includes(cleanMerchantLower) ||
          cleanMerchantLower.includes(currentSourceName));

      const textToScan = `${safeTitle} ${safeContent} ${workingMerchant}`.toLowerCase();
      const walletMatches =
        textToScan.match(/\b(gopay|dana|ovo|shopeepay|linkaja|kantong|jago|bca|mandiri|bri|bni|bsi|seabank)\b/gi) || [];
      const hasDistinctTargetWallet = walletMatches.some((w) => !currentSourceName.includes(w.toLowerCase()));

      const isTopUpKeyword =
        (hasDistinctTargetWallet &&
          (/\b(top\s*up|isi\s*saldo|isi\s*ulang)\b/i.test(textToScan) ||
            /\b(transfer\s*(?:ke)?|trsf)\b/i.test(textToScan) ||
            /\b(gopay|dana|ovo|shopeepay|linkaja)\b/i.test(workingMerchant))) ||
        (!isSelfAccountMerchant &&
          ((/\b(top\s*up|isi\s*saldo|isi\s*ulang)\b/i.test(textToScan) &&
            (hasDistinctTargetWallet || !/\b(gopay|dana|ovo|shopeepay|linkaja)\b/i.test(currentSourceName))) ||
            (/\b(transfer\s*(?:ke)?|trsf)\b/i.test(textToScan) &&
              /\b(gopay|dana|ovo|shopeepay|linkaja|kantong)/i.test(textToScan) &&
              hasDistinctTargetWallet) ||
            (/\b(gopay|dana|ovo|shopeepay|linkaja)\b/i.test(workingMerchant) && workingDirection === 'out')));

      let isInternalTransfer = false;
      let finalMerchant = workingMerchant;
      let finalNotes = '';
      let internalTransferAlertPayload: { fromAccount: string; toAccount: string; amount: number } | null = null;

      if (pairedTransferTx) {
        const pairedAccName =
          (pairedTransferTx.accounts as unknown as { name?: string })?.name || pairedTransferTx.merchant || 'Akun Lain';
        const currentAccName = accountName || app_name || 'Akun';
        const fromAccount = workingDirection === 'out' ? currentAccName : pairedAccName;
        const toAccount = workingDirection === 'out' ? pairedAccName : currentAccName;

        if (fromAccount.trim().toLowerCase() !== toAccount.trim().toLowerCase()) {
          isInternalTransfer = true;
          finalMerchant = `Transfer Internal: ${fromAccount} ➔ ${toAccount}`;
          finalNotes = 'Dipasangkan otomatis sebagai perpindahan dana internal';

          await supabase
            .from('transactions')
            .update({
              merchant: finalMerchant,
              status: 'reconciled',
              notes: finalNotes,
            })
            .eq('id', pairedTransferTx.id);

          if (pairedTransferTx.status !== 'reconciled' && pairedTransferTx.account_id) {
            const pairedDelta =
              pairedTransferTx.direction === 'in'
                ? Number(pairedTransferTx.amount)
                : -Number(pairedTransferTx.amount);
            await applyAccountBalanceDelta(supabase, pairedTransferTx.account_id, pairedDelta);
          }

          const alreadyBroadcasted =
            typeof pairedTransferTx.merchant === 'string' &&
            pairedTransferTx.merchant.startsWith('Transfer Internal:');

          if (!alreadyBroadcasted) {
            internalTransferAlertPayload = { fromAccount, toAccount, amount: workingAmount };
          }
        }
      } else if (isTopUpKeyword) {
        const targetWalletRaw =
          walletMatches.find((w) => !currentSourceName.includes(w.toLowerCase())) || workingMerchant || 'E-Wallet';
        const formattedTarget = targetWalletRaw.charAt(0).toUpperCase() + targetWalletRaw.slice(1);
        const sourceAccLabel = accountName || app_name || 'Bank';

        if (sourceAccLabel.trim().toLowerCase() !== formattedTarget.trim().toLowerCase()) {
          isInternalTransfer = true;
          finalMerchant = `Transfer Internal: ${sourceAccLabel} ➔ ${formattedTarget}`;
          finalNotes = 'Terdeteksi top-up dompet digital / perpindahan internal';
          internalTransferAlertPayload = {
            fromAccount: sourceAccLabel,
            toAccount: formattedTarget,
            amount: workingAmount,
          };
        }
      }

      // Penentuan status otomatis: wajib lolos konfirmasi transaksi ketat (hindari auto-reconciled untuk format meragukan)
      const isFixFormat =
        Boolean(parsed.hasStrictConfirmation) &&
        !isSensitive &&
        workingAmount > 0 &&
        (parsed.parseMethod === 'regex' || syncAiConfirmed);
      const initialStatus = isInternalTransfer || isFixFormat ? 'reconciled' : 'pending';

      const incomeCategory = categories?.find(
        (c) => c.type === 'income' || c.name.toLowerCase().includes('pemasukan') || c.name.toLowerCase().includes('gaji')
      );
      const effectiveCategoryId = isInternalTransfer
        ? null
        : workingDirection === 'in'
          ? incomeCategory?.id || null
          : suggestedCategoryId;

      const fullRawText = `[Notifikasi ${accountName || app_name}] ${safeTitle}: ${safeContent}`;

      let { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          account_id: accountId,
          category_id: effectiveCategoryId,
          amount: workingAmount,
          direction: workingDirection,
          merchant: finalMerchant,
          raw_notification: fullRawText,
          source_device: sourceDevice,
          transaction_date: transactionDate,
          status: initialStatus,
          notes: finalNotes || null,
          dedupe_hash: dedupeHash,
          content_fingerprint: contentFingerprint,
          notification_ref: notificationRef,
          needs_review: isSensitive || workingAmount === 0,
          parse_method: finalParseMethod,
        })
        .select('*')
        .single();

      // Fallback bila ada kolom baru belum termigrasi (42703)
      if (txError && txError.code === '42703') {
        const retryRes = await supabase
          .from('transactions')
          .insert({
            household_id: householdId,
            account_id: accountId,
            category_id: effectiveCategoryId,
            amount: workingAmount,
            direction: workingDirection,
            merchant: finalMerchant,
            raw_notification: fullRawText,
            source_device: sourceDevice,
            transaction_date: transactionDate,
            status: initialStatus,
            dedupe_hash: dedupeHash,
            needs_review: isSensitive || workingAmount === 0,
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

        if (initialStatus === 'reconciled' && accountId) {
          const delta = workingDirection === 'in' ? workingAmount : -workingAmount;
          await applyAccountBalanceDelta(supabase, accountId, delta);
        }

        const rawDisplayText = `${safeTitle ? `${safeTitle}: ` : ''}${safeContent}`.trim();

        // 0. Kirim Notifikasi Transfer Internal / Top-Up ke Telegram
        if (isInternalTransfer && internalTransferAlertPayload && isTelegramConfigured() && newTransaction?.id) {
          const transferAlert = formatInternalTransferAlertMessage({
            ...internalTransferAlertPayload,
            transactionDate: transactionDate || new Date().toISOString(),
            rawNotification: rawDisplayText,
            showRawNotification: showFullNotifTelegram,
          });
          try {
            await broadcastToAllowedChats(transferAlert, {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: 'Ubah', callback_data: `tx_edit:${newTransaction.id}` },
                    { text: 'Dobel', callback_data: `tx_rej_dup:${newTransaction.id}` },
                    { text: 'Batal', callback_data: `tx_wrong_menu:${newTransaction.id}` },
                  ],
                ],
              },
            });
          } catch (tErr) {
            console.warn('[Telegram Broadcast Internal Transfer Alert Warn]:', tErr);
          }
        }

        // 1. Kirim Notifikasi Pemasukan Realtime ke Telegram
        if (workingDirection === 'in' && workingAmount > 0 && !isInternalTransfer) {
          const catName =
            categories?.find(
              (c) => c.type === 'income' || c.name.toLowerCase().includes('pemasukan') || c.name.toLowerCase().includes('gaji')
            )?.name || 'Gaji/Pemasukan';
          const accName = accounts?.find((a) => a.id === accountId)?.name || 'Akun Suami';

          if (isTelegramConfigured() && newTransaction?.id) {
            const alertMsg = formatIncomeAlertMessage({
              merchant: finalMerchant,
              amount: workingAmount,
              categoryName: catName,
              accountName: accName,
              isAutoReconciled: isFixFormat,
              transactionDate: transactionDate || new Date().toISOString(),
              rawNotification: rawDisplayText,
              showRawNotification: showFullNotifTelegram,
            });

            const replyMarkup = isFixFormat
              ? {
                  inline_keyboard: [
                    [
                      { text: 'Ubah', callback_data: `tx_edit:${newTransaction.id}` },
                      { text: 'Promo/Spam', callback_data: `tx_rej_promo:${newTransaction.id}` },
                      { text: 'Dobel', callback_data: `tx_rej_dup:${newTransaction.id}` },
                    ],
                  ],
                }
              : {
                  inline_keyboard: [
                    [
                      { text: 'Sesuai', callback_data: `tx_ok:${newTransaction.id}` },
                      { text: 'Ubah', callback_data: `tx_edit:${newTransaction.id}` },
                    ],
                    [
                      { text: 'Promo/Spam', callback_data: `tx_rej_promo:${newTransaction.id}` },
                      { text: 'Dobel', callback_data: `tx_rej_dup:${newTransaction.id}` },
                    ],
                  ],
                };

            try {
              await broadcastToAllowedChats(alertMsg, { reply_markup: replyMarkup });
            } catch (tErr) {
              console.warn('[Telegram Broadcast Income Alert Warn]:', tErr);
            }
          }
        }

        // 2. Pengeluaran Riil: Kirim Notifikasi Telegram + Evaluasi Budget + Sync Spreadsheet
        if (workingDirection === 'out' && workingAmount > 0 && !isInternalTransfer) {
          const catName = categories?.find((c) => c.id === suggestedCategoryId)?.name || 'Lainnya';
          const accName = accounts?.find((a) => a.id === accountId)?.name || 'Akun Suami';

          if (isTelegramConfigured() && newTransaction?.id) {
            const alertMsg = formatExpenseAlertMessage({
              merchant: finalMerchant,
              amount: workingAmount,
              categoryName: catName,
              accountName: accName,
              isAutoReconciled: isFixFormat,
              transactionDate: transactionDate || new Date().toISOString(),
              rawNotification: rawDisplayText,
              showRawNotification: showFullNotifTelegram,
            });

            const replyMarkup = isFixFormat
              ? {
                  inline_keyboard: [
                    [
                      { text: 'Kategori', callback_data: `tx_cat:${newTransaction.id}` },
                      { text: 'Ubah', callback_data: `tx_edit:${newTransaction.id}` },
                    ],
                    [
                      { text: 'Promo/Spam', callback_data: `tx_rej_promo:${newTransaction.id}` },
                      { text: 'Dobel', callback_data: `tx_rej_dup:${newTransaction.id}` },
                    ],
                  ],
                }
              : {
                  inline_keyboard: [
                    [
                      { text: 'Sesuai', callback_data: `tx_ok:${newTransaction.id}` },
                      { text: 'Kategori', callback_data: `tx_cat:${newTransaction.id}` },
                      { text: 'Ubah', callback_data: `tx_edit:${newTransaction.id}` },
                    ],
                    [
                      { text: 'Promo/Spam', callback_data: `tx_rej_promo:${newTransaction.id}` },
                      { text: 'Dobel', callback_data: `tx_rej_dup:${newTransaction.id}` },
                      { text: 'Lainnya', callback_data: `tx_wrong_menu:${newTransaction.id}` },
                    ],
                  ],
                };

            try {
              await broadcastToAllowedChats(alertMsg, { reply_markup: replyMarkup });
            } catch (tErr) {
              console.warn('[Telegram Broadcast Expense Alert Warn]:', tErr);
            }
          }

          try {
            budgetAlert = await evaluateBudgetAlert(supabase, householdId, catName, transactionDate, monthStartDay);

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

        // Sinkronisasi cepat Spreadsheet (dibatasi timeout 1,5 detik agar webhook tetap responsif)
        if (newTransaction?.id) {
          await Promise.race([
            syncTransactionsToSpreadsheet(supabase, householdId, [newTransaction.id]).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, 1500)),
          ]);
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
        title: '[PERLU KONFIRMASI] Verifikasi Transaksi Baru',
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
