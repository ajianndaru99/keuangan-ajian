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
  // Kunci default dev yang selalu diterima untuk kemudahan testing lokal
  const allowedDevKeys = ['mock_dev_key_suami', 'mock_dev_key_istri'];
  if (allowedDevKeys.includes(clientKey)) return true;

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

    if (contentType.includes('application/json')) {
      try {
        const json = await req.json();
        app_name = String(json.app_name || json.packageName || '').trim();
        title = String(json.title || '').trim();
        content = String(json.content || json.text || '').trim();
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
    const sourceDevice = clientApiKey?.includes('istri') ? 'istri' : 'suami';

    // Ekstraksi notifikasi cerdas (Regex presisi + AI Fallback)
    const parsed = await parseNotificationPayload(app_name, safeTitle, safeContent, process.env.GEMINI_API_KEY);
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

    // Inisialisasi Supabase Client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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

    // Hitung Dedupe Hash unik
    const rawDedupeSeed = `notif:${sourceDevice}:${app_name}:${received_at_raw || Date.now()}:${amount}:${merchant}`;
    const dedupeHash = crypto.createHash('sha256').update(rawDedupeSeed).digest('hex');

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
      return NextResponse.json(
        {
          status: 'success',
          is_transaction: false,
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

      let { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          account_id: accountId,
          category_id: suggestedCategoryId,
          amount,
          direction,
          merchant,
          raw_notification: `[Notifikasi ${accountName || app_name}] ${safeTitle}: ${safeContent}`,
          source_device: sourceDevice,
          transaction_date: transactionDate,
          status: 'pending',
          dedupe_hash: dedupeHash,
          needs_review: isSensitive || amount === 0,
          parse_method: parsed.parseMethod,
        })
        .select('*')
        .single();

      // Retry tanpa parse_method jika kolom belum dibuat di database Supabase
      if (txError && txError.code === '42703') {
        const retryRes = await supabase
          .from('transactions')
          .insert({
            household_id: householdId,
            account_id: accountId,
            category_id: suggestedCategoryId,
            amount,
            direction,
            merchant,
            raw_notification: `[Notifikasi ${accountName || app_name}] ${safeTitle}: ${safeContent}`,
            source_device: sourceDevice,
            transaction_date: transactionDate,
            status: 'pending',
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
              message: 'Notifikasi transaksi sudah pernah dicatat sebelumnya.',
              dedupe_hash: dedupeHash,
            },
            { status: 200, headers: corsHeaders }
          );
        }
        console.error('[Notification Insert Error]:', txError.message);
      } else {
        newTransaction = tx as TransactionRecord;
      }
    }

    return NextResponse.json(
      {
        status: 'success',
        is_transaction: true,
        message: 'Notifikasi berhasil dicatat ke sistem.',
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
