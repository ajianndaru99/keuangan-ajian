// ==============================================================================
// TESTS: tests/notification-parser.test.ts
// Unit test pemfilter chat marketplace, promo, dan ekstraksi presisi notifikasi
// Menguji 3-Layer Parsing: Layer 1 (Regex), Layer 2 (AI Gemini), Layer 3 (Manual)
// ==============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNotificationPayload,
  extractNominal,
  extractMerchant,
  detectAccountInfo,
} from '../src/lib/ai/notification-parser.ts';

describe('Notification Smart Parser & Chat/Promo Filter', () => {
  test('Menolak pesan chat penjual Shopee ([Stiker], antrean, dll) dari transaksi riil', async () => {
    const chatSamples = [
      { app: 'com.shopee.id', title: 'r.r_digitalpro.id', text: '[Stiker]' },
      { app: 'com.shopee.id', title: 'r.r_digitalpro.id', text: 'Kaka mohon tunggu ya ka sedang antrean ini lg rame...' },
      { app: 'com.shopee.id', title: 'r.r_digitalpro.id', text: 'Baik ka wait ya' },
      { app: 'com.shopee.id', title: 'r.r_digitalpro.id', text: 'Di coba saja ya ka nanti' },
      { app: 'com.shopee.id', title: 'r.r_digitalpro.id', text: 'Kirim email ka' },
    ];

    for (const sample of chatSamples) {
      const res = await parseNotificationPayload(sample.app, sample.title, sample.text);
      assert.equal(res.isTransaction, false);
      assert.equal(res.amount, 0);
      assert.equal(res.outcome, 'ignored');
      assert.equal(res.parseMethod, 'regex');
    }
  });

  test('Menolak notifikasi promo dan diskon iklan bernilai 0', async () => {
    const res = await parseNotificationPayload(
      'com.shopeepay.id',
      'Deals Sekitarmu',
      'Flash Coffee CUMA 1RB!: Ngopi hemat Americano 23RB CUMA 1RB di Deal...'
    );
    assert.equal(res.isTransaction, false);
    assert.equal(res.amount, 0);
    assert.equal(res.outcome, 'ignored');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Mengekstrak pembayaran Bank Jago via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'com.jago.bank',
      'You have made a payment to pentol anugerah, BMBNG LP',
      'Thank you for trusting Jago! You have made a payment, Amount Rp 10.000 Transaction Date 12 October 2026'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 10000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.parseMethod, 'regex');
    assert.ok(res.merchant.toLowerCase().includes('pentol anugerah'));
  });

  test('Mengekstrak transaksi sah ShopeePay sebesar Rp 73.000 via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'com.shopee.id',
      'Pembayaran Berhasil',
      'Pembayaran sebesar Rp 73.000 telah berhasil untuk pesanan di r.r_digitalpro.id'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 73000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'ShopeePay');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Mengekstrak transaksi DANA Kopi Kenangan Rp 25.000 via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'id.dana',
      'DANA',
      'DANA: Pembayaran berhasil! Kamu telah melakukan pembayaran sebesar Rp 25.000 di Kopi Kenangan'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 25000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'Kopi Kenangan');
    assert.equal(res.accountName, 'DANA');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Ekstraksi nominal mendukung variasi format rupiah dan titik', () => {
    assert.equal(extractNominal('Rp 10.000'), 10000);
    assert.equal(extractNominal('Rp73.000'), 73000);
    assert.equal(extractNominal('sebesar Rp 1.250.000'), 1250000);
    assert.equal(extractNominal('Total 50.000'), 50000);
    assert.equal(extractNominal('Tidak ada angka'), 0);
  });

  test('AI Gemini Fallback (Layer 2) mengekstrak transaksi saat nominal tidak tertangkap regex', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        isTransaction: true,
                        amount: 85000,
                        direction: 'out',
                        merchant: 'Kopi Toko Djawa',
                        accountName: 'BCA',
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );

      const res = await parseNotificationPayload(
        'com.bca',
        'Pembayaran Berhasil',
        'Transaksi QRIS selesai diproses',
        'mock-api-key'
      );

      assert.equal(res.isTransaction, true);
      assert.equal(res.amount, 85000);
      assert.equal(res.direction, 'out');
      assert.equal(res.merchant, 'Kopi Toko Djawa');
      assert.equal(res.parseMethod, 'ai_gemini');
      assert.equal(res.outcome, 'transaction');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('AI Gemini Fallback menangani rate limit 429 dengan aman tanpa melempar exception', async () => {
    const originalFetch = globalThis.fetch;
    try {
      let fetchAttempts = 0;
      globalThis.fetch = async () => {
        fetchAttempts++;
        return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await parseNotificationPayload(
        'com.bca',
        'Pembayaran Berhasil',
        'Transaksi QRIS selesai diproses',
        'mock-api-key'
      );

      assert.equal(res.isTransaction, false);
      assert.equal(res.amount, 0);
      assert.equal(res.outcome, 'ignored');
      assert.equal(res.parseMethod, 'regex');
      assert.ok(fetchAttempts > 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
