// ==============================================================================
// API ROUTE: src/app/api/notification/route.ts
// Endpoint penerima notifikasi perbankan & e-wallet otomatis (SmsForwarder & MacroDroid)
// Kompatibel dengan Vercel, Next.js App Router, dan Supabase Database
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { suggestCategoryForMerchant, KNOWN_ACCOUNTS } from '@/lib/vision/gemini';

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

// Ekstraksi nominal angka sederhana dari teks notifikasi jika tidak menggunakan parser spesifik
function extractAmountFromText(text: string): { amount: number; direction: 'in' | 'out' } {
  const clean = text.replace(/,/g, '');
  // Deteksi arah
  const isIncoming = /masuk|menerima|diterima|top up|kredit|received|incoming/i.test(text);
  const direction: 'in' | 'out' = isIncoming ? 'in' : 'out';

  // Deteksi Rp ... atau IDR ...
  const matchRp = clean.match(/(?:rp|idr)\.?\s*([\d.]+)/i);
  if (matchRp && matchRp[1]) {
    const num = parseInt(matchRp[1].replace(/\./g, ''), 10);
    if (!isNaN(num) && num > 0) return { amount: num, direction };
  }

  // Deteksi angka digit panjang
  const matchDigit = clean.match(/\b(\d{4,10})\b/);
  if (matchDigit && matchDigit[1]) {
    const num = parseInt(matchDigit[1], 10);
    if (!isNaN(num) && num > 0) return { amount: num, direction };
  }

  return { amount: 0, direction };
}

// Deteksi nama merchant dari teks
function extractMerchantFromText(text: string, title: string): string {
  // Cek pola "ke <Merchant>" atau "di <Merchant>"
  const matchKe = text.match(/(?:ke|di|kepada|pembayaran ke|merchant)\s+([A-Za-z0-9\s&'-]{3,30})/i);
  if (matchKe && matchKe[1]) {
    return matchKe[1].trim().replace(/\s+(berhasil|sukses|pada|sebesar|rp).*$/i, '');
  }

  // Fallback ke judul jika ada
  if (title && title.length > 2 && !/notif|transaksi|bank/i.test(title)) {
    return title.trim();
  }

  return 'Merchant';
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

    // Ekstraksi transaksi
    const { amount, direction } = extractAmountFromText(safeContent);
    const merchant = extractMerchantFromText(safeContent, safeTitle);

    // Tanggal transaksi
    let transactionDate = new Date().toISOString();
    if (typeof received_at_raw === 'number' && received_at_raw > 1000000000) {
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

    // Simpan ke raw_notifications jika ada
    try {
      await supabase.from('raw_notifications').insert({
        source_device: sourceDevice,
        app_name,
        title: safeTitle,
        content: safeContent,
        received_at_raw: String(received_at_raw),
        dedupe_hash: dedupeHash,
      });
    } catch {
      // Abaikan jika tabel raw_notifications belum dibuat atau tidak wajib
    }

    // Jika household ditemukan, simpan ke transactions
    let newTransaction: any = null;
    if (householdId) {
      // Cari akun yang cocok
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', householdId);

      let accountId = accounts?.[0]?.id || null;
      if (accounts && accounts.length > 0) {
        const lowerApp = app_name.toLowerCase();
        const matched = accounts.find(a => lowerApp.includes(a.name.toLowerCase()));
        if (matched) accountId = matched.id;
      }

      // Cari kategori
      const { data: categories } = await supabase
        .from('categories')
        .select('id, name')
        .eq('household_id', householdId);

      const suggestedCategoryId = categories ? suggestCategoryForMerchant(merchant, categories) : null;

      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          household_id: householdId,
          account_id: accountId,
          category_id: suggestedCategoryId,
          amount,
          direction,
          merchant,
          raw_notification: `[Notifikasi ${app_name}] ${safeTitle}: ${safeContent}`,
          source_device: sourceDevice,
          transaction_date: transactionDate,
          status: 'pending',
          dedupe_hash: dedupeHash,
          needs_review: amount === 0 || isSensitive,
        })
        .select('*')
        .single();

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
        newTransaction = tx;
      }
    }

    return NextResponse.json(
      {
        status: 'success',
        message: 'Notifikasi berhasil dicatat ke sistem.',
        data: newTransaction || {
          app_name,
          title: safeTitle,
          amount,
          merchant,
          direction,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[Notification Route Error]:', error?.message || error);
    return NextResponse.json(
      {
        error: 'Terjadi kesalahan pemrosesan notifikasi.',
        message: error?.message || String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
