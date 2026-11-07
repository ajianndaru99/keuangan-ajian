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
  formatIncomeAlertMessage,
  formatExpenseVerifiedMessage,
  formatExpenseRejectedMessage,
  formatReceiptScanSuccessMessage,
  formatInternalTransferAlertMessage,
  formatTodayExpensesMessage,
  formatDaily11AMReportMessage,
} from '../src/lib/telegram/formatters.ts';
import {
  findMatchingAccount,
  shouldProcessChat,
  stripBotMentions,
  isDirectRejectionFeedback,
  isDirectCategoryFeedback,
  extractAmountFromBotAlertText,
  handleCustomRejectionReply,
} from '../src/lib/telegram/settings-commands.ts';
import {
  formatSettingsHubMenuText,
  getSettingsHubInlineKeyboard,
  handleAccountTextCommands,
} from '../src/lib/telegram/settings-hub.ts';
import { getMonthlyRange, getBudgetPeriodKey, getTodayRangeWIB } from '../src/lib/date-utils.ts';
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
  handleLocalDeterministicFallback,
  isTodayExpenseQuery,
} from '../src/lib/telegram/nlp-chat.ts';
import type { FinancialContext } from '../src/lib/telegram/nlp-chat.ts';
import { deduplicateSimultaneousExpenses } from '../src/lib/telegram/commands.ts';
import {
  getIndonesianHolidayInfo,
  generateDailyDynamicCaption,
  mapWeatherCodeToIndonesian,
} from '../src/lib/telegram/weather.ts';
import { isSafePromoKeyword } from '../src/lib/ai/adaptive-rules.ts';
import {
  syncAccountBalance,
  applyAccountBalanceDelta,
  setAccountBalanceToTarget,
} from '../src/lib/account-balance.ts';

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
    assert.strictEqual(bar80, '`[████████░░]` *80%* [PERINGATAN]');

    // 100% (Batas Tercapai)
    const bar100 = generateProgressBar(100);
    assert.strictEqual(bar100, '`[██████████]` *100%* [DARURAT]');

    // > 100% (Melebihi Batas)
    const bar120 = generateProgressBar(120);
    assert.strictEqual(bar120, '`[██████████]` *120%* [DARURAT]');
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
  it('formatExpenseAlertMessage menampilkan nominal rupiah, merchant, kategori, waktu WIB, dan tombol siap verifikasi', () => {
    const text = formatExpenseAlertMessage({
      merchant: 'Warung Bu Joko',
      amount: 45000,
      categoryName: 'Belanja Dapur',
      accountName: 'GoPay',
      sourceDevice: 'istri',
      transactionDate: '2026-11-07T10:15:00.000Z',
    });

    assert.ok(text.includes('PENGELUARAN BARU TERDETEKSI'));
    assert.ok(text.includes('Warung Bu Joko'));
    assert.ok(text.includes('45.000'));
    assert.ok(text.includes('Belanja Dapur'));
    assert.ok(text.includes('(Istri)'));
    assert.ok(text.includes('Waktu:'));
    assert.ok(text.includes('WIB'));
  });

  it('formatExpenseVerifiedMessage menampilkan status reconciled, waktu WIB, dan nama verifikator', () => {
    const text = formatExpenseVerifiedMessage({
      merchant: 'SPBU Pertamina',
      amount: 100000,
      categoryName: 'Transportasi/Bensin',
      accountName: 'Bank Jago',
      verifiedBy: 'Ajian N.',
      transactionDate: '2026-11-07T11:20:00.000Z',
    });

    assert.ok(text.includes('PENGELUARAN TERVERIFIKASI'));
    assert.ok(text.includes('SPBU Pertamina'));
    assert.ok(text.includes('100.000'));
    assert.ok(text.includes('Ajian N.'));
    assert.ok(text.includes('Reconciled'));
    assert.ok(text.includes('Waktu:'));
    assert.ok(text.includes('WIB'));
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

  it('formatReceiptScanSuccessMessage menampilkan hasil pembacaan Vision AI beserta waktu WIB', () => {
    const text = formatReceiptScanSuccessMessage({
      merchant: 'Indomaret Point',
      amount: 87500,
      categoryName: 'Belanja Dapur',
      accountName: 'BCA',
      transactionDate: '2026-11-07T09:30:00.000Z',
    });

    assert.ok(text.includes('STRUK BERHASIL DIPINDAI'));
    assert.ok(text.includes('Indomaret Point'));
    assert.ok(text.includes('87.500'));
    assert.ok(text.includes('BCA'));
    assert.ok(text.includes('Waktu:'));
    assert.ok(text.includes('WIB'));
  });

  it('formatExpenseAlertMessage dengan isAutoReconciled menyajikan status reconciled dan waktu WIB', () => {
    const text = formatExpenseAlertMessage({
      merchant: 'Superindo',
      amount: 150000,
      categoryName: 'Belanja Dapur',
      accountName: 'BCA',
      sourceDevice: 'suami',
      isAutoReconciled: true,
      transactionDate: '2026-11-07T13:45:00.000Z',
    });

    assert.ok(text.includes('PENGELUARAN DICATAT OTOMATIS'));
    assert.ok(text.includes('Reconciled'));
    assert.ok(text.includes('150.000'));
    assert.ok(text.includes('Waktu:'));
    assert.ok(text.includes('WIB'));
  });

  it('formatInternalTransferAlertMessage menyajikan informasi perpindahan akun dan saldo seimbang beserta waktu WIB', () => {
    const text = formatInternalTransferAlertMessage({
      fromAccount: 'Bank Jago Suami',
      toAccount: 'GoPay Suami',
      amount: 200000,
      transactionDate: '2026-11-07T14:10:00.000Z',
    });

    assert.ok(text.includes('PERPINDAHAN DANA TERDETEKSI'));
    assert.ok(text.includes('Bank Jago Suami'));
    assert.ok(text.includes('GoPay Suami'));
    assert.ok(text.includes('200.000'));
    assert.ok(text.includes('tidak dihitung memotong anggaran'));
    assert.ok(text.includes('Waktu:'));
    assert.ok(text.includes('WIB'));
  });

  it('formatTodayExpensesMessage menyajikan rincian pengeluaran khusus hari ini atau pesan aman', () => {
    // 1. Kondisi belum ada belanja
    const emptyMsg = formatTodayExpensesMessage({
      dateLabel: 'Sabtu, 7 Nov 2026',
      items: [],
      totalAmount: 0,
    });
    assert.ok(emptyMsg.includes('PENGELUARAN HARI INI'));
    assert.ok(emptyMsg.includes('Belum ada pengeluaran yang tercatat hari ini'));

    // 2. Kondisi ada belanja hari ini
    const populatedMsg = formatTodayExpensesMessage({
      dateLabel: 'Sabtu, 7 Nov 2026',
      items: [
        {
          time: '08:30 WIB',
          merchant: 'Tukang Sayur Keliling',
          amount: 45000,
          categoryName: 'Belanja Dapur',
          accountName: 'Dana Istri',
        },
        {
          time: '12:15 WIB',
          merchant: 'Ayam Geprek Mas Eko',
          amount: 28000,
          categoryName: 'Makan & Jajan',
          accountName: 'GoPay Suami',
        },
      ],
      totalAmount: 73000,
    });
    assert.ok(populatedMsg.includes('PENGELUARAN HARI INI'));
    assert.ok(populatedMsg.includes('Tukang Sayur Keliling'));
    assert.ok(populatedMsg.includes('45.000'));
    assert.ok(populatedMsg.includes('Belanja Dapur'));
    assert.ok(populatedMsg.includes('Ayam Geprek Mas Eko'));
    assert.ok(populatedMsg.includes('73.000'));
    assert.ok(populatedMsg.includes('2 transaksi'));
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

  it('findMatchingAccount membedakan akun berdasarkan kombinasi nama dan pemilik (owner)', () => {
    const mockAccounts = [
      { id: '1', name: 'DANA', owner: 'suami', balance: 500000 },
      { id: '2', name: 'DANA', owner: 'istri', balance: 750000 },
      { id: '3', name: 'Bank Jago', owner: 'suami', balance: 2000000 },
    ];

    // Cocok nama & pemilik: istri
    const matchIstri = findMatchingAccount(mockAccounts, 'dana istri');
    assert.ok(matchIstri);
    assert.strictEqual(matchIstri.id, '2');
    assert.strictEqual(matchIstri.owner, 'istri');

    // Cocok nama & pemilik: suami
    const matchSuami = findMatchingAccount(mockAccounts, 'dana suami');
    assert.ok(matchSuami);
    assert.strictEqual(matchSuami.id, '1');
    assert.strictEqual(matchSuami.owner, 'suami');

    // Cocok nama saja
    const matchJago = findMatchingAccount(mockAccounts, 'jago');
    assert.ok(matchJago);
    assert.strictEqual(matchJago.id, '3');

    // Tidak ditemukan
    const matchBca = findMatchingAccount(mockAccounts, 'bca');
    assert.strictEqual(matchBca, null);
  });

  it('getMonthlyRange dan getBudgetPeriodKey menyelaraskan siklus finansial sesuai tanggal gajian', () => {
    // 1. Tanggal gajian default = tgl 1
    const rangeDay1 = getMonthlyRange(0, 1);
    assert.strictEqual(rangeDay1.startDate.getDate(), 1);

    const keyDay1 = getBudgetPeriodKey(new Date(), 1);
    assert.match(keyDay1, /^\d{4}-\d{2}$/);

    // 2. Tanggal gajian tgl 25
    const rangeDay25 = getMonthlyRange(0, 25);
    assert.strictEqual(rangeDay25.startDate.getDate(), 25);
    // Akhir siklus selalu 1 hari sebelum tanggal gajian (tgl 24)
    assert.strictEqual(rangeDay25.endDate.getDate(), 24);
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

    // Pertanyaan Pengeluaran Hari Ini
    const contextWithToday: FinancialContext = {
      ...mockContext,
      todaySpent: 73000,
      todayTransactions: [
        { time: '08:30 WIB', merchant: 'Tukang Sayur', amount: 45000, categoryName: 'Belanja Dapur' },
        { time: '12:15 WIB', merchant: 'Ayam Geprek', amount: 28000, categoryName: 'Makan & Jajan' },
      ],
    };
    const resToday = await processFinancialChatWithAI('berapa pngeluaran hari ini', contextWithToday);
    assert.strictEqual(resToday.type, 'chat_answer');
    assert.ok(resToday.replyText.includes('PENGELUARAN HARI INI'));
    assert.ok(resToday.replyText.includes('Urutan Waktu:'));
    assert.ok(resToday.replyText.includes('Per Kategori:'));
    assert.ok(resToday.replyText.includes('Tukang Sayur'));
    assert.ok(resToday.replyText.includes('45.000'));
    assert.ok(resToday.replyText.includes('73.000'));
  });

  it('isTodayExpenseQuery mengenali berbagai variasi kalimat & typo tanpa menangkap transaksi bernominal', () => {
    assert.strictEqual(isTodayExpenseQuery('berapa pngeluaran hari ini'), true);
    assert.strictEqual(isTodayExpenseQuery('pengeluaran hari ini apa saja?'), true);
    assert.strictEqual(isTodayExpenseQuery('hari ini habis brp'), true);
    assert.strictEqual(isTodayExpenseQuery('rincian blanja hr ini'), true);
    assert.strictEqual(isTodayExpenseQuery('hari ini beli bakso 25rb'), false);
    assert.strictEqual(isTodayExpenseQuery('saldo gopay berapa'), false);
  });

  it('deduplicateSimultaneousExpenses menyatukan 2 notifikasi nominal sama pada waktu bersamaan sebagai pengeluaran Istri', async () => {
    const rawItems = [
      {
        id: 'tx-1',
        merchant: 'PT Tokopedia',
        amount: 25080,
        transaction_date: '2026-11-07T02:15:00.000Z',
        source_device: 'suami',
        categories: { name: 'Kebutuhan Rumah' },
        accounts: { name: 'Dana Suami' },
      },
      {
        id: 'tx-2',
        merchant: 'Jago',
        amount: 13500,
        transaction_date: '2026-11-07T11:05:00.000Z',
        source_device: 'suami',
        categories: { name: 'Lainnya' },
        accounts: { name: 'Dana Suami' },
      },
      {
        id: 'tx-3',
        merchant: 'NURUL HAFIZA RAHIMA',
        amount: 13500,
        transaction_date: '2026-11-07T11:06:10.000Z',
        source_device: 'istri',
        categories: { name: 'Lainnya' },
        accounts: { name: 'Dana Suami' },
      },
    ];

    const mockSupabase = { from: () => ({}) } as any;
    const deduplicated = await deduplicateSimultaneousExpenses(
      mockSupabase,
      'hh-1',
      rawItems,
      { id: 'acc-istri', name: 'Dana Istri' }
    );

    assert.strictEqual(deduplicated.length, 2);
    const merged13500 = deduplicated.find((t) => t.amount === 13500);
    assert.ok(merged13500);
    assert.strictEqual(merged13500.merchant, 'NURUL HAFIZA RAHIMA');
    assert.strictEqual(merged13500.source_device, 'istri');
    assert.strictEqual(merged13500.accounts?.name, 'Dana Istri');
  });

  it('Laporan 11:00 WIB memuat cuaca Yogyakarta, info libur resmi pemerintah, dan motivasi berbeda setiap hari', () => {
    const weather = mapWeatherCodeToIndonesian(1, 20);
    const holiday = getIndonesianHolidayInfo(new Date('2026-11-07T04:00:00Z'));
    const capDay1 = generateDailyDynamicCaption({
      date: new Date('2026-11-07T04:00:00Z'),
      monthPercentage: 45,
      todaySpent: 50000,
      safeDailySpend: 100000,
    });
    const capDay2 = generateDailyDynamicCaption({
      date: new Date('2026-11-08T04:00:00Z'),
      monthPercentage: 45,
      todaySpent: 50000,
      safeDailySpend: 100000,
    });

    assert.notStrictEqual(capDay1, capDay2);
    assert.ok(holiday.summaryText.includes('Libur'));

    const reportMsg = formatDaily11AMReportMessage({
      dateLabel: 'Sabtu, 7 Nov 2026',
      weather: {
        city: 'Yogyakarta',
        temperature: 30,
        minTemp: 24,
        maxTemp: 32,
        rainProbability: 20,
        condition: weather.condition,
        emoji: weather.emoji,
        tip: weather.tip,
      },
      holiday,
      accounts: [
        { name: 'Dana Suami', owner: 'Suami', balance: 1500000 },
        { name: 'Dana Istri', owner: 'Istri', balance: 1200000 },
      ],
      totalBalance: 2700000,
      todayItems: [
        {
          time: '09:15 WIB',
          merchant: 'NURUL HAFIZA RAHIMA',
          amount: 13500,
          categoryName: 'Belanja Dapur',
          accountName: 'Dana Istri',
          ownerLabel: 'Istri',
        },
      ],
      todaySpent: 13500,
      totalSpentMonth: 850000,
      totalBudgetLimit: 3000000,
      monthPercentage: 28,
      daysRemaining: 18,
      safeDailySpend: 119000,
      dailyCaption: capDay1,
    });

    assert.ok(reportMsg.includes('LAPORAN HARIAN PUKUL 11:00 WIB'));
    assert.ok(reportMsg.includes('Cuaca Yogyakarta'));
    assert.ok(reportMsg.includes('Libur'));
    assert.ok(reportMsg.includes('Motivasi Keuangan Hari Ini'));
    assert.ok(reportMsg.includes('NURUL HAFIZA RAHIMA'));
  });

  it('isDirectCategoryFeedback mengenali instruksi koreksi kategori pos belanja', () => {
    assert.strictEqual(isDirectCategoryFeedback('masuk dapur'), true);
    assert.strictEqual(isDirectCategoryFeedback('kategori belanja dapur'), true);
    assert.strictEqual(isDirectCategoryFeedback('ubah ke makan & jajan'), true);
    assert.strictEqual(isDirectCategoryFeedback('ke transportasi'), true);
    assert.strictEqual(isDirectCategoryFeedback('dapur'), true);
    assert.strictEqual(isDirectCategoryFeedback('bukan belanja'), false);
    assert.strictEqual(isDirectCategoryFeedback('ini salah'), false);
  });

  it('getTodayRangeWIB menghasilkan rentang 00:00:00 hingga 23:59:59 WIB secara presisi', () => {
    const range = getTodayRangeWIB(new Date('2026-11-07T12:00:00Z'));
    assert.ok(range.label);
    assert.strictEqual(range.subLabel, 'Hari Ini');
    assert.ok(range.startDate < range.endDate);
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

  it('syncAccountBalance & applyAccountBalanceDelta menghitung saldo idempoten dengan akurat', async () => {
    let currentAccount = { id: 'acc-1', initial_balance: 500000, balance: 500000 };
    const mockTxs = [
      { amount: 150000, direction: 'in', account_id: 'acc-1', status: 'reconciled' },
      { amount: 50000, direction: 'out', account_id: 'acc-1', status: 'reconciled' },
    ];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'accounts') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => {
                  if (val === 'acc-1') {
                    return { data: currentAccount, error: null };
                  }
                  return { data: null, error: { message: 'Not found' } };
                },
              }),
            }),
            update: (payload: { balance: number; initial_balance?: number }) => ({
              eq: async (_col: string, val: string) => {
                if (val === 'acc-1') {
                  currentAccount.balance = payload.balance;
                  if (payload.initial_balance !== undefined) {
                    currentAccount.initial_balance = payload.initial_balance;
                  }
                  return { error: null };
                }
                return { error: { message: 'Not found' } };
              },
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: (_col1: string, val1: string) => ({
                eq: (_col2: string, val2: string) => ({
                  data: mockTxs.filter(t => t.account_id === val1 && t.status === val2),
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as any;

    // 1. Sinkronisasi idempoten: initial (500rb) + in (150rb) - out (50rb) = 600rb
    const res = await syncAccountBalance(mockSupabase, 'acc-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.newBalance, 600000);
    assert.strictEqual(currentAccount.balance, 600000);

    // 2. applyAccountBalanceDelta sebagai wrapper yang kompatibel
    const resDelta = await applyAccountBalanceDelta(mockSupabase, 'acc-1', 100000);
    assert.strictEqual(resDelta.success, true);
    assert.strictEqual(resDelta.newBalance, 600000);

    // 3. Auto-heal: jika initial_balance masih dummy migrasi lama (7.700.000) sedangkan balance nyata 300.000
    currentAccount = { id: 'acc-1', initial_balance: 7700000, balance: 300000 };
    const healRes = await syncAccountBalance(mockSupabase, 'acc-1');
    assert.strictEqual(healRes.success, true);
    assert.strictEqual(healRes.newBalance, 300000);
    assert.strictEqual(currentAccount.balance, 300000);
    // initial_balance + netTx (+100.000) == 300.000 -> initial_balance harus menjadi 200.000
    assert.strictEqual(currentAccount.initial_balance + 100000, 300000);

    // 4. setAccountBalanceToTarget menyelaraskan initial_balance dan balance sekaligus
    const setRes = await setAccountBalanceToTarget(mockSupabase, 'hh-test', 'acc-1', 750000);
    assert.strictEqual(setRes.success, true);
    assert.strictEqual(setRes.newBalance, 750000);
    assert.strictEqual(currentAccount.balance, 750000);
    assert.strictEqual(currentAccount.initial_balance + 100000, 750000);

    // 5. Akun tidak ditemukan
    const resNotFound = await syncAccountBalance(mockSupabase, 'acc-missing');
    assert.strictEqual(resNotFound.success, false);
  });

  it('formatIncomeAlertMessage menyajikan format alert pemasukan yang jelas dan tidak memotong pagu', () => {
    const alertMsg = formatIncomeAlertMessage({
      merchant: 'Bonus Kantor',
      amount: 700000,
      categoryName: 'Gaji/Pemasukan',
      accountName: 'Dana Suami',
      sourceDevice: 'suami',
      isAutoReconciled: true,
    });

    assert.ok(alertMsg.includes('PEMASUKAN DICATAT OTOMATIS'));
    assert.ok(alertMsg.includes('Bonus Kantor'));
    assert.ok(alertMsg.includes('700.000'));
    assert.ok(alertMsg.includes('Dana Suami'));
    assert.ok(alertMsg.includes('Pemasukan menambah total kas keluarga dan tidak memotong pagu anggaran.'));
  });

  it('parseSetSaldoCommand mengenali variasi total kas ganti dan perubahan akun spesifik', () => {
    // 1. Total kas variasi kata dan awalan Rp
    const cmd1 = parseSetSaldoCommand('total kas ganti 1jt');
    assert.deepStrictEqual(cmd1, { accountName: 'total_kas', amount: 1000000 });

    const cmd2 = parseSetSaldoCommand('ganti total kas 2jt');
    assert.deepStrictEqual(cmd2, { accountName: 'total_kas', amount: 2000000 });

    const cmd3 = parseSetSaldoCommand('set total kas 500rb');
    assert.deepStrictEqual(cmd3, { accountName: 'total_kas', amount: 500000 });

    const cmd4 = parseSetSaldoCommand('total kas ganti 1.500.000');
    assert.deepStrictEqual(cmd4, { accountName: 'total_kas', amount: 1500000 });

    const cmdRp = parseSetSaldoCommand('total kas ganti Rp 1jt');
    assert.deepStrictEqual(cmdRp, { accountName: 'total_kas', amount: 1000000 });

    // 2. Akun spesifik (baik awalan set saldo maupun nama akun di depan)
    const cmd5 = parseSetSaldoCommand('ganti saldo dana suami 1jt');
    assert.deepStrictEqual(cmd5, { accountName: 'dana suami', amount: 1000000 });

    const cmd6 = parseSetSaldoCommand('dana suami ganti 1jt');
    assert.deepStrictEqual(cmd6, { accountName: 'dana suami', amount: 1000000 });

    const cmd7 = parseSetSaldoCommand('saldo dana suami ubah 2jt');
    assert.deepStrictEqual(cmd7, { accountName: 'dana suami', amount: 2000000 });

    const cmd8 = parseSetSaldoCommand('jago ganti 500rb');
    assert.deepStrictEqual(cmd8, { accountName: 'jago', amount: 500000 });

    // 3. Pencegahan salah tangkap (guard) terhadap perintah anggaran, gajian, atau transaksi belanja
    assert.strictEqual(parseSetSaldoCommand('set anggaran belanja dapur menjadi 1,5jt'), null);
    assert.strictEqual(parseSetSaldoCommand('ubah anggaran makan 800rb'), null);
    assert.strictEqual(parseSetSaldoCommand('beli baju ganti 150rb'), null);
    assert.strictEqual(parseSetSaldoCommand('bayar tagihan listrik 200rb'), null);
    assert.strictEqual(parseSetSaldoCommand('jajan bakso 25rb'), null);
    assert.strictEqual(parseSetSaldoCommand('set gajian 25'), null);
  });

  it('Batas 64 byte Telegram Callback Query terpenuhi untuk konfirmasi sok, sask, dan tsa', () => {
    const mockTxUuid = '123e4567-e89b-12d3-a456-426614174000';
    const mockAccUuid = '987e6543-e21b-34d5-c678-543210987000';
    const amount = 100000000000; // 100 Milyar

    // 1. sok:<accId>:<amt> (Konfirmasi eksekusi saldo)
    const sokData = `sok:${mockAccUuid}:${amount}`;
    assert.ok(Buffer.byteLength(sokData, 'utf8') <= 64, `Ukuran sok ${sokData.length} byte melebihi batas 64 byte!`);

    // 2. sask:<accId>:<amt> (Pilihan rekening total kas dua langkah)
    const saskData = `sask:${mockAccUuid}:${amount}`;
    assert.ok(Buffer.byteLength(saskData, 'utf8') <= 64, `Ukuran sask ${saskData.length} byte melebihi batas 64 byte!`);

    // 3. tsa:<txId>:<shortAccId> (Pilihan pindah rekening ringkas)
    const tsaData = `tsa:${mockTxUuid}:${mockAccUuid.slice(0, 8)}`;
    assert.ok(Buffer.byteLength(tsaData, 'utf8') <= 64, `Ukuran tsa ${tsaData.length} byte melebihi batas 64 byte!`);
  });

  it('Prioritas pencocokan akun notifikasi mendahulukan device default daripada akun milik pasangan', () => {
    const mockAccounts = [
      { id: 'acc-bca-suami', name: 'BCA Suami', owner: 'suami', type: 'bank' },
      { id: 'acc-dana-istri', name: 'DANA Istri', owner: 'istri', type: 'ewallet' },
      { id: 'acc-tabungan-bersama', name: 'Tabungan Bersama', owner: 'bersama', type: 'bank' },
    ];

    const sourceDevice = 'istri';
    const target = 'bca'.toLowerCase();

    // Prioritas 1: exactMatch (nama bank/wallet cocok dan owner === sourceDevice)
    const exactMatch = mockAccounts.find(a => 
      (target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)) && a.owner === sourceDevice
    );
    // Prioritas 2: sharedMatch (akun bersama)
    const sharedMatch = mockAccounts.find(a =>
      (target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)) &&
      (a.owner === 'bersama' || a.name.toLowerCase().includes('bersama'))
    );
    // Prioritas 3: deviceDefault (akun milik istri)
    const deviceDefault = mockAccounts.find(a => a.owner === sourceDevice);
    // Prioritas 4: nameMatch (apapun pemiliknya, fallback)
    const nameMatch = mockAccounts.find(a =>
      target.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(target)
    );

    // Karena istri tidak punya BCA tapi punya DANA (deviceDefault), jangan masukkan ke BCA Suami!
    const resolvedAccountId = exactMatch?.id || sharedMatch?.id || deviceDefault?.id || nameMatch?.id || mockAccounts[0].id;
    assert.strictEqual(resolvedAccountId, 'acc-dana-istri');
  });

  it('Deteksi kata kunci Top-Up dan pencegahan false-positive transfer ke akun yang sama (Dari: DANA -> Ke: DANA)', () => {
    const checkTopUp = (accountName: string, title: string, content: string, merchant: string, direction: 'in' | 'out') => {
      const currentSourceName = accountName.trim().toLowerCase();
      const cleanMerchantLower = merchant.trim().toLowerCase();
      const isSelfAccountMerchant =
        Boolean(currentSourceName) &&
        Boolean(cleanMerchantLower) &&
        (currentSourceName === cleanMerchantLower ||
          currentSourceName.includes(cleanMerchantLower) ||
          cleanMerchantLower.includes(currentSourceName));

      const textToScan = `${title} ${content} ${merchant}`.toLowerCase();
      const walletMatches = textToScan.match(/\b(gopay|dana|ovo|shopeepay|linkaja|kantong|jago|bca|mandiri|bri|bni|bsi|seabank)\b/gi) || [];
      const hasDistinctTargetWallet = walletMatches.some((w) => !currentSourceName.includes(w.toLowerCase()));

      return (
        !isSelfAccountMerchant &&
        ((/\b(top\s*up|isi\s*saldo|isi\s*ulang)\b/i.test(textToScan) && (hasDistinctTargetWallet || !/\b(gopay|dana|ovo|shopeepay|linkaja)\b/i.test(currentSourceName))) ||
          (/\b(transfer\s*(?:ke)?|trsf)\b/i.test(textToScan) && /\b(gopay|dana|ovo|shopeepay|linkaja|kantong)/i.test(textToScan) && hasDistinctTargetWallet) ||
          (/\b(gopay|dana|ovo|shopeepay|linkaja)\b/i.test(merchant) && direction === 'out'))
      );
    };

    // Valid bank -> e-wallet top-ups
    assert.strictEqual(checkTopUp('BCA', 'BCA Mobile', 'm-Transfer berhasil ke GOPAY 081234567890', 'GOPAY', 'out'), true);
    assert.strictEqual(checkTopUp('Jago', 'Bank Jago', 'Kamu berhasil top up Saldo DANA', 'DANA', 'out'), true);
    assert.strictEqual(checkTopUp('Mandiri', 'Mandiri Livin', 'Transfer TRSF E-BANKING DB OVO', 'OVO', 'out'), true);
    assert.strictEqual(checkTopUp('GoPay', 'GoPay', 'Isi saldo dari Bank BCA sebesar 50.000 berhasil', 'BCA', 'in'), true);

    // Bukan top-up (transfer ke orang lain)
    assert.strictEqual(checkTopUp('BCA', 'BCA Mobile', 'm-Transfer ke Rekening 12345678 Bapak Joko', 'Bapak Joko', 'out'), false);

    // Pencegahan False-Positive: Dari DANA -> Ke DANA (ketika merchant fallback ke DANA atau notif promo internal DANA)
    assert.strictEqual(checkTopUp('DANA', 'DANA', 'Pembayaran Rp 7.500 berhasil', 'DANA', 'out'), false);
    assert.strictEqual(checkTopUp('DANA', 'DANA', 'Yuk isi saldo DANA sekarang Rp 7.500', 'DANA', 'out'), false);
  });

  it('Reply langsung "Ini salah" / "Itu spam" pada pesan alert bot otomatis membatalkan transaksi dan menyelaraskan saldo', async () => {
    assert.strictEqual(isDirectRejectionFeedback('Ini salah'), true);
    assert.strictEqual(isDirectRejectionFeedback('Itu spam'), true);
    assert.strictEqual(isDirectRejectionFeedback('promo iklan'), true);
    assert.strictEqual(isDirectRejectionFeedback('batalkan'), true);
    assert.strictEqual(isDirectRejectionFeedback('halo berapa saldo saya'), false);

    const sampleAlert =
      '🔄 *PERPINDAHAN DANA TERDETEKSI* ✅\n\n' +
      '💰 *Nominal:* `Rp 7.500`\n' +
      '📤 *Dari:* DANA\n' +
      '📥 *Ke:* DANA';
    assert.strictEqual(extractAmountFromBotAlertText(sampleAlert), 7500);

    let updatedStatus = '';
    let updatedNotes = '';
    let updatedDirection = '';
    let updatedMerchant = '';
    const mockTx = {
      id: 'tx-dana-7500',
      merchant: 'Transfer Internal: Top Up DANA',
      amount: 7500,
      direction: 'in',
      account_id: null,
      status: 'pending',
      raw_notification: '[Notifikasi DANA] Promo Voucher DANA Deals Rp 7.500',
    };

    const createChain = () => {
      const chain: any = {
        eq: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: mockTx,
          error: null,
        }),
      };
      return chain;
    };

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'transactions') {
          return {
            select: () => createChain(),
            update: (payload: { status: string; notes?: string; direction?: string; merchant?: string }) => ({
              eq: () => ({
                eq: async () => {
                  updatedStatus = payload.status;
                  updatedNotes = payload.notes || '';
                  updatedDirection = payload.direction || '';
                  updatedMerchant = payload.merchant || '';
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === 'categories') {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ id: 'cat-dapur', name: 'Belanja Dapur' }],
                error: null,
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: 'cat-dapur', name: 'Belanja Dapur' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'learned_promo_rules') {
          return {
            upsert: async () => ({ error: null }),
          };
        }
        return {};
      },
    } as any;

    const savedToken = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const replyMessage = {
        message_id: 202,
        chat: { id: 987654321, type: 'private' },
        date: 1700000000,
        text: 'Ini salah',
        reply_to_message: {
          message_id: 201,
          text: sampleAlert,
        },
      };

      const handled = await handleCustomRejectionReply(replyMessage, mockSupabase, 'hh-test');
      assert.strictEqual(handled, true);
      assert.strictEqual(updatedStatus, 'ignored');
      assert.ok(updatedNotes.includes('Ini salah'));

      // Test Kasus 2.B: Balasan "masuk dapur" langsung memperbarui pos anggaran ke Belanja Dapur
      updatedStatus = '';
      updatedNotes = '';
      const replyCategoryMessage = {
        message_id: 205,
        chat: { id: 987654321, type: 'private' },
        date: 1700000000,
        text: 'masuk dapur',
        reply_to_message: {
          message_id: 201,
          text: sampleAlert,
        },
      };

      const handledCatReply = await handleCustomRejectionReply(replyCategoryMessage, mockSupabase, 'hh-test');
      assert.strictEqual(handledCatReply, true);
      assert.strictEqual(updatedStatus, 'reconciled');
      assert.strictEqual(updatedDirection, 'out');
      assert.strictEqual(updatedMerchant, 'Top Up DANA');
      assert.ok(updatedNotes.includes('Belanja Dapur'));

      // Test Kasus 3: Balasan "Itu spam" ke pesan AI bot umum (bukan alert kartu transaksi)
      updatedStatus = '';
      updatedNotes = '';
      const replyAiMessage = {
        message_id: 204,
        chat: { id: 987654321, type: 'private' },
        date: 1700000010,
        text: 'Itu spam',
        reply_to_message: {
          message_id: 203,
          text: 'Maaf, saya asisten khusus keuangan keluarga Ajian. Saya hanya dapat membantu pencatatan transaksi belanja...',
        },
      };

      const handledAiReply = await handleCustomRejectionReply(replyAiMessage, mockSupabase, 'hh-test');
      assert.strictEqual(handledAiReply, true);
      assert.strictEqual(updatedStatus, 'ignored');
      assert.ok(updatedNotes.includes('Itu spam'));
    } finally {
      if (savedToken) process.env.TELEGRAM_BOT_TOKEN = savedToken;
    }
  });

  it('Kebijakan Tagging Grup: shouldProcessChat hanya aktif jika ditag, reply, slash, atau chat privat', () => {
    // 1. Chat privat selalu diproses (tanpa perlu tag)
    const privateMsg = { message_id: 1, chat: { id: 101, type: 'private' }, date: 1700000000 };
    assert.strictEqual(shouldProcessChat(privateMsg, 'saldo gopay berapa?'), true);

    // 2. Chat grup tanpa tag/reply/slash -> DIAM / FALSE (silent drop)
    const groupMsg = { message_id: 2, chat: { id: -100123, type: 'group' }, date: 1700000000 };
    assert.strictEqual(shouldProcessChat(groupMsg, 'Kalo anggaran dapur sisa berapa?'), false);
    assert.strictEqual(shouldProcessChat(groupMsg, 'saldo rekening kamu berapa ma?'), false);
    assert.strictEqual(shouldProcessChat(groupMsg, 'halo semuanya'), false);

    // 3. Chat grup dengan mention bot (@...) -> TRUE
    assert.strictEqual(shouldProcessChat(groupMsg, '@KeuanganAjianBot Kalo anggaran dapur sisa berapa?'), true);
    assert.strictEqual(shouldProcessChat(groupMsg, 'Kalo anggaran dapur sisa berapa? @KeuanganAjianBot'), true);

    // 4. Chat grup dengan reply ke pesan bot -> TRUE
    const groupReplyMsg = {
      message_id: 3,
      chat: { id: -100123, type: 'supergroup' },
      date: 1700000000,
      reply_to_message: { message_id: 99, text: 'Halo!' },
    };
    assert.strictEqual(shouldProcessChat(groupReplyMsg, 'Kalo anggaran dapur sisa berapa?'), true);

    // 5. Chat grup dengan perintah slash (/status, /anggaran, /rekap) -> TRUE
    assert.strictEqual(shouldProcessChat(groupMsg, '/status'), true);
    assert.strictEqual(shouldProcessChat(groupMsg, '/anggaran'), true);
  });

  it('stripBotMentions membersihkan username mention (@...) dari query chat', () => {
    assert.strictEqual(stripBotMentions('@KeuanganAjianBot saldo gopay berapa?'), 'saldo gopay berapa?');
    assert.strictEqual(stripBotMentions('set anggaran makan 500rb @KeuanganAjianBot'), 'set anggaran makan 500rb');
    assert.strictEqual(stripBotMentions('@bot1 @bot2 halo'), 'halo');
  });

  it('Guardrail Topik Finansial: menolak pertanyaan di luar keuangan dan menjawab pertanyaan finansial', () => {
    const mockContext: FinancialContext = {
      accounts: [{ name: 'GoPay', owner: 'Suami', balance: 50000 }],
      totalBalance: 50000,
      totalSpentMonth: 100000,
      totalBudgetLimit: 1000000,
      daysRemaining: 10,
      safeDailySpend: 90000,
      categoryBudgets: [{ name: 'Belanja Dapur', spent: 50000, limit: 500000, remaining: 450000 }],
      periodLabel: 'November 2026',
    };

    // 1. Pertanyaan di luar keuangan -> off_topic
    const resResep = handleLocalDeterministicFallback('resep nasi goreng kampung yang enak apa ya?', mockContext);
    assert.strictEqual(resResep.type, 'off_topic');
    assert.ok(resResep.replyText.includes('asisten khusus keuangan'));

    const resCuaca = handleLocalDeterministicFallback('besok ramalan cuaca di jakarta hujan nggak?', mockContext);
    assert.strictEqual(resCuaca.type, 'off_topic');
    assert.ok(resCuaca.replyText.includes('asisten khusus keuangan'));

    // 2. Pertanyaan finansial keluarga -> chat_answer dengan data riil
    const resSaldo = handleLocalDeterministicFallback('saldo gopay berapa?', mockContext);
    assert.strictEqual(resSaldo.type, 'chat_answer');
    assert.ok(resSaldo.replyText.includes('50.000'));

    const resAnggaran = handleLocalDeterministicFallback('sisa anggaran belanja dapur berapa?', mockContext);
    assert.strictEqual(resAnggaran.type, 'chat_answer');
    assert.ok(resAnggaran.replyText.includes('450.000'));
  });

  it('Pusat Pengaturan Telegram (/pengaturan): Menu Hub, Batas 64 Byte Callback, & Manajemen Akun', async () => {
    // 1. Validasi Format Menu Pengaturan
    const menuText = formatSettingsHubMenuText();
    assert.ok(menuText.includes('PUSAT PENGATURAN KEUANGAN KELUARGA'));
    assert.ok(menuText.includes('Rekening & Saldo'));
    assert.ok(menuText.includes('Pagu Anggaran'));
    assert.ok(menuText.includes('Tanggal Gajian'));

    // 2. Validasi Batas 64 Byte untuk Semua Tombol Menu Utama
    const kb = getSettingsHubInlineKeyboard();
    for (const row of kb.inline_keyboard) {
      for (const btn of row) {
        assert.ok(
          Buffer.byteLength(btn.callback_data, 'utf8') <= 64,
          `callback_data ${btn.callback_data} melebihi batas 64 byte!`
        );
      }
    }

    // 3. Validasi Batas 64 Byte Tombol Sub-Menu Dinamis
    const sampleCatCallback = 'cfg:bset:b-dapur:1500000';
    assert.ok(Buffer.byteLength(sampleCatCallback, 'utf8') <= 64);

    const samplePaydayCallback = 'cfg:pset:25';
    assert.ok(Buffer.byteLength(samplePaydayCallback, 'utf8') <= 64);

    const sampleSpamDelCallback = 'cfg:sdel:12345678';
    assert.ok(Buffer.byteLength(sampleSpamDelCallback, 'utf8') <= 64);

    const sampleCategoryCallback = 'tsc:123e4567-e89b-12d3-a456-426614174000:b-dapur';
    assert.ok(Buffer.byteLength(sampleCategoryCallback, 'utf8') <= 64);

    const sampleCategoryMenuCallback = 'tx_cat:123e4567-e89b-12d3-a456-426614174000';
    assert.ok(Buffer.byteLength(sampleCategoryMenuCallback, 'utf8') <= 64);

    const sampleBalanceEditCallback = 'cfg:abaledit:12345678';
    assert.ok(Buffer.byteLength(sampleBalanceEditCallback, 'utf8') <= 64);

    // 4. Pengujian Perintah Chat Tambah & Nonaktifkan Akun
    let insertedAcc: any = null;
    let deactivatedId: string | null = null;
    const mockAccounts = [
      { id: 'acc-1', name: 'Tabungan BRI', owner: 'suami', balance: 500000, is_active: true },
    ];

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'accounts') {
          return {
            insert: (payload: any) => ({
              select: () => ({
                single: async () => {
                  insertedAcc = payload;
                  return { data: { id: 'new-acc', ...payload }, error: null };
                },
              }),
            }),
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: mockAccounts,
                  error: null,
                }),
              }),
            }),
            update: (payload: any) => ({
              eq: (col: string, val: string) => ({
                eq: async () => {
                  if (payload.is_active === false) {
                    deactivatedId = val;
                  }
                  return { error: null };
                },
              }),
            }),
          };
        }
        return {};
      },
    } as any;

    // Test tambah akun
    const addRes = await handleAccountTextCommands(
      'tambah akun Tabungan BCA suami 5jt',
      987654321,
      101,
      mockSupabase,
      'hh-test'
    );
    assert.strictEqual(addRes, true);
    assert.ok(insertedAcc);
    assert.strictEqual(insertedAcc.name, 'Tabungan BCA');
    assert.strictEqual(insertedAcc.owner, 'suami');
    assert.strictEqual(insertedAcc.initial_balance, 5000000);

    // Test nonaktifkan akun
    const deactRes = await handleAccountTextCommands(
      'nonaktifkan akun BRI',
      987654321,
      102,
      mockSupabase,
      'hh-test'
    );
    assert.strictEqual(deactRes, true);
    assert.strictEqual(deactivatedId, 'acc-1');
  });
});

