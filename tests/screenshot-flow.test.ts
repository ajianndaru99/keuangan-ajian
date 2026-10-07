// ==============================================================================
// INTEGRATION TESTS: tests/screenshot-flow.test.ts
// Pengujian alur HTTP endpoint screenshot: otorisasi X-API-KEY, deduplikasi,
// dry-run, dan penolakan gambar non-transaksi
// ==============================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import {
  analyzeReceiptWithVision,
  generateScreenshotDedupeHash,
} from '../src/lib/vision/gemini.ts';

const TEST_PORT = 54324;
const TEST_API_KEY = 'rahasia_screenshot_key_123';
let server: http.Server;
const processedDedupeHashes = new Set<string>();

before(async () => {
  server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    const apiKey = req.headers['x-api-key'];
    if (apiKey !== TEST_API_KEY) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized: Header X-API-KEY tidak valid' }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const fullBuffer = Buffer.concat(chunks);

    let imageBuffer: Buffer | null = null;
    let sourceDevice = 'suami';
    let dryRun = false;

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(fullBuffer.toString('utf-8'));
        const b64 = json.image_base64 || json.image;
        if (!b64) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Field image_base64 wajib diisi' }));
          return;
        }
        imageBuffer = Buffer.from(b64, 'base64');
        if (json.source_device) {
          const dev = String(json.source_device).toLowerCase();
          if (!['suami', 'istri'].includes(dev)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Field 'source_device' wajib bernilai 'suami' atau 'istri'" }));
            return;
          }
          sourceDevice = dev;
        }
        dryRun = Boolean(json.dry_run);
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'JSON tidak valid' }));
        return;
      }
    } else {
      imageBuffer = fullBuffer;
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Berkas gambar kosong' }));
      return;
    }

    const vision = await analyzeReceiptWithVision(imageBuffer, 'image/jpeg');

    if (!vision.isValidReceipt) {
      res.statusCode = 422;
      res.end(JSON.stringify({ error: 'Gambar bukan bukti transaksi valid', details: vision }));
      return;
    }

    const dedupeHash = await generateScreenshotDedupeHash(
      sourceDevice,
      vision.accountName,
      vision.referenceNumber,
      vision.totalAmount,
      vision.transactionDate
    );

    if (processedDedupeHashes.has(dedupeHash)) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: 'success',
          duplicate: true,
          message: 'Bukti transaksi sudah pernah dicatat.',
          dedupe_hash: dedupeHash,
        })
      );
      return;
    }

    if (!dryRun) {
      processedDedupeHashes.add(dedupeHash);
    }

    res.statusCode = dryRun ? 200 : 201;
    res.end(
      JSON.stringify({
        status: 'success',
        dry_run: dryRun,
        dedupe_hash: dedupeHash,
        data: {
          merchant: vision.merchant,
          amount: vision.totalAmount,
          account: vision.accountName,
          source_device: sourceDevice,
        },
      })
    );
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

describe('Screenshot HTTP Flow & Security Tests', () => {
  test('Menolak request tanpa X-API-KEY dengan HTTP 401', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: 'abc' }),
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.includes('Unauthorized'));
  });

  test('Menolak source_device yang tidak valid dengan HTTP 400', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify({
        image_base64: Buffer.from('VALID_IMAGE').toString('base64'),
        source_device: 'anak',
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('source_device'));
  });

  test('Menolak gambar non-transaksi dengan HTTP 422 Unprocessable Entity', async () => {
    const nonReceiptPayload = Buffer.from('TEST_NON_RECEIPT_IMAGE').toString('base64');
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify({
        image_base64: nonReceiptPayload,
        source_device: 'suami',
      }),
    });
    assert.equal(res.status, 422);
    const data = await res.json();
    assert.equal(data.details.isValidReceipt, false);
  });

  test('Mode dry-run memproses struk dengan HTTP 200 tanpa menyimpan dedupe hash', async () => {
    const validPayload = Buffer.from('VALID_DRYRUN_RECEIPT').toString('base64');
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify({
        image_base64: validPayload,
        source_device: 'suami',
        dry_run: true,
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.dry_run, true);
    assert.ok(data.dedupe_hash);
  });

  test('Menyimpan screenshot valid dengan HTTP 201', async () => {
    const validPayload = Buffer.from('UNIQUE_RECEIPT_1').toString('base64');
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify({
        image_base64: validPayload,
        source_device: 'istri',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.equal(data.data.source_device, 'istri');
  });

  test('Deduplikasi: Screenshot kedua yang identik ditolak dengan HTTP 200 duplicate: true', async () => {
    const validPayload = Buffer.from('UNIQUE_RECEIPT_1').toString('base64');
    const res = await fetch(`http://localhost:${TEST_PORT}/api/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify({
        image_base64: validPayload,
        source_device: 'istri',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.duplicate, true);
    assert.ok(data.message.includes('sudah pernah dicatat'));
  });
});
