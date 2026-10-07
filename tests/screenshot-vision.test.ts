// ==============================================================================
// UNIT TESTS: tests/screenshot-vision.test.ts
// Pengujian unit modul Vision AI Gemini: parsing JSON, normalisasi akun,
// kategorisasi merchant, dedupe hash, dan validasi struk
// ==============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAccount,
  suggestCategoryForMerchant,
  extractJsonFromResponse,
  generateScreenshotDedupeHash,
  analyzeReceiptWithVision,
  KNOWN_ACCOUNTS,
} from '../src/lib/vision/gemini.ts';

describe('1. Normalisasi Akun Bank & E-Wallet (normalizeAccount)', () => {
  test('Mengenali berbagai alias bank besar Indonesia', () => {
    assert.deepEqual(normalizeAccount('m-BCA Transfer'), { name: 'BCA', type: 'bank' });
    assert.deepEqual(normalizeAccount('Livin by Mandiri QRIS'), { name: 'Mandiri', type: 'bank' });
    assert.deepEqual(normalizeAccount('BRImo BRI'), { name: 'BRI', type: 'bank' });
    assert.deepEqual(normalizeAccount('Bank Jago Kantong'), { name: 'Jago', type: 'bank' });
  });

  test('Mengenali berbagai e-wallet Indonesia', () => {
    assert.deepEqual(normalizeAccount('GoPay QRIS Merchant'), { name: 'GoPay', type: 'ewallet' });
    assert.deepEqual(normalizeAccount('ShopeePay'), { name: 'ShopeePay', type: 'ewallet' });
    assert.deepEqual(normalizeAccount('DANA Indonesia'), { name: 'DANA', type: 'ewallet' });
    assert.deepEqual(normalizeAccount('OVO Cash'), { name: 'OVO', type: 'ewallet' });
  });

  test('Fallback wajar untuk institusi tidak terdaftar', () => {
    const unknownBank = normalizeAccount('Bank Danamon');
    assert.equal(unknownBank.name, 'Bank Danamon');
    assert.equal(unknownBank.type, 'bank');

    const unknownWallet = normalizeAccount('LinkAja e-wallet');
    assert.equal(unknownWallet.type, 'ewallet');
  });
});

describe('2. Rekomendasi Kategori Otomatis (suggestCategoryForMerchant)', () => {
  const dummyCategories = [
    { id: 'cat-1', name: 'Belanja Dapur' },
    { id: 'cat-2', name: 'Makan & Jajan' },
    { id: 'cat-3', name: 'Transportasi/Bensin' },
    { id: 'cat-4', name: 'Tagihan & Utilitas' },
    { id: 'cat-5', name: 'Belanja Online' },
    { id: 'cat-6', name: 'Kesehatan' },
    { id: 'cat-7', name: 'Hiburan' },
  ];

  test('Mencocokkan merchant makanan & jajan', () => {
    assert.equal(suggestCategoryForMerchant('Kopi Kenangan Senopati', dummyCategories), 'cat-2');
    assert.equal(suggestCategoryForMerchant('Resto Padang Sederhana', dummyCategories), 'cat-2');
    assert.equal(suggestCategoryForMerchant('Bakso Solo Samrat', dummyCategories), 'cat-2');
  });

  test('Mencocokkan kebutuhan dapur & minimarket', () => {
    assert.equal(suggestCategoryForMerchant('INDOMARET POINT', dummyCategories), 'cat-1');
    assert.equal(suggestCategoryForMerchant('Alfamart Kebayoran', dummyCategories), 'cat-1');
    assert.equal(suggestCategoryForMerchant('Superindo Express', dummyCategories), 'cat-1');
  });

  test('Mencocokkan bensin dan transportasi', () => {
    assert.equal(suggestCategoryForMerchant('SPBU PERTAMINA 31.123', dummyCategories), 'cat-3');
    assert.equal(suggestCategoryForMerchant('Gojek Ride', dummyCategories), 'cat-3');
  });

  test('Mencocokkan belanja online dan e-commerce', () => {
    assert.equal(suggestCategoryForMerchant('Shopee Indonesia', dummyCategories), 'cat-5');
    assert.equal(suggestCategoryForMerchant('Tokopedia Official', dummyCategories), 'cat-5');
  });

  test('Mengembalikan null jika tidak ada kata kunci yang cocok', () => {
    assert.equal(suggestCategoryForMerchant('Bengkel Abadi Motor', dummyCategories), null);
    assert.equal(suggestCategoryForMerchant('', dummyCategories), null);
  });
});

describe('3. Pembersihan JSON Response Vision (extractJsonFromResponse)', () => {
  test('Menghapus wrapper markdown ```json dan ```', () => {
    const raw = '```json\n{"isValidReceipt": true, "amount": 25000}\n```';
    assert.equal(extractJsonFromResponse(raw), '{"isValidReceipt": true, "amount": 25000}');
  });

  test('Mempertahankan string yang sudah bersih tanpa markdown', () => {
    const raw = '{"isValidReceipt": false}';
    assert.equal(extractJsonFromResponse(raw), '{"isValidReceipt": false}');
  });
});

describe('4. Dedupe Hash Bukti Screenshot (generateScreenshotDedupeHash)', () => {
  test('Konsisten menghasilkan hash identik untuk nomor referensi yang sama', async () => {
    const hash1 = await generateScreenshotDedupeHash(
      'suami',
      'BCA',
      '20261007889900',
      50000,
      '2026-10-07T10:00:00+07:00'
    );
    const hash2 = await generateScreenshotDedupeHash(
      'SUAMI',
      'bca',
      '20261007889900',
      50000,
      '2026-10-07T12:00:00+07:00'
    );
    assert.equal(hash1, hash2, 'Hash harus konsisten dan case-insensitive');
    assert.equal(hash1.length, 64, 'SHA-256 harus 64 karakter hex');
  });

  test('Menghasilkan hash berbeda untuk nomor referensi berbeda', async () => {
    const hashA = await generateScreenshotDedupeHash('suami', 'BCA', 'REF-001', 50000, '2026-10-07');
    const hashB = await generateScreenshotDedupeHash('suami', 'BCA', 'REF-002', 50000, '2026-10-07');
    assert.notEqual(hashA, hashB);
  });

  test('Fallback dedupe berbasis nominal dan menit saat referensi kosong', async () => {
    const hashA = await generateScreenshotDedupeHash('suami', 'GoPay', '', 35000, '2026-10-07T09:30:15');
    const hashB = await generateScreenshotDedupeHash('suami', 'GoPay', '', 35000, '2026-10-07T09:30:59');
    // Karena menitnya sama (09:30), hash harus sama
    assert.equal(hashA, hashB);

    const hashC = await generateScreenshotDedupeHash('suami', 'GoPay', '', 35000, '2026-10-07T09:35:00');
    assert.notEqual(hashA, hashC);
  });
});

describe('5. Ekstraksi Vision AI Bukti Struk (analyzeReceiptWithVision)', () => {
  test('Menganalisis payload struk transaksi dengan benar', async () => {
    const fakeImageBuffer = Buffer.from('VALID_RECEIPT_IMAGE_BUFFER_DATA');
    const result = await analyzeReceiptWithVision(fakeImageBuffer, 'image/jpeg');

    assert.equal(result.isValidReceipt, true);
    assert.ok(result.amount > 0);
    assert.ok(result.totalAmount >= result.amount);
    assert.equal(result.accountType, 'bank');
    assert.ok(result.merchant.length > 0);
  });

  test('Menolak gambar non-transaksi dengan isValidReceipt = false', async () => {
    const nonReceiptBuffer = Buffer.from('TEST_NON_RECEIPT_RANDOM_PHOTO');
    const result = await analyzeReceiptWithVision(nonReceiptBuffer, 'image/jpeg');

    assert.equal(result.isValidReceipt, false);
    assert.equal(result.amount, 0);
  });
});
