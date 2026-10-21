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

  test('Mengekstrak pembayaran Bank Jago sore hari (17:11 WIB) via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'com.jago.bank',
      'You have made a payment to pentol anugerah, BMBNG LP 💸',
      'Thank you for trusting Jago! You have made a payment, and here are the details: Amount Rp 10.000 Transaction Date 12 October 2026, 17:11 WIB Tip Amount Rp 0'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 10000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.parseMethod, 'regex');
    assert.ok(res.merchant.toLowerCase().includes('pentol anugerah'));
    assert.equal(res.transactionDate, '2026-10-12T10:11:00.000Z');
  });

  test('Mengekstrak pembayaran Bank Jago merchant TOKO MAYAR 98 Rp 70.500 dengan kalimat bantuan', async () => {
    const res = await parseNotificationPayload(
      'com.jago.digitalBanking',
      'Jago',
      'You have paid Rp 70.500 to TOKO MAYAR 98. Need help? Contact Tanya Jago at 1500 746.'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 70500);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.merchant, 'TOKO MAYAR 98');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Mengekstrak notifikasi Bank Jago bahasa Indonesia dengan salam sore dan uang keluar', async () => {
    const res = await parseNotificationPayload(
      'com.jago.bank',
      'Kantong Utama',
      'Selamat sore! Kamu telah membayar Rp 10.000 ke pentol anugerah, BMBNG LP pada tanggal 12 Okt 2026 17:11 WIB'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 10000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.ok(res.merchant.toLowerCase().includes('pentol anugerah'));
    assert.equal(res.transactionDate, '2026-10-12T10:11:00.000Z');

    const resUangKeluar = await parseNotificationPayload(
      'com.jago.bank',
      'Uang keluar',
      'Uang keluar sebesar Rp 10.000 untuk pembayaran ke pentol anugerah, BMBNG LP'
    );
    assert.equal(resUangKeluar.isTransaction, true);
    assert.equal(resUangKeluar.amount, 10000);
    assert.ok(resUangKeluar.merchant.toLowerCase().includes('pentol anugerah'));
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

  test('Mengekstrak transaksi sah SeaBank Rp 50.000 keluar via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'id.co.bankbkemobile.digitalbank',
      'Transfer Berhasil',
      'Kamu telah mentransfer Rp 50.000 ke BUDI UTOMO'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 50000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'BUDI UTOMO');
    assert.equal(res.accountName, 'SeaBank');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Mengekstrak transaksi uang masuk SeaBank Rp 100.000 via Regex (Layer 1)', async () => {
    const res = await parseNotificationPayload(
      'id.co.bankbkemobile.digitalbank',
      'SeaBank',
      'Transfer masuk sebesar Rp 100.000 dari SITI AISYAH berhasil'
    );
    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 100000);
    assert.equal(res.direction, 'in');
    assert.equal(res.accountName, 'SeaBank');
    assert.equal(res.parseMethod, 'regex');
  });

  test('Ekstraksi nominal mendukung variasi format rupiah, titik, koma, dan singkatan rb/k', () => {
    assert.equal(extractNominal('Rp 10.000'), 10000);
    assert.equal(extractNominal('Rp 10,000'), 10000);
    assert.equal(extractNominal('Rp 10,000.00'), 10000);
    assert.equal(extractNominal('Rp 10.000,00'), 10000);
    assert.equal(extractNominal('Rp73.000'), 73000);
    assert.equal(extractNominal('Rp 73,000'), 73000);
    assert.equal(extractNominal('73rb'), 73000);
    assert.equal(extractNominal('sebesar 73 ribu'), 73000);
    assert.equal(extractNominal('73k'), 73000);
    assert.equal(extractNominal('sebesar Rp 1.250.000'), 1250000);
    assert.equal(extractNominal('Total 50.000'), 50000);
    assert.equal(extractNominal('Uang keluar Rp 10.000'), 10000);
    assert.equal(extractNominal('Amount Rp 10.000 Tip Amount Rp 0'), 10000);
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

  test('Secara tegas menolak notifikasi promo/gamifikasi GoPay dan ShopeePay (Roda Hadiah, Nonton Anime, Diskon Tagihan, Google One)', async () => {
    const promoSamples = [
      {
        app: 'com.gojek.app',
        title: 'Roda Hadiah',
        text: 'Putar Roda Hadiah! Dapatkan s.d. 1.000.000 GoPay Coins buat Ajian',
      },
      {
        app: 'com.gojek.app',
        title: 'Nonton Anime dan klaim paket data',
        text: 'Nonton anime favorit dan klaim paket data hemat cuma Rp 1 buat Ajian: Cek sekarang!',
      },
      {
        app: 'com.shopeepay.id',
        title: '🎁 Diskon Bayar Tagihan s.d. 100RB buat Kamu!',
        text: 'Bayar tagihan PLN dan BPJS hemat s.d. 100RB khusus buat Kamu hari ini!',
      },
      {
        app: 'com.gojek.app',
        title: '☁ Google One GRATIS 3 Bulan!',
        text: 'Klaim penyimpanan Google One GRATIS 3 Bulan khusus pengguna setia GoPay',
      },
    ];

    for (const sample of promoSamples) {
      const res = await parseNotificationPayload(sample.app, sample.title, sample.text);
      assert.equal(res.isTransaction, false, `Seharusnya bukan transaksi: ${sample.title}`);
      assert.equal(res.amount, 0, `Nominal harus 0: ${sample.title}`);
      assert.equal(res.outcome, 'ignored', `Outcome harus ignored: ${sample.title}`);
      assert.equal(res.parseMethod, 'regex', `Harus ditolak langsung oleh regex: ${sample.title}`);
    }
  });

  test('Mengekstrak seluruh variasi notifikasi bahasa Inggris Bank Jago secara akurat via Regex', async () => {
    // 1. Transfer Keluar: You've transferred Rp50.000 to NURUL
    const txTransfer = await parseNotificationPayload(
      'com.jago.bank',
      'Jago',
      "You've transferred Rp50.000 to NURUL"
    );
    assert.equal(txTransfer.isTransaction, true);
    assert.equal(txTransfer.amount, 50000);
    assert.equal(txTransfer.direction, 'out');
    assert.equal(txTransfer.accountName, 'Jago');
    assert.equal(txTransfer.merchant, 'NURUL');
    assert.equal(txTransfer.parseMethod, 'regex');

    // 2. Transaksi Belanja Debit: RATIH CITRA SASTINALA spent Rp50.000 at Indomaret
    const txSpent = await parseNotificationPayload(
      'com.jago.bank',
      'Jago',
      'RATIH CITRA SASTINALA spent Rp50.000 at Indomaret'
    );
    assert.equal(txSpent.isTransaction, true);
    assert.equal(txSpent.amount, 50000);
    assert.equal(txSpent.direction, 'out');
    assert.equal(txSpent.accountName, 'Jago');
    assert.equal(txSpent.merchant, 'Indomaret');
    assert.equal(txSpent.parseMethod, 'regex');

    // 3. Uang Masuk: You received Rp100.000 from BUDI
    const txReceived = await parseNotificationPayload(
      'com.jago.bank',
      'Jago',
      'You received Rp100.000 from BUDI'
    );
    assert.equal(txReceived.isTransaction, true);
    assert.equal(txReceived.amount, 100000);
    assert.equal(txReceived.direction, 'in');
    assert.equal(txReceived.accountName, 'Jago');
    assert.equal(txReceived.merchant, 'BUDI');
    assert.equal(txReceived.parseMethod, 'regex');

    // 4. QRIS Payment: Your QRIS payment of Rp 25.000 to Kopi Kenangan was successful
    const txQris = await parseNotificationPayload(
      'com.jago.bank',
      'QRIS Payment',
      'Your QRIS payment of Rp 25.000 to Kopi Kenangan was successful'
    );
    assert.equal(txQris.isTransaction, true);
    assert.equal(txQris.amount, 25000);
    assert.equal(txQris.direction, 'out');
    assert.equal(txQris.accountName, 'Jago');
    assert.equal(txQris.merchant, 'Kopi Kenangan');
    assert.equal(txQris.parseMethod, 'regex');
  });
});
