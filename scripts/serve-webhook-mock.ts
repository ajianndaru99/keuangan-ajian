// ==============================================================================
// MOCK SERVER: scripts/serve-webhook-mock.ts
// Server lokal untuk menguji Webhook (Screenshot & Text Notification)
// Jalankan via: npm run serve:mock
// ==============================================================================

import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import { URLSearchParams } from 'node:url';

import { parseLivinNotification } from '../supabase/functions/_shared/parsers/livin.ts';
import { parseJagoNotification } from '../supabase/functions/_shared/parsers/jago.ts';
import { normalizeText, parseReceivedAt } from '../supabase/functions/_shared/parsers/fields.ts';
import { matchesAny, SENSITIVE_PATTERNS } from '../supabase/functions/_shared/parsers/rules.ts';

// Dynamic import vision helper agar server tetap dapat start meskipun arsip diekstrak tanpa src/
let visionHelper: {
  analyzeReceiptWithVision: (imageBuffer: Buffer | Uint8Array, mimeType?: string) => Promise<any>;
  generateScreenshotDedupeHash: (
    sourceDevice: string,
    accountName: string,
    referenceNumber: string,
    totalAmount: number,
    transactionDate: string
  ) => Promise<string>;
} = {
  analyzeReceiptWithVision: async () => ({
    isValidReceipt: true,
    amount: 50000,
    adminFee: 0,
    totalAmount: 50000,
    direction: 'out',
    merchant: 'Merchant Mock (Standalone)',
    accountName: 'BCA',
    accountType: 'bank',
    transactionDate: new Date().toISOString(),
    referenceNumber: 'MOCK-' + Date.now().toString().slice(-6),
    rawSummary: 'Bukti transaksi diterima mock server lokal',
  }),
  generateScreenshotDedupeHash: async (device, account, ref, amount, date) => {
    const raw = ref && ref.length >= 4
      ? `receipt:${device}:${account.toLowerCase()}:${ref.toUpperCase()}`
      : `receipt:${device}:${account.toLowerCase()}:${amount}:${(date || '').slice(0, 16)}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  },
};

// Coba muat modul Vision Gemini asli jika ada
try {
  const gemini = await import('../src/lib/vision/gemini.ts');
  visionHelper = {
    analyzeReceiptWithVision: gemini.analyzeReceiptWithVision,
    generateScreenshotDedupeHash: gemini.generateScreenshotDedupeHash,
  };
} catch (_err) {
  // Gunakan modul mock mandiri jika modul src/lib/vision/gemini.ts tidak tersedia
}

const PORT = 54322; // Port 54322 agar tidak bentrok dengan Supabase lokal
// Bind ke 0.0.0.0 agar dapat dijangkau oleh HP di jaringan Wi-Fi lokal
const HOST = process.env.HOST || '0.0.0.0';

// Simulasi Kunci API (Mewakili identitas perangkat)
// Sinkron dengan dokumen setup 02-Setup-Macrodroid.md dan dev keys
const API_KEYS: Record<string, { device_id: string; household_id: string; role: string }> = {
  'mock_dev_key_suami': { device_id: 'hp_suami_01', household_id: '00000000-0000-0000-0000-000000000000', role: 'suami' },
  'mock_dev_key_istri': { device_id: 'hp_istri_02', household_id: '00000000-0000-0000-0000-000000000000', role: 'istri' },
  'test_random_key_abc123_suami_x9y': { device_id: 'hp_suami_01', household_id: '00000000-0000-0000-0000-000000000000', role: 'suami' },
  'test_random_key_def456_istri_z8w': { device_id: 'hp_istri_02', household_id: '00000000-0000-0000-0000-000000000000', role: 'istri' },
};

// Cache memory
const seenHashes = new Set<string>();
const rawNotificationsDB: any[] = []; // Simulasi tabel raw_notifications (Fase 0)

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Validasi Endpoint
  if (
    url.pathname !== '/api/screenshot' &&
    url.pathname !== '/api/notification' &&
    url.pathname !== '/functions/v1/screenshot-transaction' &&
    url.pathname !== '/functions/v1/notification-catcher'
  ) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan.' }));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed. Gunakan POST.' }));
    return;
  }

  // Validasi API Key
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey || !Object.hasOwn(API_KEYS, apiKey)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: 'Unauthorized: X-API-KEY invalid.' }));
    return;
  }
  const clientInfo = API_KEYS[apiKey];

  const contentType = req.headers['content-type'] || '';
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  // --------------------------------------------------------------------------
  // HANDLER: /api/notification (Teks dari MacroDroid - FASE 0)
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/notification' || url.pathname.endsWith('notification-catcher')) {
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      res.statusCode = 415;
      res.end(JSON.stringify({ error: 'Unsupported Media Type. Gunakan application/x-www-form-urlencoded' }));
      return;
    }
    
    // Periksa batas Body Content-Length di awal (100KB limit)
    if (contentLength > 102400) {
      res.statusCode = 413;
      res.end(JSON.stringify({ error: 'Payload too large (maksimal 100KB)' }));
      return;
    }

    // Baca stream body dengan penghitung byte maksimal 100KB
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    const MAX_NOTIFICATION_BYTES = 102400;

    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytesRead += buf.length;
      if (bytesRead > MAX_NOTIFICATION_BYTES) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: 'Payload too large (maksimal 100KB)' }));
        return;
      }
      chunks.push(buf);
    }
    const fullBuffer = Buffer.concat(chunks);

    try {
      const parsedBody = new URLSearchParams(fullBuffer.toString('utf-8'));
      const app_name = parsedBody.get('app_name') || '';
      let title = parsedBody.get('title') || '';
      let text = parsedBody.get('text') || '';
      const received_at_raw = parsedBody.get('received_at') || '';

      if (!app_name || (!title && !text)) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Payload tidak lengkap.' }));
        return;
      }

      // Deteksi Sensitive Data (OTP) setelah normalisasi teks untuk mencegah bypass zero-width/full-width
      const normalizedCombined = normalizeText(`${title} ${text}`).toLowerCase();
      const isSensitive = matchesAny(normalizedCombined, SENSITIVE_PATTERNS);
      let contentToSave = text;
      let titleToSave = title;
      
      if (isSensitive) {
        contentToSave = '[REDACTED]';
        titleToSave = '[REDACTED]';
      }

      // Potong ke 2000 code point Unicode agar aman dan tidak memotong surrogate pair
      const contentPoints = Array.from(contentToSave);
      if (contentPoints.length > 2000) {
        contentToSave = contentPoints.slice(0, 1997).join('') + '...';
      }

      const receivedAtParsed = parseReceivedAt(received_at_raw);
      let received_at_epoch = null;
      if (receivedAtParsed.iso) {
        received_at_epoch = new Date(receivedAtParsed.iso).getTime();
      }

      // Coba Parse secara on-the-fly untuk memantau performa parser (Kirim raw string received_at_raw)
      let parsedResult: any = null;
      if (!isSensitive) {
        const lowerApp = app_name.toLowerCase();
        if (lowerApp.includes('livin')) {
          parsedResult = parseLivinNotification(titleToSave, contentToSave, received_at_raw);
        } else if (lowerApp.includes('jago')) {
          parsedResult = parseJagoNotification(titleToSave, contentToSave, received_at_raw);
        }
      }

      // Idempotency: Menggunakan MD5 title + newline + content sesuai skema DB
      const contentHash = crypto.createHash('md5').update(`${titleToSave}\n${contentToSave}`).digest('hex');
      const isDuplicate = rawNotificationsDB.some(n => 
        n.device_id === clientInfo.device_id &&
        n.app_name === app_name &&
        n.received_at_raw === received_at_raw &&
        n.content_hash === contentHash
      );

      if (isDuplicate) {
        // Harus mengembalikan 200 agar MacroDroid tidak retry ke CSV fallback
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'duplicate', message: 'Notifikasi sudah ada (Idempotent).' }));
        return;
      }

      // FASE 0: Simpan data mentah ke "Database"
      const newNotification = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7),
        device_id: clientInfo.device_id,
        household_id: clientInfo.household_id,
        app_name,
        title: titleToSave,
        content: contentToSave,
        received_at_raw,
        received_at: received_at_epoch,
        server_received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        outcome: parsedResult?.outcome,
        reasons: parsedResult?.reasons,
        parser_version: parsedResult?.parserVersion,
        sensitive: isSensitive,
        content_hash: contentHash,
      };

      rawNotificationsDB.push(newNotification);
      
      console.log(`[Notifikasi Baru - FASE 0] dari ${clientInfo.device_id} (${app_name}) | Sensitive: ${isSensitive} | Status: Success`);

      res.statusCode = 201;
      res.end(JSON.stringify({
        status: 'success',
        message: 'Notifikasi berhasil dicatat (Fase 0).',
        data: { id: newNotification.id, sensitive: isSensitive }
      }));
    } catch (err: any) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Gagal memproses form-urlencoded: ' + err.message }));
    }
    return;
  }

  // --------------------------------------------------------------------------
  // HANDLER: /api/screenshot (Gambar bukti transfer)
  // --------------------------------------------------------------------------
  if (url.pathname === '/api/screenshot' || url.pathname.includes('screenshot-transaction')) {
    // Batas payload gambar maksimal 10MB
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    if (contentLength > MAX_IMAGE_BYTES) {
      res.statusCode = 413;
      res.end(JSON.stringify({ error: 'Payload gambar terlalu besar (maksimal 10MB).' }));
      return;
    }

    const chunks: Buffer[] = [];
    let bytesRead = 0;
    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytesRead += buf.length;
      if (bytesRead > MAX_IMAGE_BYTES) {
        res.statusCode = 413;
        res.end(JSON.stringify({ error: 'Payload gambar terlalu besar (maksimal 10MB).' }));
        return;
      }
      chunks.push(buf);
    }
    const fullBuffer = Buffer.concat(chunks);

    let imageBuffer: Buffer | null = null;
    // Identitas perangkat ditentukan server dari API key
    let sourceDevice = clientInfo.role || clientInfo.device_id;
    let dryRun = false;

    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(fullBuffer.toString('utf-8'));
        const b64 = json.image_base64 || json.image || '';
        imageBuffer = Buffer.from(b64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ''), 'base64');
        dryRun = Boolean(json.dry_run);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Format JSON body tidak valid.' }));
        return;
      }
    } else {
      imageBuffer = fullBuffer; // raw bytes
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Payload berkas gambar kosong.' }));
      return;
    }

    try {
      const vision = await visionHelper.analyzeReceiptWithVision(imageBuffer, 'image/jpeg');
      if (!vision.isValidReceipt) {
        res.statusCode = 422;
        res.end(JSON.stringify({ error: 'Bukan bukti transaksi valid.', details: vision }));
        return;
      }

      const dedupeHash = await visionHelper.generateScreenshotDedupeHash(
        sourceDevice, vision.accountName, vision.referenceNumber, vision.totalAmount, vision.transactionDate
      );

      if (seenHashes.has(dedupeHash)) {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'success', duplicate: true, dedupe_hash: dedupeHash }));
        return;
      }

      if (!dryRun) seenHashes.add(dedupeHash);

      res.statusCode = dryRun ? 200 : 201;
      res.end(JSON.stringify({
        status: 'success', dry_run: dryRun, dedupe_hash: dedupeHash,
        transaction: {
          merchant: vision.merchant, amount: vision.totalAmount, account: vision.accountName,
          source_device: sourceDevice, transaction_date: vision.transactionDate,
          direction: vision.direction, reference: vision.referenceNumber,
        },
      }));
    } catch (err: any) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Vision AI gagal: ' + err.message }));
    }
  }
});

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

server.listen(PORT, HOST, () => {
  const ips = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🚀 Mock Webhook Server aktif di port ${PORT}`);
  console.log(`🏠 Akses Lokal    : http://127.0.0.1:${PORT}`);
  for (const ip of ips) {
    console.log(`📱 Akses dari HP : http://${ip}:${PORT}/api/notification`);
  }
  console.log(`🔑 Kunci Dev Suami : mock_dev_key_suami`);
  console.log(`🔑 Kunci Dev Istri : mock_dev_key_istri`);
  console.log(`======================================================\n`);
});
