// ==============================================================================
// SUPABASE EDGE FUNCTION: webhook-transaction
// Menerima HTTP POST notifikasi dari MacroDroid Android (Suami & Istri)
// ==============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.48.1';
import { parseNotification } from './parsers/index.ts';
import { generateDedupeHash } from './parsers/utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req: Request) => {
  // Tangani request OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 1. Validasi HTTP Method (hanya izinkan POST)
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed. Gunakan POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Validasi Keamanan: Header X-API-KEY
  const expectedApiKey = Deno.env.get('WEBHOOK_API_KEY');
  const clientApiKey = req.headers.get('x-api-key') || req.headers.get('X-API-KEY');

  if (!expectedApiKey || clientApiKey !== expectedApiKey) {
    return new Response(
      JSON.stringify({ 
        error: 'Unauthorized: Header X-API-KEY tidak valid atau belum dikonfigurasi di secrets.' 
      }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3. Parse JSON Body dari MacroDroid
  let body: {
    source_device?: string;
    app_name?: string;
    raw_text?: string;
    timestamp?: string;
    household_id?: string;
  };

  try {
    body = await req.json();
  } catch (_e) {
    return new Response(
      JSON.stringify({ error: 'Format JSON body tidak valid.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { source_device, app_name, raw_text, timestamp } = body;

  // Validasi field wajib
  if (!source_device || !['suami', 'istri'].includes(source_device.toLowerCase())) {
    return new Response(
      JSON.stringify({ error: "Field 'source_device' wajib bernilai 'suami' atau 'istri'." }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!app_name || typeof raw_text !== 'string') {
    return new Response(
      JSON.stringify({ error: "Field 'app_name' dan 'raw_text' wajib diisi." }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Inisialisasi Supabase Service Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Konfigurasi environment SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terpasang.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 5. Resolusi Household ID
    let householdId = body.household_id || Deno.env.get('DEFAULT_HOUSEHOLD_ID');

    if (!householdId) {
      // Ambil household pertama jika tidak ditentukan
      const { data: householdData, error: hhErr } = await supabase
        .from('households')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (hhErr) throw hhErr;

      if (!householdData) {
        // Jika belum ada household sama sekali di database, buatkan secara otomatis
        const { data: newHh, error: createHhErr } = await supabase
          .from('households')
          .insert({ name: 'Keluarga Utama' })
          .select('id')
          .single();
        if (createHhErr) throw createHhErr;
        householdId = newHh.id;
      } else {
        householdId = householdData.id;
      }
    }

    // 6. Parsing notifikasi transaksi
    const parseResult = parseNotification(app_name, raw_text);
    const normalizedDevice = source_device.toLowerCase() as 'suami' | 'istri';
    const targetAccountName = parseResult.accountName || app_name;

    // 7. Mapping app_name -> account_id berdasarkan owner (source_device) + nama akun
    const { data: existingAccount, error: accErr } = await supabase
      .from('accounts')
      .select('id, household_id, name, owner')
      .eq('household_id', householdId)
      .eq('owner', normalizedDevice)
      .ilike('name', targetAccountName)
      .maybeSingle();

    if (accErr) throw accErr;

    let accountId: string;

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      // Auto-create akun jika belum terdaftar agar transaksi tidak hilang
      const isBank = ['bca', 'mandiri', 'bri', 'bni', 'cimb'].includes(targetAccountName.toLowerCase());
      const accountType = isBank ? 'bank' : 'ewallet';

      const { data: newAccount, error: createAccErr } = await supabase
        .from('accounts')
        .insert({
          household_id: householdId,
          owner: normalizedDevice,
          name: targetAccountName,
          type: accountType,
          balance: 0,
          initial_balance: 0,
          is_active: true
        })
        .select('id')
        .single();

      if (createAccErr) throw createAccErr;
      accountId = newAccount.id;
    }

    // 8. Tentukan transaction_date (dari notifikasi atau saat ini)
    let transactionDate: string;
    if (timestamp) {
      const parsedTime = new Date(timestamp);
      transactionDate = isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();
    } else {
      transactionDate = new Date().toISOString();
    }

    // 9. Generate Dedupe Hash (accountId + amount + roundToMinute + merchant + direction)
    const dedupeHash = await generateDedupeHash(
      accountId,
      parseResult.amount,
      transactionDate,
      parseResult.merchant,
      parseResult.direction
    );

    // 10. Cek duplikasi di database
    const { data: existingTx, error: dupCheckErr } = await supabase
      .from('transactions')
      .select('id')
      .eq('dedupe_hash', dedupeHash)
      .maybeSingle();

    if (dupCheckErr) throw dupCheckErr;

    if (existingTx) {
      // Duplikasi terdeteksi: balas HTTP 200 tanpa insert
      return new Response(
        JSON.stringify({
          status: 'success',
          duplicate: true,
          message: 'Transaksi ganda diabaikan (sudah pernah tercatat).',
          dedupe_hash: dedupeHash
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 11. SELALU simpan raw_notification apa adanya. Jika parsing gagal, amount 0 + needs_review: true
    const { data: insertedTransaction, error: insertErr } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        account_id: accountId,
        category_id: null, // Manusia yang akan mengategorikan di Inbox (Fase 2)
        amount: parseResult.amount,
        direction: parseResult.direction,
        merchant: parseResult.merchant,
        raw_notification: raw_text,
        source_device: normalizedDevice,
        transaction_date: transactionDate,
        status: 'pending',
        dedupe_hash: dedupeHash,
        needs_review: !parseResult.parsedSuccessfully
      })
      .select('*')
      .single();

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({
        status: 'success',
        duplicate: false,
        message: 'Transaksi berhasil disimpan ke Inbox.',
        transaction: insertedTransaction,
        parsed_info: {
          nominal: parseResult.amount,
          arah: parseResult.direction,
          merchant: parseResult.merchant,
          akun: targetAccountName,
          status_parsing: parseResult.parsedSuccessfully ? 'sukses' : 'perlu_review_manual',
          notes: parseResult.notes
        }
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: `Internal Server Error: ${errorMsg}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
