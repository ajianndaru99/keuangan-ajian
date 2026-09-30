// ==============================================================================
// UNIT TESTS: tests/parsers.test.ts
// Pengujian menyeluruh parser notifikasi bank & e-wallet Indonesia
// Jalankan via: npm test
// ==============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseNotification,
  parseIndonesianCurrency,
  extractAmountFromText,
  generateDedupeHash
} from '../supabase/functions/webhook-transaction/parsers/index.ts';

describe('1. Currency & Utility Helpers', () => {
  test('parseIndonesianCurrency menangani berbagai format mata uang Rupiah', () => {
    assert.equal(parseIndonesianCurrency('Rp1.250.000'), 1250000);
    assert.equal(parseIndonesianCurrency('Rp 1.250.000,00'), 1250000);
    assert.equal(parseIndonesianCurrency('Rp 50.000,00'), 50000);
    assert.equal(parseIndonesianCurrency('Rp. 45.000'), 45000);
    assert.equal(parseIndonesianCurrency('IDR 350.000'), 350000);
    assert.equal(parseIndonesianCurrency('75.000'), 75000);
    assert.equal(parseIndonesianCurrency('1250000'), 1250000);
    assert.equal(parseIndonesianCurrency('Rp 34.500,50'), 34500.5);
  });

  test('extractAmountFromText mengekstrak nominal dari kalimat', () => {
    assert.equal(extractAmountFromText('Pembayaran sebesar Rp 120.000 di Alfamart'), 120000);
    assert.equal(extractAmountFromText('Transfer berhasil sebesar 500.000 ke rekening'), 500000);
    assert.equal(extractAmountFromText('Pesan tanpa nominal apa pun'), null);
  });

  test('generateDedupeHash konsisten dan membedakan transaksi unik', async () => {
    const timestamp1 = '2026-09-28T12:20:15Z';
    const timestamp2 = '2026-09-28T12:20:45Z'; // Dalam menit yang sama
    const timestamp3 = '2026-09-28T12:25:00Z'; // Menit berbeda

    const hash1 = await generateDedupeHash('acc-1', 50000, timestamp1, 'Indomaret', 'out');
    const hash2 = await generateDedupeHash('acc-1', 50000, timestamp2, 'Indomaret', 'out');
    const hash3 = await generateDedupeHash('acc-1', 50000, timestamp3, 'Indomaret', 'out');

    // Dalam menit yang sama harus menghasilkan hash identik (deduplikasi berhasil)
    assert.equal(hash1, hash2);
    // Di menit berbeda harus menghasilkan hash yang berbeda
    assert.notEqual(hash1, hash3);
  });
});

describe('2. BCA Parser (m-BCA, myBCA)', () => {
  test('BCA Transfer Keluar', () => {
    const text = 'm-Transfer: BERHASIL transfer Rp 150.000 ke rekening 1234567890 a.n. BUDI SANTOSO tgl 28/09/2026';
    const res = parseNotification('m-BCA', text);
    assert.equal(res.amount, 150000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'BCA');
    assert.equal(res.merchant, 'BUDI SANTOSO');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('BCA Pembayaran QRIS Keluar', () => {
    const text = 'QRIS BCA: Pembayaran Rp 45.000 di KOPI KENANGAN BERHASIL tgl 28/09/26';
    const res = parseNotification('BCA Mobile', text);
    assert.equal(res.amount, 45000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'KOPI KENANGAN');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('BCA Transfer Masuk', () => {
    const text = 'm-Transfer: DANA MASUK Rp 5.000.000 dari REK 987654321 a.n. PT KARYA INDAH';
    const res = parseNotification('BCA', text);
    assert.equal(res.amount, 5000000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'PT KARYA INDAH');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe("3. Bank Mandiri Parser (Livin' by Mandiri)", () => {
  test('Mandiri QRIS Keluar', () => {
    const text = 'Pembayaran QRIS Rp 25.000 di INDOMARET berhasil.';
    const res = parseNotification("Livin' by Mandiri", text);
    assert.equal(res.amount, 25000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Mandiri');
    assert.equal(res.merchant, 'INDOMARET');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Mandiri Transfer Keluar', () => {
    const text = 'Transfer berhasil sebesar Rp 250.000 ke BUDI SANTOSO (Bank Mandiri)';
    const res = parseNotification('Mandiri', text);
    assert.equal(res.amount, 250000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'BUDI SANTOSO');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Mandiri Dana Masuk', () => {
    const text = 'Dana masuk Rp 10.000.000 dari PT MAJU BERSAMA';
    const res = parseNotification('Livin', text);
    assert.equal(res.amount, 10000000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'PT MAJU BERSAMA');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('4. Bank BRI Parser (BRImo)', () => {
  test('BRImo QRIS Keluar', () => {
    const text = 'Transaksi QRIS sebesar Rp 35.000 di WARUNG PADANG SEDAP berhasil.';
    const res = parseNotification('BRImo', text);
    assert.equal(res.amount, 35000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'BRI');
    assert.equal(res.merchant, 'WARUNG PADANG SEDAP');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('BRImo Transfer Keluar', () => {
    const text = 'Transfer BRImo sebesar Rp 1.000.000 ke 1234567890 a.n JOKO SUSILO telah berhasil.';
    const res = parseNotification('BRI', text);
    assert.equal(res.amount, 1000000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'JOKO SUSILO');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('BRImo Transfer Masuk', () => {
    const text = 'Transfer masuk dari ACHMAD FAUZI sebesar Rp 750.000 berhasil.';
    const res = parseNotification('BRImo', text);
    assert.equal(res.amount, 750000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'ACHMAD FAUZI');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('5. GoPay Parser (Gojek / GoPay)', () => {
  test('GoPay Bayar Merchant', () => {
    const text = 'Kamu berhasil bayar Rp28.000 di Martabak Pecenongan pakai GoPay.';
    const res = parseNotification('GoPay', text);
    assert.equal(res.amount, 28000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'GoPay');
    assert.equal(res.merchant, 'Martabak Pecenongan');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('GoPay Transfer Keluar', () => {
    const text = 'Transfer GoPay sebesar Rp100.000 ke Budi Santoso berhasil dikirim.';
    const res = parseNotification('Gojek', text);
    assert.equal(res.amount, 100000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'Budi Santoso');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('GoPay Top Up Masuk', () => {
    const text = 'Top up GoPay sebesar Rp 200.000 dari BCA berhasil.';
    const res = parseNotification('GoPay', text);
    assert.equal(res.amount, 200000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'Top up dari BCA');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('GoPay Terima Transfer Masuk', () => {
    const text = 'Kamu menerima transfer GoPay sebesar Rp50.000 dari Siti.';
    const res = parseNotification('GoPay', text);
    assert.equal(res.amount, 50000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'Siti');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('6. ShopeePay Parser', () => {
  test('ShopeePay Pembayaran Keluar', () => {
    const text = 'Pembayaran sebesar Rp75.000 ke TOKO SEPATU KITA berhasil.';
    const res = parseNotification('ShopeePay', text);
    assert.equal(res.amount, 75000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'ShopeePay');
    assert.equal(res.merchant, 'TOKO SEPATU KITA');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('ShopeePay Bayar Toko Offline via ShopeePay', () => {
    const text = 'Kamu telah bayar Rp 34.500 di Alfamart via ShopeePay.';
    const res = parseNotification('Shopee', text);
    assert.equal(res.amount, 34500);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'Alfamart');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('ShopeePay Top Up Masuk', () => {
    const text = 'Top up ShopeePay sebesar Rp 100.000 telah berhasil.';
    const res = parseNotification('ShopeePay', text);
    assert.equal(res.amount, 100000);
    assert.equal(res.direction, 'in');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('ShopeePay Terima Transfer Masuk', () => {
    const text = 'Kamu menerima transfer sebesar Rp 85.000 dari RINA.';
    const res = parseNotification('ShopeePay', text);
    assert.equal(res.amount, 85000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'RINA');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('7. DANA Parser', () => {
  test('DANA Pembayaran Keluar', () => {
    const text = 'Pembayaran Rp35.000 ke Kopi Janji Jiwa berhasil.';
    const res = parseNotification('DANA', text);
    assert.equal(res.amount, 35000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'DANA');
    assert.equal(res.merchant, 'Kopi Janji Jiwa');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('DANA Kirim Uang Keluar', () => {
    const text = 'Kirim Uang Rp 200.000 ke Rekening BCA BERHASIL.';
    const res = parseNotification('DANA', text);
    assert.equal(res.amount, 200000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'Rekening BCA');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('DANA Isi Saldo Masuk', () => {
    const text = 'Isi Saldo Rp 500.000 via BCA OneKlik berhasil.';
    const res = parseNotification('DANA', text);
    assert.equal(res.amount, 500000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'Isi Saldo via BCA OneKlik');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('DANA Terima Uang Masuk', () => {
    const text = 'Kamu menerima uang Rp 75.000 dari HENDRA.';
    const res = parseNotification('DANA', text);
    assert.equal(res.amount, 75000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'HENDRA');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('8. OVO Parser', () => {
  test('OVO Pembayaran Keluar', () => {
    const text = 'Kamu telah melakukan pembayaran sebesar Rp 52.000 di HOKBEN.';
    const res = parseNotification('OVO', text);
    assert.equal(res.amount, 52000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'OVO');
    assert.equal(res.merchant, 'HOKBEN');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('OVO Transfer Keluar', () => {
    const text = 'Transfer OVO Cash sebesar Rp 150.000 ke 08123456789 berhasil.';
    const res = parseNotification('OVO', text);
    assert.equal(res.amount, 150000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, '08123456789');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('OVO Top Up Masuk', () => {
    const text = 'Top Up Rp 300.000 via BCA Virtual Account berhasil.';
    const res = parseNotification('OVO', text);
    assert.equal(res.amount, 300000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'Top Up via BCA Virtual Account');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('OVO Terima Transfer Masuk', () => {
    const text = 'Kamu menerima transfer OVO Cash sebesar Rp 40.000 dari MAYA.';
    const res = parseNotification('OVO', text);
    assert.equal(res.amount, 40000);
    assert.equal(res.direction, 'in');
    assert.equal(res.merchant, 'MAYA');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('9. Bank Jago Parser', () => {
  test('Jago Pembayaran QRIS Keluar', () => {
    const text = 'Pembayaran QRIS Rp 35.000 di Kopi Kenangan berhasil.';
    const res = parseNotification('Jago', text);
    assert.equal(res.amount, 35000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.merchant, 'Kopi Kenangan');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Jago Transfer Keluar', () => {
    const text = 'Kamu berhasil transfer Rp 150.000 ke Budi Santoso (BCA).';
    const res = parseNotification('Bank Jago', text);
    assert.equal(res.amount, 150000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.merchant, 'Budi Santoso');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Jago Uang Masuk / Transfer Masuk', () => {
    const text = 'Kamu menerima Rp 500.000 dari Ahmad Fauzi.';
    const res = parseNotification('Jago', text);
    assert.equal(res.amount, 500000);
    assert.equal(res.direction, 'in');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.merchant, 'Ahmad Fauzi');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Jago Transaksi Kartu Debit Keluar', () => {
    const text = 'Transaksi Kartu Debit Rp 85.000 di Indomaret berhasil.';
    const res = parseNotification('Bank Jago', text);
    assert.equal(res.amount, 85000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
    assert.equal(res.merchant, 'Indomaret');
    assert.equal(res.parsedSuccessfully, true);
  });
});

describe('10. Generic Fallback & Edge Cases', () => {
  test('Aplikasi tidak dikenal tetap berhasil mengekstrak nominal dan arah', () => {
    const text = 'Pembayaran sebesar Rp 88.000 di SPBU PERTAMINA Sukses';
    const res = parseNotification('BankKoperasiXYZ', text);
    assert.equal(res.amount, 88000);
    assert.equal(res.direction, 'out');
    assert.equal(res.merchant, 'SPBU PERTAMINA');
    assert.equal(res.parsedSuccessfully, true);
  });

  test('Notifikasi promosi tanpa nominal tidak membuang data (amount: 0, parsedSuccessfully: false)', () => {
    const text = 'Nikmati promo diskon 50% di merchant favorit kamu hari ini!';
    const res = parseNotification('GoPay', text);
    assert.equal(res.amount, 0);
    assert.equal(res.parsedSuccessfully, false);
    assert.equal(res.accountName, 'GoPay');
  });

  test('Pesan kosong ditangani dengan aman tanpa crash', () => {
    const res = parseNotification('', '');
    assert.equal(res.amount, 0);
    assert.equal(res.parsedSuccessfully, false);
  });
});
