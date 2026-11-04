import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateProgressBar,
  formatStatusMessage,
  formatAnggaranMessage,
  formatRekapMessage,
  formatInboxMessage,
  formatHelpMessage,
  formatWeeklyDigestNudge,
  formatPayYourselfFirstNudge,
  formatBillReminderNudge,
  formatMidMonthNudge,
  formatOverbudgetAlert,
} from '../src/lib/telegram/formatters.ts';
import {
  isChatIdAllowed,
  getAllowedChatIds,
  isTelegramConfigured,
  sendTelegramMessage,
} from '../src/lib/telegram/bot.ts';

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

  it('formatAnggaranMessage memuat progress bar untuk daftar kategori', () => {
    const text = formatAnggaranMessage(
      [
        { name: 'Belanja Dapur', emoji: '🛒', spent: 1500000, limit: 2000000, percentage: 75 },
        { name: 'Makan & Jajan', emoji: '🍔', spent: 850000, limit: 1000000, percentage: 85 },
      ],
      'November 2026'
    );

    assert.ok(text.includes('STATUS KUOTA ANGGARAN KELUARGA'));
    assert.ok(text.includes('Belanja Dapur'));
    assert.ok(text.includes('Makan & Jajan'));
    assert.ok(text.includes('75%'));
    assert.ok(text.includes('85%'));
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
});

