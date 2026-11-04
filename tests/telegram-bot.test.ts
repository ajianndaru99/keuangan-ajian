import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateProgressBar,
  formatStatusMessage,
  formatAnggaranMessage,
  formatBudgetUpdatedWithStatusMessage,
  formatRekapMessage,
  formatInboxMessage,
  formatHelpMessage,
  formatWeeklyDigestNudge,
  formatPayYourselfFirstNudge,
  formatBillReminderNudge,
  formatMidMonthNudge,
  formatOverbudgetAlert,
  formatExpenseAlertMessage,
  formatExpenseVerifiedMessage,
  formatExpenseRejectedMessage,
  formatReceiptScanSuccessMessage,
} from '../src/lib/telegram/formatters.ts';
import {
  isChatIdAllowed,
  getAllowedChatIds,
  isTelegramConfigured,
  sendTelegramMessage,
  editTelegramMessageText,
  answerCallbackQuery,
} from '../src/lib/telegram/bot.ts';
import {
  parseNominal,
  parseSetSaldoCommand,
  parseSetAnggaranCommand,
  parseSetGajianCommand,
  processFinancialChatWithAI,
} from '../src/lib/telegram/nlp-chat.ts';
import type { FinancialContext } from '../src/lib/telegram/nlp-chat.ts';
import { isSafePromoKeyword } from '../src/lib/ai/adaptive-rules.ts';

describe('Telegram Bot: Visual Formatters & Tipografi Finansial', () => {
  it('generateProgressBar membentuk visual progress bar karakter monospaced dengan tepat', () => {
    // 0%
    const bar0 = generateProgressBar(0);
    assert.strictEqual(bar0, '`[░░░░░░░░░░]` *0%*');

    // 60%
    const bar60 = generateProgressBar(60);
    assert.strictEqual(bar60, '`[██████░░░░]` *60%*');

    // 80% (Peringatan Awal)
    const bar80 = generateProgressBar(80);
    assert.strictEqual(bar80, '`[████████░░]` *80%* ⚠️');

    // 100% (Batas Tercapai)
    const bar100 = generateProgressBar(100);
    assert.strictEqual(bar100, '`[██████████]` *100%* 🚨');

    // > 100% (Melebihi Batas)
    const bar120 = generateProgressBar(120);
    assert.strictEqual(bar120, '`[██████████]` *120%* 🚨');
  });

  it('formatStatusMessage memuat rincian kas, persentase anggaran, dan safe-to-spend harian', () => {
    const text = formatStatusMessage({
      accounts: [
        { name: 'DANA Suami', owner: 'Suami', balance: 500000 },
        { name: 'DANA Istri', owner: 'Istri', balance: 750000 },
      ],
      totalBalance: 1250000,
      totalSpentMonth: 3000000,
      totalBudgetLimit: 5000000,
      monthPercentage: 60,
      daysRemaining: 10,
      safeDailySpend: 200000,
      periodLabel: 'November 2026',
    });

    assert.ok(text.includes('DETAK FINANSIAL KELUARGA'));
    assert.ok(text.includes('DANA Suami'));
    assert.ok(text.includes('1.250.000'));
    assert.ok(text.includes('3.000.000'));
    assert.ok(text.includes('200.000 / hari'));
    assert.ok(text.includes('10 hari'));
  });

  it('formatAnggaranMessage memuat progress bar untuk daftar kategori yang diset dan daftar kategori belum diset', () => {
    const text = formatAnggaranMessage(
      [
        { name: 'Belanja Dapur', emoji: '🛒', spent: 1500000, limit: 2000000, percentage: 75 },
        { name: 'Makan & Jajan', emoji: '🍔', spent: 850000, limit: 1000000, percentage: 85 },
        { name: 'Transportasi/Bensin', emoji: '🚗', spent: 0, limit: 0, percentage: 0 },
      ],
      'November 2026'
    );

    assert.ok(text.includes('STATUS & KESIAPAN ANGGARAN KELUARGA'));
    assert.ok(text.includes('POS YANG SUDAH DISET'));
    assert.ok(text.includes('Belanja Dapur'));
    assert.ok(text.includes('Makan & Jajan'));
    assert.ok(text.includes('75%'));
    assert.ok(text.includes('85%'));
    assert.ok(text.includes('POS YANG BELUM DISET'));
    assert.ok(text.includes('Transportasi/Bensin'));
  });

  it('formatBudgetUpdatedWithStatusMessage mengonfirmasi update dan merinci status pos yang sudah dan belum diset', () => {
    const text = formatBudgetUpdatedWithStatusMessage(
      { name: 'Belanja Dapur', emoji: '🛒' },
      2000000,
      [
        { name: 'Belanja Dapur', emoji: '🛒', spent: 500000, limit: 2000000, percentage: 25 },
        { name: 'Makan & Jajan', emoji: '🍔', spent: 0, limit: 0, percentage: 0 },
      ],
      'November 2026'
    );

    assert.ok(text.includes('ANGGARAN BERHASIL DIPERBARUI'));
    assert.ok(text.includes('Belanja Dapur'));
    assert.ok(text.includes('2.000.000'));
    assert.ok(text.includes('1/2 Pos Diset'));
    assert.ok(text.includes('Masih Belum Diset'));
    assert.ok(text.includes('Makan & Jajan'));
  });

  it('formatRekapMessage menyajikan perbandingan minggu ini vs minggu lalu', () => {
    const text = formatRekapMessage({
      currentWeekTotal: 1200000,
      previousWeekTotal: 1500000,
      comparisonPercent: 20,
      isIncrease: false,
      topCategoryName: 'Belanja Dapur',
      topCategoryAmount: 600000,
      weekLabel: '28 Okt - 3 Nov 2026',
    });

    assert.ok(text.includes('REKAP PENGELUARAN MINGGUAN'));
    assert.ok(text.includes('1.200.000'));
    assert.ok(text.includes('Turun 20%'));
    assert.ok(text.includes('Belanja Dapur'));
  });

  it('formatInboxMessage menangani kondisi inbox bersih dan kondisi ada transaksi pending', () => {
    // Bersih
    const clean = formatInboxMessage({ pendingCount: 0, unreviewedRawCount: 0 });
    assert.ok(clean.includes('Semua transaksi bersih dan terverifikasi'));

    // Ada Pending
    const pending = formatInboxMessage({
      pendingCount: 5,
      unreviewedRawCount: 2,
      oldestPendingDate: '31 Oktober 2026',
    });
    assert.ok(pending.includes('5 transaksi'));
    assert.ok(pending.includes('2 mutasi'));
    assert.ok(pending.includes('31 Oktober 2026'));
  });

  it('formatHelpMessage menyediakan panduan perintah lengkap', () => {
    const help = formatHelpMessage();
    assert.ok(help.includes('/status'));
    assert.ok(help.includes('/anggaran'));
    assert.ok(help.includes('/rekap'));
    assert.ok(help.includes('/inbox'));
    assert.ok(help.includes('/help'));
  });

  it('Template Nudge terjadwal menghasilkan pesan terstruktur', () => {
    const bill = formatBillReminderNudge();
    assert.ok(bill.includes('PENGINGAT TAGIHAN'));
    assert.ok(bill.includes('Listrik PLN'));

    const payday = formatPayYourselfFirstNudge(25);
    assert.ok(payday.includes('TANGGAL 25'));
    assert.ok(payday.includes('Pay Yourself First'));

    const midMonth = formatMidMonthNudge(65, 3250000, 175000, 10);
    assert.ok(midMonth.includes('H+15'));
    assert.ok(midMonth.includes('65%'));

    const overbudget = formatOverbudgetAlert('Belanja Dapur', 2200000, 2000000, 200000);
    assert.ok(overbudget.includes('BELANJA DAPUR'));
    assert.ok(overbudget.includes('2.200.000'));
    assert.ok(overbudget.includes('200.000'));
  });
});

describe('Telegram Bot: Keamanan & Whitelist Chat ID', () => {
  const originalEnv = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  it('getAllowedChatIds memecah daftar ID dan membuang spasi kosong', () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = ' -1001234567890 , 987654321 ,  ';
    const ids = getAllowedChatIds();
    assert.deepStrictEqual(ids, ['-1001234567890', '987654321']);
  });

  it('isChatIdAllowed menolak jika whitelist kosong (fail-closed)', () => {
    delete process.env.TELEGRAM_ALLOWED_CHAT_IDS;
    assert.strictEqual(isChatIdAllowed('987654321'), false);
    assert.strictEqual(isChatIdAllowed('-1001234567890'), false);
  });

  it('isChatIdAllowed hanya meluluskan ID yang terdaftar dalam whitelist', () => {
    process.env.TELEGRAM_ALLOWED_CHAT_IDS = '-1001234567890,987654321';
    assert.strictEqual(isChatIdAllowed('987654321'), true);
    assert.strictEqual(isChatIdAllowed(987654321), true); // Number support
    assert.strictEqual(isChatIdAllowed('-1001234567890'), true);
    assert.strictEqual(isChatIdAllowed('111222333'), false); // Strangers rejected
  });

  it('isTelegramConfigured mendeteksi keberadaan TELEGRAM_BOT_TOKEN', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'mock_token_123';
    assert.strictEqual(isTelegramConfigured(), true);

    delete process.env.TELEGRAM_BOT_TOKEN;
    assert.strictEqual(isTelegramConfigured(), false);
  });

  it('sendTelegramMessage mengembalikan error jika token belum disetel', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await sendTelegramMessage('12345', 'Halo');
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('TELEGRAM_BOT_TOKEN belum disetel'));
  });

  it('sendTelegramMessage berhasil memanggil Telegram API saat token valid', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'valid_token_test';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.ok(url.includes('valid_token_test/sendMessage'));
        const body = JSON.parse(String(init?.body || '{}'));
        assert.strictEqual(body.chat_id, '999');
        assert.strictEqual(body.text, 'Pesan uji coba');
        return new Response(JSON.stringify({ ok: true, result: { message_id: 101 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await sendTelegramMessage('999', 'Pesan uji coba');
      assert.strictEqual(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalEnv) process.env.TELEGRAM_ALLOWED_CHAT_IDS = originalEnv;
      if (originalToken) process.env.TELEGRAM_BOT_TOKEN = originalToken;
    }
  });

  it('editTelegramMessageText memanggil endpoint editMessageText dengan benar', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token_edit_test';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.ok(url.includes('editMessageText'));
        const body = JSON.parse(String(init?.body || '{}'));
        assert.strictEqual(body.chat_id, 12345);
        assert.strictEqual(body.message_id, 88);
        assert.strictEqual(body.text, 'Pesan Baru');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await editTelegramMessageText(12345, 88, 'Pesan Baru');
      assert.strictEqual(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('answerCallbackQuery memanggil endpoint answerCallbackQuery dengan benar', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'token_cb_test';
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        assert.ok(url.includes('answerCallbackQuery'));
        const body = JSON.parse(String(init?.body || '{}'));
        assert.strictEqual(body.callback_query_id, 'cb_99');
        assert.strictEqual(body.text, 'Notif Pop');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await answerCallbackQuery('cb_99', 'Notif Pop');
      assert.strictEqual(res.success, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Telegram Bot: Format Pesan Alert Realtime & Struk Belanja', () => {
  it('formatExpenseAlertMessage menampilkan nominal rupiah, merchant, kategori, dan tombol siap verifikasi', () => {
    const text = formatExpenseAlertMessage({
      merchant: 'Warung Bu Joko',
      amount: 45000,
      categoryName: 'Belanja Dapur',
      accountName: 'GoPay',
      sourceDevice: 'istri',
    });

    assert.ok(text.includes('PENGELUARAN BARU TERDETEKSI'));
    assert.ok(text.includes('Warung Bu Joko'));
    assert.ok(text.includes('45.000'));
    assert.ok(text.includes('Belanja Dapur'));
    assert.ok(text.includes('(Istri)'));
  });

  it('formatExpenseVerifiedMessage menampilkan status reconciled dan nama verifikator', () => {
    const text = formatExpenseVerifiedMessage({
      merchant: 'SPBU Pertamina',
      amount: 100000,
      categoryName: 'Transportasi/Bensin',
      accountName: 'Bank Jago',
      verifiedBy: 'Ajian N.',
    });

    assert.ok(text.includes('PENGELUARAN TERVERIFIKASI'));
    assert.ok(text.includes('SPBU Pertamina'));
    assert.ok(text.includes('100.000'));
    assert.ok(text.includes('Ajian N.'));
    assert.ok(text.includes('Reconciled'));
  });

  it('formatExpenseRejectedMessage menampilkan alasan penolakan dan indikator pembelajaran AI', () => {
    const text = formatExpenseRejectedMessage({
      merchant: 'Promo GoFood Deals',
      amount: 0,
      reason: 'Promo / Iklan',
      learnedByAi: true,
    });

    assert.ok(text.includes('PENGELUARAN DIBATALKAN'));
    assert.ok(text.includes('Promo GoFood Deals'));
    assert.ok(text.includes('Promo / Iklan'));
    assert.ok(text.includes('dipelajari oleh AI'));
  });

  it('formatReceiptScanSuccessMessage menampilkan hasil pembacaan Vision AI', () => {
    const text = formatReceiptScanSuccessMessage({
      merchant: 'Indomaret Point',
      amount: 87500,
      categoryName: 'Belanja Dapur',
      accountName: 'BCA',
    });

    assert.ok(text.includes('STRUK BERHASIL DIPINDAI'));
    assert.ok(text.includes('Indomaret Point'));
    assert.ok(text.includes('87.500'));
    assert.ok(text.includes('BCA'));
  });
});

describe('Telegram Bot: NLP Parser & Perintah Cepat', () => {
  it('parseNominal mengekstrak format angka ribuan, shorthand rb/k/jt, dan desimal', () => {
    assert.strictEqual(parseNominal('38rb'), 38000);
    assert.strictEqual(parseNominal('38 rb'), 38000);
    assert.strictEqual(parseNominal('35k'), 35000);
    assert.strictEqual(parseNominal('2jt'), 2000000);
    assert.strictEqual(parseNominal('1,5jt'), 1500000);
    assert.strictEqual(parseNominal('1.5jt'), 1500000);
    assert.strictEqual(parseNominal('Rp 75.000'), 75000);
    assert.strictEqual(parseNominal('50000'), 50000);
    assert.strictEqual(parseNominal(''), 0);
  });

  it('parseSetSaldoCommand mengenali pola set/atur saldo rekening', () => {
    const res1 = parseSetSaldoCommand('set saldo gopay 38rb');
    assert.ok(res1);
    assert.strictEqual(res1.accountName.toLowerCase(), 'gopay');
    assert.strictEqual(res1.amount, 38000);

    const res2 = parseSetSaldoCommand('atur saldo bank jago 2jt');
    assert.ok(res2);
    assert.strictEqual(res2.accountName.toLowerCase(), 'bank jago');
    assert.strictEqual(res2.amount, 2000000);

    const res3 = parseSetSaldoCommand('/setsaldo bca 1.500.000');
    assert.ok(res3);
    assert.strictEqual(res3.accountName.toLowerCase(), 'bca');
    assert.strictEqual(res3.amount, 1500000);

    // Bukan perintah set saldo
    assert.strictEqual(parseSetSaldoCommand('halo apa kabar?'), null);
  });

  it('parseSetAnggaranCommand mengenali pola set/atur anggaran kategori', () => {
    const res1 = parseSetAnggaranCommand('set anggaran belanja dapur 1,5jt');
    assert.ok(res1);
    assert.strictEqual(res1.categoryName.toLowerCase(), 'belanja dapur');
    assert.strictEqual(res1.amount, 1500000);

    const res2 = parseSetAnggaranCommand('ubah anggaran makan 800rb');
    assert.ok(res2);
    assert.strictEqual(res2.categoryName.toLowerCase(), 'makan');
    assert.strictEqual(res2.amount, 800000);

    const res3 = parseSetAnggaranCommand('/setanggaran dapur 2jt');
    assert.ok(res3);
    assert.strictEqual(res3.categoryName.toLowerCase(), 'dapur');
    assert.strictEqual(res3.amount, 2000000);

    // Bukan perintah set anggaran
    assert.strictEqual(parseSetAnggaranCommand('tadi beli bensin'), null);
  });

  it('parseSetGajianCommand mengenali format set tanggal gajian 1-28', () => {
    assert.strictEqual(parseSetGajianCommand('set gajian 25'), 25);
    assert.strictEqual(parseSetGajianCommand('set tanggal gajian 25'), 25);
    assert.strictEqual(parseSetGajianCommand('atur gajian 1'), 1);
    assert.strictEqual(parseSetGajianCommand('/setgajian 28'), 28);
    // Nilai tidak valid (> 28 atau <= 0)
    assert.strictEqual(parseSetGajianCommand('set gajian 30'), null);
    assert.strictEqual(parseSetGajianCommand('set gajian 0'), null);
    assert.strictEqual(parseSetGajianCommand('gajian kapan'), null);
  });

  it('processFinancialChatWithAI fallback deterministik menangani pertanyaan saldo dan pagu saat offline', async () => {
    const mockContext: FinancialContext = {
      accounts: [
        { name: 'GoPay', owner: 'Suami', balance: 38000 },
        { name: 'Bank Jago', owner: 'Suami', balance: 2000000 },
      ],
      totalBalance: 2038000,
      totalSpentMonth: 1200000,
      totalBudgetLimit: 3000000,
      daysRemaining: 15,
      safeDailySpend: 120000,
      categoryBudgets: [
        { name: 'Belanja Dapur', spent: 600000, limit: 1500000, remaining: 900000 },
      ],
      periodLabel: 'November 2026',
    };

    // Pertanyaan Saldo
    const resSaldo = await processFinancialChatWithAI('saldo gopay berapa?', mockContext);
    assert.strictEqual(resSaldo.type, 'chat_answer');
    assert.ok(resSaldo.replyText.includes('GoPay'));
    assert.ok(resSaldo.replyText.includes('38.000'));

    // Pertanyaan Anggaran
    const resAnggaran = await processFinancialChatWithAI('sisa anggaran belanja dapur berapa?', mockContext);
    assert.strictEqual(resAnggaran.type, 'chat_answer');
    assert.ok(resAnggaran.replyText.includes('Belanja Dapur'));
    assert.ok(resAnggaran.replyText.includes('900.000'));
  });

  it('Ekstraksi referensi UUID pada format force reply pembatalan [REF:uuid]', () => {
    const promptText = '✍️ Tulis Alasan Pembatalan\n\nBalas pesan ini dengan alasan penolakan mutasi #a1b2c3d4 [REF:123e4567-e89b-12d3-a456-426614174000]:';
    const match = promptText.match(/\[REF:([a-f0-9-]{36})\]/i);
    assert.ok(match);
    assert.strictEqual(match[1], '123e4567-e89b-12d3-a456-426614174000');
  });

  it('Pencegahan kata kunci merchant umum terblokir oleh aturan promo adaptif', () => {
    // Indomaret atau Alfamart sah yang salah ketuk tidak boleh masuk ke aturan blokir
    assert.strictEqual(isSafePromoKeyword('indomaret'), false);
    assert.strictEqual(isSafePromoKeyword('alfamart'), false);
    assert.strictEqual(isSafePromoKeyword('spbu pertamina'), false);
    assert.strictEqual(isSafePromoKeyword('superindo'), false);
  });
});

