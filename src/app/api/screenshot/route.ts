// ==============================================================================
// API ROUTE: src/app/api/screenshot/route.ts
// Endpoint penerima screenshot bukti transaksi keuangan (MacroDroid & Web UI)
// Terintegrasi dengan Vision AI Google Gemini
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  analyzeReceiptWithVision,
  generateScreenshotDedupeHash,
  suggestCategoryForMerchant,
} from '@/lib/vision/gemini';

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
  if (!clientKey || !configuredKey) return false;
  const validKeys = configuredKey.split(',').map(k => k.trim()).filter(Boolean);
  return validKeys.some(expected => expected === clientKey);
}

export async function POST(req: NextRequest) {
  try {
    const configuredApiKey = process.env.WEBHOOK_API_KEY;
    const clientApiKey = req.headers.get('x-api-key') || req.headers.get('X-API-KEY');

    // Cek otentikasi: apakah lewat API Key (MacroDroid / external) atau sesi login user (Web UI)
    let isApiKeyAuth = false;
    let loggedInHouseholdId: string | null = null;
    let loggedInRole: 'suami' | 'istri' | null = null;

    if (isValidApiKey(clientApiKey, configuredApiKey)) {
      isApiKeyAuth = true;
    } else {
      // Coba otentikasi via session cookie Web UI
      try {
        const supabaseUserClient = await createServerClient();
        const { data: { user } } = await supabaseUserClient.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseUserClient
            .from('profiles')
            .select('household_id, role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            loggedInHouseholdId = profile.household_id;
            loggedInRole = profile.role as 'suami' | 'istri';
          }
        }
      } catch {
        // Bukan sesi login browser
      }
    }

    if (!isApiKeyAuth && !loggedInHouseholdId) {
      return NextResponse.json(
        { error: 'Unauthorized: Header X-API-KEY tidak valid atau Anda belum login.' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Ekstraksi data gambar (mendukung multipart/form-data dan application/json base64)
    const contentType = req.headers.get('content-type') || '';
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';
    let sourceDevice: 'suami' | 'istri' = loggedInRole || 'suami';
    let isDryRun = false;

    // Ambil parameter source_device dan dry_run dari query URL atau header (sangat memudahkan MacroDroid)
    const reqUrl = new URL(req.url);
    const queryDev = reqUrl.searchParams.get('source_device') || req.headers.get('x-source-device');
    if (queryDev && ['suami', 'istri'].includes(queryDev.toLowerCase())) {
      sourceDevice = queryDev.toLowerCase() as 'suami' | 'istri';
    }
    const queryDry = reqUrl.searchParams.get('dry_run') || req.headers.get('x-dry-run');
    if (queryDry) {
      isDryRun = queryDry === 'true' || queryDry === '1';
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = (formData.get('file') || formData.get('image') || formData.get('screenshot')) as File | null;

      if (!file) {
        return NextResponse.json(
          { error: "File gambar tidak ditemukan. Gunakan field 'file', 'image', atau 'screenshot'." },
          { status: 400, headers: corsHeaders }
        );
      }

      const rawDev = formData.get('source_device') as string | null;
      if (rawDev && ['suami', 'istri'].includes(rawDev.toLowerCase())) {
        sourceDevice = rawDev.toLowerCase() as 'suami' | 'istri';
      }

      const rawDry = formData.get('dry_run');
      if (rawDry) isDryRun = rawDry === 'true' || rawDry === '1';

      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type || 'image/jpeg';
    } else if (contentType.startsWith('image/') || contentType.includes('application/octet-stream')) {
      // Dukungan langsung Raw Binary Image (mode Berkas image/jpeg dari MacroDroid)
      const arrayBuffer = await req.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
    } else {
      // JSON body (base64)
      const body = await req.json().catch(() => ({}));
      const base64Str = body.image_base64 || body.image || body.base64;

      if (!base64Str || typeof base64Str !== 'string') {
        return NextResponse.json(
          { error: "Payload JSON wajib memuat 'image_base64' (string base64)." },
          { status: 400, headers: corsHeaders }
        );
      }

      // Bersihkan data URL prefix jika ada (data:image/png;base64,...)
      const cleanedBase64 = base64Str.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      imageBuffer = Buffer.from(cleanedBase64, 'base64');
      mimeType = body.mime_type || 'image/jpeg';

      if (body.source_device && ['suami', 'istri'].includes(String(body.source_device).toLowerCase())) {
        sourceDevice = String(body.source_device).toLowerCase() as 'suami' | 'istri';
      }
      if (body.dry_run !== undefined) isDryRun = Boolean(body.dry_run);
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json(
        { error: 'Berkas gambar kosong atau tidak terbaca.' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Ekstraksi multimodal melalui Google Gemini Vision
    const vision = await analyzeReceiptWithVision(imageBuffer, mimeType);

    if (!vision.isValidReceipt) {
      return NextResponse.json(
        {
          error: 'Gambar bukan bukti transaksi yang berhasil atau tidak dapat dikenali.',
          details: vision,
        },
        { status: 422, headers: corsHeaders }
      );
    }

    // 2. Buat Supabase Admin / Client untuk penyimpanan
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // 3. Hitung dedupe hash unik
    const dedupeHash = await generateScreenshotDedupeHash(
      sourceDevice,
      vision.accountName,
      vision.referenceNumber,
      vision.totalAmount,
      vision.transactionDate
    );

    // 4. Periksa apakah transaksi sudah pernah tersimpan
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id, amount, merchant, transaction_date')
      .eq('dedupe_hash', dedupeHash)
      .maybeSingle();

    if (existingTx) {
      return NextResponse.json(
        {
          status: 'success',
          duplicate: true,
          message: 'Bukti transaksi ini sudah pernah dicatat sebelumnya.',
          dedupe_hash: dedupeHash,
          transaction: existingTx,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Jika mode dry_run, kembalikan hasil pembacaan tanpa menyentuh database
    if (isDryRun) {
      return NextResponse.json(
        {
          status: 'success',
          dry_run: true,
          dedupe_hash: dedupeHash,
          vision,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 5. Tentukan household_id
    let householdId = loggedInHouseholdId;
    if (!householdId) {
      // Lookup profil sesuai pemilik
      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('role', sourceDevice)
        .limit(1)
        .maybeSingle();

      if (profile?.household_id) {
        householdId = profile.household_id;
      } else {
        // Fallback ke household pertama
        const { data: hh } = await supabase.from('households').select('id').limit(1).maybeSingle();
        householdId = hh?.id || null;
      }
    }

    if (!householdId) {
      return NextResponse.json(
        { error: 'Household belum terdaftar di database.' },
        { status: 500, headers: corsHeaders }
      );
    }

    // 6. Temukan atau buat akun bank/e-wallet yang sesuai
    let accountId: string | null = null;
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('household_id', householdId)
      .eq('owner', sourceDevice)
      .ilike('name', vision.accountName)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      // Cari akun alternatif milik owner yang sama
      const { data: fallbackAccount } = await supabase
        .from('accounts')
        .select('id')
        .eq('household_id', householdId)
        .eq('owner', sourceDevice)
        .limit(1)
        .maybeSingle();

      if (fallbackAccount) {
        accountId = fallbackAccount.id;
      } else {
        // Buat akun baru jika belum ada sama sekali
        const { data: newAccount, error: accErr } = await supabase
          .from('accounts')
          .insert({
            household_id: householdId,
            owner: sourceDevice,
            name: vision.accountName,
            type: vision.accountType,
            balance: 0,
            initial_balance: 0,
          })
          .select('id')
          .single();

        if (accErr) throw accErr;
        accountId = newAccount.id;
      }
    }

    // 7. Cari rekomendasi kategori berdasarkan merchant
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('household_id', householdId);

    const suggestedCategoryId = categories
      ? suggestCategoryForMerchant(vision.merchant, categories)
      : null;

    // 8. Masukkan transaksi baru
    const { data: newTransaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        account_id: accountId,
        category_id: suggestedCategoryId,
        amount: vision.totalAmount,
        direction: vision.direction,
        merchant: vision.merchant,
        raw_notification: `[Screenshot Vision] ${vision.rawSummary} (Ref: ${vision.referenceNumber || '-'})`,
        source_device: sourceDevice,
        transaction_date: vision.transactionDate,
        status: 'pending',
        dedupe_hash: dedupeHash,
        needs_review: (vision.confidenceScore ?? 1) < 0.7,
      })
      .select('*')
      .single();

    if (txError) {
      // Tangani race condition duplicate hash
      if (txError.code === '23505') {
        return NextResponse.json(
          {
            status: 'success',
            duplicate: true,
            message: 'Bukti transaksi sudah pernah dicatat sebelumnya.',
            dedupe_hash: dedupeHash,
          },
          { status: 200, headers: corsHeaders }
        );
      }
      throw txError;
    }

    return NextResponse.json(
      {
        status: 'success',
        message: 'Transaksi dari bukti screenshot berhasil dicatat.',
        data: newTransaction,
        vision,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[Screenshot API Error]:', error?.message || error);
    return NextResponse.json(
      {
        error: 'Terjadi kesalahan pemrosesan screenshot.',
        message: error?.message || String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
