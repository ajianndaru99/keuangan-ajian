// ==============================================================================
// MOCK SERVER: scripts/serve-webhook-mock.ts
// Server lokal untuk menguji webhook & perintah curl tanpa perlu deploy Supabase
// Jalankan via: npm run serve:mock
// ==============================================================================

import http from 'node:http';
import { parseNotification, generateDedupeHash } from '../supabase/functions/webhook-transaction/parsers/index.ts';

const PORT = 54321;
const WEBHOOK_API_KEY = process.env.WEBHOOK_API_KEY || 'kunci_rahasia_keluarga_123';

// Cache memory untuk simulasi deduplikasi
const seenHashes = new Set<string>();

const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, content-type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Hanya layani endpoint webhook
  if (url.pathname !== '/functions/v1/webhook-transaction' && url.pathname !== '/webhook-transaction') {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan. Gunakan /functions/v1/webhook-transaction' }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed. Gunakan POST.' }));
    return;
  }

  // Validasi X-API-KEY
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== WEBHOOK_API_KEY) {
    res.statusCode = 401;
    res.end(JSON.stringify({ 
      error: 'Unauthorized: Header X-API-KEY salah atau belum dikirim.',
      hint: `Kirimkan header 'X-API-KEY: ${WEBHOOK_API_KEY}'`
    }));
    return;
  }

  // Baca body
  let rawBody = '';
  for await (const chunk of req) {
    rawBody += chunk;
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { source_device, app_name, raw_text, timestamp } = body;

  if (!source_device || !['suami', 'istri'].includes(source_device.toLowerCase())) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "source_device wajib bernilai 'suami' atau 'istri'" }));
    return;
  }

  if (!app_name || typeof raw_text !== 'string') {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'app_name dan raw_text wajib diisi' }));
    return;
  }

  // Parsing
  const parseResult = parseNotification(app_name, raw_text);
  const txDate = timestamp ? new Date(timestamp).toISOString() : new Date().toISOString();
  const mockAccountId = `mock-acc-${source_device}-${parseResult.accountName.toLowerCase()}`;

  const dedupeHash = await generateDedupeHash(
    mockAccountId,
    parseResult.amount,
    txDate,
    parseResult.merchant,
    parseResult.direction
  );

  // Cek dedupe
  if (seenHashes.has(dedupeHash)) {
    res.statusCode = 200;
    res.end(JSON.stringify({
      status: 'success',
      duplicate: true,
      message: 'Transaksi ganda diabaikan (sudah pernah tercatat di menit yang sama).',
      dedupe_hash: dedupeHash
    }));
    return;
  }

  seenHashes.add(dedupeHash);

  res.statusCode = 201;
  res.end(JSON.stringify({
    status: 'success',
    duplicate: false,
    message: 'Transaksi berhasil disimpan ke Inbox (Mock DB).',
    transaction: {
      id: `tx-${Date.now()}`,
      household_id: '00000000-0000-0000-0000-000000000001',
      account_id: mockAccountId,
      amount: parseResult.amount,
      direction: parseResult.direction,
      merchant: parseResult.merchant,
      raw_notification: raw_text,
      source_device: source_device.toLowerCase(),
      transaction_date: txDate,
      status: 'pending',
      dedupe_hash: dedupeHash,
      needs_review: !parseResult.parsedSuccessfully
    },
    parsed_info: {
      nominal: parseResult.amount,
      arah: parseResult.direction,
      merchant: parseResult.merchant,
      akun: parseResult.accountName,
      status_parsing: parseResult.parsedSuccessfully ? 'sukses' : 'perlu_review_manual',
      notes: parseResult.notes
    }
  }));
});

server.listen(PORT, () => {
  console.log(`[MOCK WEBHOOK SERVER] Berjalan di http://localhost:${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/functions/v1/webhook-transaction`);
  console.log(`Header X-API-KEY: ${WEBHOOK_API_KEY}`);
});
