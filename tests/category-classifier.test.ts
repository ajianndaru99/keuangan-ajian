import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyExpenseCategoryRuleBased } from '../src/lib/ai/category-classifier.ts';
import { parseNotificationPayload, extractReferenceCode } from '../src/lib/ai/notification-parser.ts';
import { extractPromoKeywordsFromText } from '../src/lib/ai/adaptive-rules.ts';

describe('Pemisahan 9 Kategori: Dapur vs Makan Harian vs Jajan vs Lainnya', () => {
  test('Membedakan Belanja Dapur, Makan Harian, Jajan, dan Lainnya secara akurat', () => {
    const dapur = classifyExpenseCategoryRuleBased('Pasar Tani Sayur', 'Beli sayur & bumbu masak', 65000);
    assert.equal(dapur.categoryName, 'Belanja Dapur');
    assert.equal(dapur.confident, true);

    const makan = classifyExpenseCategoryRuleBased('Warteg Bahari', 'Nasi lauk makan siang', 24000);
    assert.equal(makan.categoryName, 'Makan Harian');
    assert.equal(makan.confident, true);

    const jajan = classifyExpenseCategoryRuleBased('ES COKELAT EYANG PUTRI', '', 34000);
    assert.equal(jajan.categoryName, 'Jajan');
    assert.equal(jajan.confident, true);

    const minimarketKecil = classifyExpenseCategoryRuleBased('Alfamart Kaliurang', '', 12000);
    assert.equal(minimarketKecil.categoryName, 'Jajan');

    const minimarketBesar = classifyExpenseCategoryRuleBased('Indomaret Point', '', 85000);
    assert.equal(minimarketBesar.categoryName, 'Belanja Dapur');

    const lainnya = classifyExpenseCategoryRuleBased('TOKO BAROKAH JAYA', '', 9500);
    assert.equal(lainnya.categoryName, 'Lainnya');
    assert.equal(lainnya.confident, false);
  });

  test('Promo yang memakai kata "berhasil" namun mengandung ajakan marketing tetap ditolak', async () => {
    const res = await parseNotificationPayload(
      'id.dana',
      'Klaim Cashback Berhasil!',
      'Cashback hingga Rp 50.000 berhasil tersedia! Pakai kode promo sekarang!'
    );
    assert.equal(res.isTransaction, false);
    assert.equal(res.outcome, 'ignored');
  });

  test('Ekstraksi kode referensi bank & keyword promo manual', () => {
    assert.equal(extractReferenceCode('Pembayaran QRIS berhasil Ref: TRX998877'), 'TRX998877');
    const kws = extractPromoKeywordsFromText('GoPay', 'Nikmati bunga 0% untuk cicilan hari ini', '', true);
    assert.ok(kws.length > 0);
  });
});
