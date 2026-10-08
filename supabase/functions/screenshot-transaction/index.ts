// ==============================================================================
// SUPABASE EDGE FUNCTION: screenshot-transaction
// Menerima upload screenshot bukti transaksi perbankan via MacroDroid / curl
// Menggunakan Vision AI Google Gemini untuk ekstraksi data terstruktur
// ==============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.48.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function isConstantTimeMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function isValidApiKey(clientKey: string | null, configuredKey: string | undefined): boolean {
  if (!clientKey || !configuredKey) return false;
  const validKeys = configuredKey.split(',').map(k => k.trim()).filter(Boolean);
  return validKeys.some(expected => isConstantTimeMatch(expected, clientKey));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed. Gunakan POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 1. Validasi Keamanan: Header X-API-KEY berbasis pemetaan perangkat (API_KEYS_JSON)
  const API_KEYS = JSON.parse(Deno.env.get('API_KEYS_JSON') || '{}');
  const legacyConfiguredKey = Deno.env.get('WEBHOOK_API_KEY');
  const clientApiKey = req.headers.get('x-api-key') || req.headers.get('X-API-KEY') || '';

  if (!clientApiKey || typeof clientApiKey !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Header X-API-KEY tidak ditemukan.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Proteksi Lingkungan Produksi: Tolak dev key di produksi
  const isDev = Deno.env.get('ENVIRONMENT') === 'development';
  if (!isDev) {
    if (clientApiKey.startsWith('mock_dev_key') || clientApiKey.startsWith('test_random')) {
      return new Response(
        JSON.stringify({ error: 'Dev key not allowed in production' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  let clientInfo: { device_id: string; household_id?: string; role?: string } | null = null;
  if (Object.hasOwn(API_KEYS, clientApiKey)) {
    clientInfo = API_KEYS[clientApiKey];
  } else if (legacyConfiguredKey && isValidApiKey(clientApiKey, legacyConfiguredKey)) {
    clientInfo = { device_id: 'suami', role: 'suami' };
  }

  if (!clientInfo) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Header X-API-KEY tidak valid atau belum dikonfigurasi.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Identitas perangkat ditentukan server berdasarkan API key
  const sourceDevice = (clientInfo.role || clientInfo.device_id || 'suami').toLowerCase();

  // 2. Batas Ukuran Body: Cek Content-Length (maksimal 10MB)
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader && parseInt(contentLengthHeader, 10) > 10 * 1024 * 1024) {
    return new Response(
      JSON.stringify({ error: 'Payload gambar terlalu besar (maksimal 10MB).' }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const contentType = req.headers.get('content-type') || '';
  let imageBase64 = '';
  let mimeType = 'image/jpeg';
  let dryRun = false;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') || formData.get('image') || formData.get('screenshot');
      if (file && typeof (file as any).arrayBuffer === 'function') {
        const buf = await (file as Blob).arrayBuffer();
        const uint8 = new Uint8Array(buf);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        imageBase64 = btoa(binary);
        mimeType = (file as Blob).type || 'image/jpeg';
      }
      dryRun = formData.get('dry_run') === 'true';
    } else {
      const json = await req.json();
      imageBase64 = json.image_base64 || json.image || '';
      imageBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      mimeType = json.mime_type || 'image/jpeg';
      dryRun = Boolean(json.dry_run);
    }
  } catch (_e) {
    return new Response(
      JSON.stringify({ error: 'Gagal memproses berkas payload gambar.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!imageBase64) {
    return new Response(
      JSON.stringify({ error: 'Data gambar tidak ditemukan pada request.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 3. Hubungi Google Gemini Vision API (Kunci di header x-goog-api-key)
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY');
  if (!geminiApiKey) {
    return new Response(
      JSON.stringify({ error: 'Layanan Vision AI belum dikonfigurasi (GEMINI_API_KEY belum diset).' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let visionData: any = null;
  try {
    const prompt = `Analisis screenshot bukti transaksi perbankan/struk berikut. Berikan HANYA JSON valid:
{
  "isValidReceipt": true,
  "amount": 45000,
  "adminFee": 0,
  "totalAmount": 45000,
  "direction": "out",
  "merchant": "Nama Toko / Penerima",
  "accountName": "BCA",
  "accountType": "bank",
  "transactionDate": "2026-10-07T10:00:00+07:00",
  "referenceNumber": "12345678",
  "rawSummary": "Pembayaran berhasil di Toko via BCA"
}
Jika bukan bukti transfer sukses, set "isValidReceipt": false. Nominal integer tanpa titik.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini Vision API error HTTP', geminiRes.status, errBody);
      return new Response(
        JSON.stringify({ error: 'Layanan Vision AI sedang mengalami gangguan.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gJson = await geminiRes.json();
    const text = gJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    visionData = JSON.parse(clean);
  } catch (err: any) {
    console.error('Gagal mengekstrak struk via Gemini:', err.message);
    return new Response(
      JSON.stringify({ error: 'Layanan Vision AI gagal menganalisis gambar.' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Jika hasil parsing tidak valid, tolak tanpa insert dummy
  if (!visionData || typeof visionData !== 'object') {
    return new Response(
      JSON.stringify({ error: 'Gagal memproses data struk dari Vision AI.' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!visionData.isValidReceipt) {
    return new Response(
      JSON.stringify({ error: 'Gambar bukan bukti transaksi sukses yang valid.' }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Inisialisasi Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 5. Dedupe Hash
  const ref = (visionData.referenceNumber || '').trim();
  const rawSeed = ref.length >= 4
    ? `receipt:${sourceDevice}:${visionData.accountName.toLowerCase()}:${ref.toUpperCase()}`
    : `receipt:${sourceDevice}:${visionData.accountName.toLowerCase()}:${visionData.totalAmount}:${(visionData.transactionDate || '').slice(0, 16)}`;

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawSeed));
  const dedupeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Cek duplikasi
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('dedupe_hash', dedupeHash)
    .maybeSingle();

  if (existingTx) {
    return new Response(
      JSON.stringify({ status: 'success', duplicate: true, message: 'Bukti transaksi sudah pernah dicatat.', dedupe_hash: dedupeHash }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({ status: 'success', dry_run: true, dedupe_hash: dedupeHash, vision: visionData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Lookup household & account
  let householdId = clientInfo.household_id;
  if (!householdId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_id')
      .eq('role', sourceDevice)
      .limit(1)
      .maybeSingle();
    householdId = profile?.household_id;
  }

  if (!householdId) {
    const { data: hh } = await supabase.from('households').select('id').limit(1).maybeSingle();
    householdId = hh?.id;
  }

  if (!householdId) {
    return new Response(
      JSON.stringify({ error: 'Household belum terdaftar di database.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Temukan atau buat akun
  let accountId: string | null = null;
  const { data: acc } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', householdId)
    .eq('owner', sourceDevice)
    .ilike('name', visionData.accountName)
    .maybeSingle();

  if (acc) {
    accountId = acc.id;
  } else {
    const { data: fallbackAcc } = await supabase
      .from('accounts')
      .select('id')
      .eq('household_id', householdId)
      .eq('owner', sourceDevice)
      .limit(1)
      .maybeSingle();
    accountId = fallbackAcc?.id || null;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('transactions')
    .insert({
      household_id: householdId,
      account_id: accountId,
      amount: visionData.totalAmount || visionData.amount,
      direction: visionData.direction || 'out',
      merchant: visionData.merchant || 'Transaksi Screenshot',
      raw_notification: `[Screenshot Vision] ${visionData.rawSummary || 'Bukti transfer'} (Ref: ${ref || '-'})`,
      source_device: sourceDevice,
      transaction_date: visionData.transactionDate || new Date().toISOString(),
      status: 'pending',
      dedupe_hash: dedupeHash,
      needs_review: false,
    })
    .select('*')
    .single();

  if (insertErr) {
    console.error('Database insert error transactions:', insertErr.message);
    return new Response(
      JSON.stringify({ error: 'Gagal menyimpan transaksi ke database.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ status: 'success', data: inserted, vision: visionData }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
