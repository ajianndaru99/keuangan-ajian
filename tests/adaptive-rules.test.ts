import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanRuleKeyword,
  isSafePromoKeyword,
  extractPromoKeywordsFromText,
  matchesLearnedRules,
} from '../src/lib/ai/adaptive-rules.ts';
import { parseNotificationPayload } from '../src/lib/ai/notification-parser.ts';

describe('Sistem Pembelajaran Regex Adaptif (Closed-Loop Learning)', () => {
  test('cleanRuleKeyword membersihkan emoji, simbol, dan spasi ganda', () => {
    assert.equal(
      cleanRuleKeyword('🛡 Dapetin perlindungan dari penipuan! 💸'),
      'dapetin perlindungan dari penipuan'
    );
    assert.equal(cleanRuleKeyword('   Roda    Hadiah!!!  '), 'roda hadiah');
  });

  test('isSafePromoKeyword menolak kata umum keuangan agar tidak salah blokir', () => {
    // Kata umum terlarang
    assert.equal(isSafePromoKeyword('bca'), false);
    assert.equal(isSafePromoKeyword('transfer'), false);
    assert.equal(isSafePromoKeyword('berhasil'), false);
    assert.equal(isSafePromoKeyword('uang masuk'), false);
    assert.equal(isSafePromoKeyword('12345'), false);
    assert.equal(isSafePromoKeyword('a'), false);

    // Kata kunci promo yang sah
    assert.equal(isSafePromoKeyword('asuransi penipuan digital'), true);
    assert.equal(isSafePromoKeyword('roda hadiah'), true);
    assert.equal(isSafePromoKeyword('nonton anime'), true);
  });

  test('extractPromoKeywordsFromText mengekstrak kata kunci promo fintech secara akurat', () => {
    const kws = extractPromoKeywordsFromText(
      '🛡 Dapetin perlindungan dari penipuan cuma dengan Rp100!',
      'Aktifkan Asuransi Penipuan Digital sekarang dan dapetin diskon terbatas. Cuma bayar 11 bulan!'
    );

    assert.ok(
      kws.includes('asuransi penipuan digital') || kws.includes('perlindungan dari penipuan'),
      'Harus mengekstrak frasa asuransi / perlindungan penipuan'
    );
  });

  test('matchesLearnedRules mencocokkan teks terhadap daftar aturan pembelajaran', () => {
    const rules = ['asuransi penipuan digital', 'spin and win', 'tebak gambar seru'];

    const match1 = matchesLearnedRules(
      'GoPay: Mau perlindungan ekstra? Aktifkan Asuransi Penipuan Digital hari ini!',
      rules
    );
    assert.equal(match1.matched, true);
    assert.equal(match1.rule, 'asuransi penipuan digital');

    const match2 = matchesLearnedRules(
      'ShopeePay: Transfer ke rekening BCA sebesar Rp 50.000 telah berhasil',
      rules
    );
    assert.equal(match2.matched, false);
  });

  test('parseNotificationPayload langsung menolak notifikasi jika cocok dengan learnedRules', async () => {
    const dynamicLearnedRules = ['asuransi penipuan digital', 'program undian akhir pekan'];

    // Notifikasi dengan teks baru yang belum terdaftar di regex statis
    const res = await parseNotificationPayload(
      'com.custom.fintech',
      'Penawaran Baru',
      'Ikuti program undian akhir pekan sekarang juga dan dapatkan hadiah!',
      undefined,
      dynamicLearnedRules
    );

    assert.equal(res.isTransaction, false);
    assert.equal(res.amount, 0);
    assert.equal(res.outcome, 'ignored');
    assert.equal(res.parseMethod, 'regex');
    assert.ok(res.reasons[0].includes('aturan regex adaptif'));
  });

  test('parseNotificationPayload tidak menolak transaksi sah meskipun memuat sebagian kata', async () => {
    const dynamicLearnedRules = ['undian'];

    // Transaksi pembayaran sah dengan bukti konfirmasi
    const res = await parseNotificationPayload(
      'com.jago.bank',
      'Jago',
      'Kamu telah membayar Rp 50.000 ke Toko Undian Berkah pada tanggal 20 Okt 2026',
      undefined,
      dynamicLearnedRules
    );

    assert.equal(res.isTransaction, true);
    assert.equal(res.amount, 50000);
    assert.equal(res.direction, 'out');
    assert.equal(res.accountName, 'Jago');
  });

  test('extractPromoKeywordsFromText dengan isExplicitManualPromo mengekstrak kata kunci meski teks tanpa kata promo umum', () => {
    const kws = extractPromoKeywordsFromText(
      'Kredivo Paylater',
      'Limit kredit Anda telah dinaikkan menjadi Rp 5.000.000',
      undefined,
      true
    );

    assert.ok(kws.length > 0, 'Harus menghasilkan kata kunci saat ditandai secara manual');
    assert.ok(
      kws.some((k) => k.includes('kredivo') || k.includes('paylater')),
      'Kata kunci harus memuat unsur kredivo/paylater'
    );
  });
});

