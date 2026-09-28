// ==============================================================================
// INTEGRATION TESTS: tests/webhook-flow.test.ts
// Pengujian alur HTTP webhook, validasi X-API-KEY, deduplikasi, dan fallback
// ==============================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseNotification, generateDedupeHash } from '../supabase/functions/webhook-transaction/parsers/index.ts';

const TEST_PORT = 54322;
const TEST_API_KEY = 'test_secret_key_777';
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
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid X-API-KEY' }));
      return;
    }

    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);

    const { source_device, app_name, raw_text, timestamp } = body;
    if (!source_device || !['suami', 'istri'].includes(source_device.toLowerCase())) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid source_device' }));
      return;
    }

    const parseResult = parseNotification(app_name, raw_text);
    const txDate = timestamp || new Date().toISOString();
    const accountId = `acc-${source_device}-${parseResult.accountName}`;

    const dedupeHash = await generateDedupeHash(
      accountId,
      parseResult.amount,
      txDate,
      parseResult.merchant,
      parseResult.direction
    );

    if (processedDedupeHashes.has(dedupeHash)) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        status: 'success',
        duplicate: true,
        message: 'Duplicate transaction ignored'
      }));
      return;
    }

    processedDedupeHashes.add(dedupeHash);

    res.statusCode = 201;
    res.end(JSON.stringify({
      status: 'success',
      duplicate: false,
      transaction: {
        account_id: accountId,
        amount: parseResult.amount,
        direction: parseResult.direction,
        merchant: parseResult.merchant,
        raw_notification: raw_text,
        source_device,
        needs_review: !parseResult.parsedSuccessfully
      }
    }));
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Webhook HTTP Flow & Security Tests', () => {
  const baseUrl = `http://localhost:${TEST_PORT}/webhook`;

  test('Menolak request tanpa X-API-KEY dengan HTTP 401', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_device: 'suami', app_name: 'BCA', raw_text: 'test' })
    });
    assert.equal(res.status, 401);
  });

  test('Menolak request dengan X-API-KEY yang salah dengan HTTP 401', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': 'kunci_salah' },
      body: JSON.stringify({ source_device: 'suami', app_name: 'BCA', raw_text: 'test' })
    });
    assert.equal(res.status, 401);
  });

  test('Menolak source_device yang bukan suami/istri dengan HTTP 400', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': TEST_API_KEY },
      body: JSON.stringify({ source_device: 'tetangga', app_name: 'BCA', raw_text: 'test' })
    });
    assert.equal(res.status, 400);
  });

  test('Berhasil menerima transaksi valid dengan HTTP 201', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': TEST_API_KEY },
      body: JSON.stringify({
        source_device: 'suami',
        app_name: 'm-BCA',
        raw_text: 'QRIS BCA: Pembayaran Rp 45.000 di KOPI KENANGAN BERHASIL tgl 28/09/26',
        timestamp: '2026-09-28T12:30:00Z'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.equal(data.duplicate, false);
    assert.equal(data.transaction.amount, 45000);
    assert.equal(data.transaction.direction, 'out');
    assert.equal(data.transaction.merchant, 'KOPI KENANGAN');
  });

  test('Deduplikasi: Transaksi kedua dengan konten dan menit sama dibalas HTTP 200 duplicate: true', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': TEST_API_KEY },
      body: JSON.stringify({
        source_device: 'suami',
        app_name: 'm-BCA',
        raw_text: 'QRIS BCA: Pembayaran Rp 45.000 di KOPI KENANGAN BERHASIL tgl 28/09/26',
        timestamp: '2026-09-28T12:30:15Z' // Menit sama dengan tes sebelumnya (12:30)
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'success');
    assert.equal(data.duplicate, true);
  });

  test('Gagal parsing nominal tetap disimpan (amount: 0, needs_review: true)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': TEST_API_KEY },
      body: JSON.stringify({
        source_device: 'istri',
        app_name: 'ShopeePay',
        raw_text: 'Voucher diskon 90% siap dipakai di toko favoritmu!',
        timestamp: '2026-09-28T12:30:00Z'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.transaction.amount, 0);
    assert.equal(data.transaction.needs_review, true);
    assert.equal(data.transaction.raw_notification, 'Voucher diskon 90% siap dipakai di toko favoritmu!');
  });
});
