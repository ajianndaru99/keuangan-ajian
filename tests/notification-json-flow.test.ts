// ==============================================================================
// INTEGRATION TESTS: tests/notification-json-flow.test.ts
// Pengujian alur Webhook Notifikasi: format JSON SmsForwarder, sanitasi OTP,
// otorisasi X-API-KEY, dan kompatibilitas x-www-form-urlencoded
// ==============================================================================

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { normalizeText } from '../supabase/functions/_shared/parsers/fields.ts';
import { matchesAny, SENSITIVE_PATTERNS } from '../supabase/functions/_shared/parsers/rules.ts';

const TEST_PORT = 54325;
const TEST_API_KEY = 'mock_dev_key_suami';
let server: http.Server;
const recordedNotifications: any[] = [];

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
      res.end(JSON.stringify({ error: 'Unauthorized: X-API-KEY invalid' }));
      return;
    }

    const contentType = req.headers['content-type'] || '';
    const isJson = contentType.includes('application/json');
    const isForm = contentType.includes('application/x-www-form-urlencoded');

    if (!isJson && !isForm) {
      res.statusCode = 415;
      res.end(JSON.stringify({ error: 'Unsupported Media Type' }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const fullBuffer = Buffer.concat(chunks);
    const textBody = fullBuffer.toString('utf-8');

    let app_name = '';
    let title = '';
    let content = '';
    let received_at_raw = '';

    if (isJson) {
      try {
        const jsonBody = JSON.parse(textBody);
        app_name = String(jsonBody.app_name || jsonBody.packageName || '').trim();
        title = String(jsonBody.title || '').trim();
        content = String(jsonBody.content || jsonBody.text || '').trim();
        received_at_raw = jsonBody.received_at !== undefined ? String(jsonBody.received_at) : '';
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Format JSON tidak valid' }));
        return;
      }
    } else {
      const parsedBody = new URLSearchParams(textBody);
      app_name = parsedBody.get('app_name') || '';
      title = parsedBody.get('title') || '';
      content = parsedBody.get('content') || parsedBody.get('text') || '';
      received_at_raw = parsedBody.get('received_at') || '';
    }

    if (!app_name || (!title && !content)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Payload tidak lengkap' }));
      return;
    }

    // Normalisasi & Deteksi OTP / Data Sensitif
    const normalizedCombined = normalizeText(`${title} ${content}`).toLowerCase();
    const isSensitive = matchesAny(normalizedCombined, SENSITIVE_PATTERNS);
    let contentToSave = content;
    let titleToSave = title;

    if (isSensitive) {
      contentToSave = '[REDACTED]';
      titleToSave = '[REDACTED]';
    }

    const savedRecord = {
      app_name,
      title: titleToSave,
      content: contentToSave,
      received_at_raw,
      isSensitive,
    };
    recordedNotifications.push(savedRecord);

    res.statusCode = 201;
    res.end(JSON.stringify({ status: 'success', data: savedRecord }));
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('SmsForwarder Webhook JSON Ingestion & Security', () => {
  test('Menolak permintaan tanpa header X-API-KEY yang valid (401)', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': 'kunci_palsu',
      },
      body: JSON.stringify({
        app_name: 'com.jago.bank',
        title: 'Kantong Utama',
        content: 'Kamu menerima Rp 150.000',
      }),
    });

    assert.equal(res.status, 401);
  });

  test('Menolak tipe konten selain JSON atau URL-encoded dengan HTTP 415', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'X-API-KEY': TEST_API_KEY,
      },
      body: 'app_name=com.jago.bank',
    });

    assert.equal(res.status, 415);
  });

  test('Menerima payload JSON standar SmsForwarder dengan HTTP 201', async () => {
    const payload = {
      app_name: 'id.co.bankmandiri.livin',
      title: 'Livin Mandiri',
      content: 'Pembayaran QRIS Rp 45.000 ke Kopi Kenangan berhasil. Ref: 202610129988',
      received_at: 1760248800000,
    };

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.app_name, 'id.co.bankmandiri.livin');
    assert.match(body.data.content, /Kopi Kenangan/);
  });

  test('Mendukung alias packageName dan text jika disediakan', async () => {
    const payload = {
      packageName: 'com.bca',
      title: 'm-BCA',
      text: 'm-Transfer berhasil ke 1234567890 Rp 250.000',
      received_at: '2026-10-12T09:30:00Z',
    };

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.app_name, 'com.bca');
    assert.match(body.data.content, /250\.000/);
  });

  test('Meredaksi teks sensitif yang mengandung OTP atau kode verifikasi', async () => {
    const payload = {
      app_name: 'id.co.bankmandiri.livin',
      title: 'OTP Livin',
      content: 'JANGAN BERIKAN KODE INI! Kode verifikasi Anda adalah 928374 untuk login',
      received_at: Date.now(),
    };

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.title, '[REDACTED]');
    assert.equal(body.data.content, '[REDACTED]');
    assert.equal(body.data.isSensitive, true);
  });

  test('Tetap kompatibel dengan x-www-form-urlencoded untuk backwards-compatibility', async () => {
    const formBody = new URLSearchParams({
      app_name: 'com.jago.bank',
      title: 'Bank Jago',
      text: 'Kamu baru saja membayar Rp 32.500 ke Alfamart',
      received_at: '1760248900000',
    }).toString();

    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-API-KEY': TEST_API_KEY,
      },
      body: formBody,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.app_name, 'com.jago.bank');
    assert.match(body.data.content, /Alfamart/);
  });

  test('Menolak JSON yang korup dengan HTTP 400', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': TEST_API_KEY,
      },
      body: '{ json_rusak: tanpa_tanda_kutip ',
    });

    assert.equal(res.status, 400);
  });
});
