// ==============================================================================
// MOCK SERVER: scripts/serve-webhook-mock.ts
// Server lokal untuk menguji Screenshot Webhook & curl tanpa deploy Supabase
// Jalankan via: npm run serve:mock
// ==============================================================================

import http from 'node:http';
import {
  analyzeReceiptWithVision,
  generateScreenshotDedupeHash,
  suggestCategoryForMerchant,
} from '../src/lib/vision/gemini.ts';

const PORT = 54321;
const WEBHOOK_API_KEY = process.env.WEBHOOK_API_KEY || 'mock_dev_key_only';

// Cache memory untuk simulasi deduplikasi
const seenHashes = new Set<string>();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, content-type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Layani endpoint screenshot-transaction atau /api/screenshot
  if (
    url.pathname !== '/functions/v1/screenshot-transaction' &&
    url.pathname !== '/screenshot-transaction' &&
    url.pathname !== '/api/screenshot'
  ) {
    res.statusCode = 404;
    res.end(
      JSON.stringify({
        error: 'Endpoint tidak ditemukan. Gunakan /functions/v1/screenshot-transaction atau /api/screenshot',
      })
    );
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
    res.end(
      JSON.stringify({
        error: 'Unauthorized: Header X-API-KEY salah atau belum dikirim.',
        hint: `Kirimkan header 'X-API-KEY: ${WEBHOOK_API_KEY}'`,
      })
    );
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const fullBuffer = Buffer.concat(chunks);

  const contentType = req.headers['content-type'] || '';
  let imageBuffer: Buffer | null = null;
  let sourceDevice = 'suami';
  let dryRun = false;

  if (contentType.includes('application/json')) {
    try {
      const json = JSON.parse(fullBuffer.toString('utf-8'));
      const b64 = json.image_base64 || json.image || '';
      imageBuffer = Buffer.from(b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''), 'base64');
      if (json.source_device) sourceDevice = String(json.source_device).toLowerCase();
      dryRun = Boolean(json.dry_run);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Format JSON body tidak valid.' }));
      return;
    }
  } else {
    // Anggap raw image buffer
    imageBuffer = fullBuffer;
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Payload berkas gambar kosong.' }));
    return;
  }

  try {
    const vision = await analyzeReceiptWithVision(imageBuffer, 'image/jpeg');

    if (!vision.isValidReceipt) {
      res.statusCode = 422;
      res.end(
        JSON.stringify({
          error: 'Gambar bukan bukti transaksi sukses yang valid.',
          details: vision,
        })
      );
      return;
    }

    const dedupeHash = await generateScreenshotDedupeHash(
      sourceDevice,
      vision.accountName,
      vision.referenceNumber,
      vision.totalAmount,
      vision.transactionDate
    );

    if (seenHashes.has(dedupeHash)) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'success',
          duplicate: true,
          message: 'Bukti transaksi sudah pernah dicatat sebelumnya.',
          dedupe_hash: dedupeHash,
        })
      );
      return;
    }

    if (!dryRun) {
      seenHashes.add(dedupeHash);
    }

    res.statusCode = dryRun ? 200 : 201;
    res.end(
      JSON.stringify({
        status: 'success',
        dry_run: dryRun,
        message: 'Transaksi berhasil dianalisis via Vision AI.',
        dedupe_hash: dedupeHash,
        transaction: {
          merchant: vision.merchant,
          amount: vision.totalAmount,
          account: vision.accountName,
          source_device: sourceDevice,
          transaction_date: vision.transactionDate,
          direction: vision.direction,
          reference: vision.referenceNumber,
        },
      })
    );
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Gagal memproses Vision AI: ' + err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Mock Screenshot Ingestion Server aktif di port ${PORT}`);
  console.log(`📡 URL Endpoint: http://localhost:${PORT}/api/screenshot`);
  console.log(`🔑 WEBHOOK_API_KEY: ${WEBHOOK_API_KEY}`);
  console.log(`======================================================\n`);
  console.log(`Contoh pengujian dengan curl:`);
  console.log(`curl -X POST http://localhost:${PORT}/api/screenshot \\`);
  console.log(`  -H "X-API-KEY: ${WEBHOOK_API_KEY}" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"image_base64":"...", "source_device":"suami"}'\n`);
});
