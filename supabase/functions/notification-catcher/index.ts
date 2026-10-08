import { createClient } from 'npm:@supabase/supabase-js@2.48.1';
import { matchesAny, SENSITIVE_PATTERNS } from '../_shared/parsers/rules.ts';
import { parseLivinNotification } from '../_shared/parsers/livin.ts';
import { parseJagoNotification } from '../_shared/parsers/jago.ts';
import { normalizeText, parseReceivedAt } from '../_shared/parsers/fields.ts';

// Konfigurasi JSON untuk mapping Kunci API ke Device & Household
const API_KEYS = JSON.parse(Deno.env.get('API_KEYS_JSON') || '{}');

Deno.serve(async (req) => {
  // Hanya menerima POST, tidak perlu CORS karena request dari Macrodroid bukan Browser
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // 1. Validasi API Key
  const apiKey = req.headers.get('x-api-key') || '';
  
  if (!apiKey || typeof apiKey !== 'string') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Proteksi Lingkungan Produksi: Tolak mock key dan pastikan panjang kunci
  const isDev = Deno.env.get('ENVIRONMENT') === 'development';
  if (!isDev) {
    if (apiKey.startsWith('mock_dev_key') || apiKey.startsWith('test_random')) {
      return new Response(JSON.stringify({ error: 'Dev key not allowed in production' }), { status: 403 });
    }
    if (apiKey.length < 32) {
      return new Response(JSON.stringify({ error: 'API key too short' }), { status: 403 });
    }
  }

  // Menghindari prototype pollution dengan Object.hasOwn
  if (!Object.hasOwn(API_KEYS, apiKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const clientInfo = API_KEYS[apiKey];
  
  // 2. Baca Payload
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return new Response(JSON.stringify({ error: 'Unsupported Media Type' }), { status: 415 });
  }

  try {
    // Periksa batas Content-Length di awal
    const contentLengthHeader = req.headers.get('content-length');
    if (contentLengthHeader && parseInt(contentLengthHeader, 10) > 102400) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413 });
    }

    if (!req.body) {
      return new Response(JSON.stringify({ error: 'Payload kosong' }), { status: 400 });
    }

    // Baca stream body dengan batasan byte maksimal 100KB untuk mencegah OOM
    const MAX_BYTES = 102400;
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        if (receivedBytes > MAX_BYTES) {
          await reader.cancel();
          return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413 });
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const textBody = new TextDecoder('utf-8').decode(merged);

    const parsedBody = new URLSearchParams(textBody);
    const app_name = parsedBody.get('app_name') || '';
    let title = parsedBody.get('title') || '';
    let content = parsedBody.get('text') || '';
    const received_at_raw = parsedBody.get('received_at') || '';

    if (!app_name || (!title && !content)) {
      return new Response(JSON.stringify({ error: 'Payload tidak lengkap' }), { status: 400 });
    }

    // Pembersihan Utama: Tangkap OTP & Data Sensitif setelah normalisasi teks (cegah bypass Unicode & zero-width)
    const normalizedCombined = normalizeText(`${title} ${content}`).toLowerCase();
    const isSensitive = matchesAny(normalizedCombined, SENSITIVE_PATTERNS);
    if (isSensitive) {
      title = '[REDACTED]';
      content = '[REDACTED]';
    }

    // Potong max 2000 code point agar Unicode surrogate pair tidak rusak dan CHECK constraint DB aman
    const contentPoints = Array.from(content);
    if (contentPoints.length > 2000) {
      content = contentPoints.slice(0, 1997).join('') + '...';
    }

    // Parsing on-the-fly untuk data insight
    const receivedAtParsed = parseReceivedAt(received_at_raw);
    let received_at_epoch = null;
    if (receivedAtParsed.iso) {
      received_at_epoch = new Date(receivedAtParsed.iso).getTime();
    }

    let parsedResult: any = null;
    if (!isSensitive) {
      const lowerApp = app_name.toLowerCase();
      if (lowerApp.includes('livin')) {
        parsedResult = parseLivinNotification(title, content, received_at_raw);
      } else if (lowerApp.includes('jago')) {
        parsedResult = parseJagoNotification(title, content, received_at_raw);
      }
    }

    // 3. Simpan ke database (Fase 0)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Pastikan household ID valid fallback atau ditolak
    const householdId = clientInfo.household_id || Deno.env.get('DEFAULT_HOUSEHOLD_ID');
    if (!householdId) {
      return new Response(JSON.stringify({ error: 'Household ID tidak dikonfigurasi pada API Key' }), { status: 400 });
    }

    const { error } = await supabase
      .from('raw_notifications')
      .insert({
        device_id: clientInfo.device_id,
        household_id: householdId,
        source: 'notification',
        app_name,
        title,
        content,
        received_at_raw,
        received_at: received_at_epoch,
        server_received_at: new Date().toISOString(),
        outcome: parsedResult?.outcome,
        reasons: parsedResult?.reasons,
        parser_version: parsedResult?.parserVersion,
        sensitive: isSensitive
      });

    if (error) {
      // 23505 adalah kode unik constraint violation di Postgres
      if (error.code === '23505') {
        // Balas 200 dengan status duplicate, agar Macrodroid TIDAK menulis ke fallback offline
        return new Response(JSON.stringify({ status: 'duplicate', message: 'Notifikasi redundan (idempotent)' }), { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }
      console.error('Database insert error:', error.message);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    return new Response(JSON.stringify({ status: 'success', message: 'Notifikasi dicatat.' }), { 
      status: 201, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err: any) {
    console.error('Processing error:', err.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
