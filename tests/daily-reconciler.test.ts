import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRemainingQuota,
  getJakartaDateString,
  cleanGeminiReconciliationJson,
  runLocalRuleBasedReconciliation,
  analyzeDailyTransactionsWithGemini,
  formatTransactionsForPrompt,
} from '../src/lib/ai/daily-reconciler.ts';
import type { CompactTransactionItem } from '../src/lib/ai/daily-reconciler.ts';

describe('Daily AI Reconciler: Pembatasan Kuota & Logika Parsing', () => {
  it('calculateRemainingQuota menghitung sisa kuota harian maksimal 2x dengan tepat', () => {
    // 0 pemanggilan -> Sisa 2, bisa jalan
    const quota0 = calculateRemainingQuota(0);
    assert.strictEqual(quota0.remaining, 2);
    assert.strictEqual(quota0.canRun, true);

    // 1 pemanggilan (misal manual) -> Sisa 1, masih bisa 1x lagi (cron 23.00)
    const quota1 = calculateRemainingQuota(1);
    assert.strictEqual(quota1.remaining, 1);
    assert.strictEqual(quota1.canRun, true);

    // 2 pemanggilan -> Sisa 0, terkunci
    const quota2 = calculateRemainingQuota(2);
    assert.strictEqual(quota2.remaining, 0);
    assert.strictEqual(quota2.canRun, false);

    // Kasus defensif jika lebih dari 2 pemanggilan
    const quota3 = calculateRemainingQuota(3);
    assert.strictEqual(quota3.remaining, 0);
    assert.strictEqual(quota3.canRun, false);
  });

  it('getJakartaDateString menghasilkan format YYYY-MM-DD yang valid', () => {
    const testDate = new Date('2026-10-21T01:30:00.000Z'); // 08:30 WIB
    const dateStr = getJakartaDateString(testDate);
    assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(dateStr, '2026-10-21');
  });

  it('cleanGeminiReconciliationJson membersihkan markdown codeblock dengan aman', () => {
    const rawMarkdown = `\`\`\`json
{
  "internalTransfers": [
    { "outTxId": "tx-1", "inTxId": "tx-2", "confidence": 95, "reason": "Transfer suami ke istri" }
  ],
  "duplicates": [
    { "keepTxId": "tx-3", "ignoreTxId": "tx-4", "reason": "Notifikasi konfirmasi kedua bank digital" }
  ],
  "reconciled": [
    { "txId": "tx-5", "categoryName": "Makan & Jajan", "reason": "Pembelian kopi" }
  ],
  "ignored": [],
  "needsReview": []
}
\`\`\``;

    const result = cleanGeminiReconciliationJson(rawMarkdown);
    assert.strictEqual(result.internalTransfers.length, 1);
    assert.strictEqual(result.internalTransfers[0].outTxId, 'tx-1');
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].ignoreTxId, 'tx-4');
    assert.strictEqual(result.reconciled.length, 1);
  });

  it('cleanGeminiReconciliationJson menangani string rusak tanpa exception', () => {
    const broken = 'bukan json sama sekali';
    const result = cleanGeminiReconciliationJson(broken);
    assert.strictEqual(result.internalTransfers.length, 0);
    assert.strictEqual(result.duplicates.length, 0);
    assert.strictEqual(result.reconciled.length, 0);
  });

  it('formatTransactionsForPrompt memetakan data transaksi ke format kompak', () => {
    const rawTxs = [
      {
        id: 'tx-10',
        transaction_date: '2026-10-21T07:15:00.000Z',
        amount: 50000,
        direction: 'out',
        merchant: 'Kopi Kenangan',
        source_device: 'suami',
        raw_notification: 'Pembayaran Rp 50.000 berhasil',
        accounts: { name: 'Bank Jago' },
      },
    ];

    const formatted = formatTransactionsForPrompt(rawTxs);
    assert.strictEqual(formatted.length, 1);
    assert.strictEqual(formatted[0].id, 'tx-10');
    assert.strictEqual(formatted[0].amount, 50000);
    assert.strictEqual(formatted[0].direction, 'out');
    assert.strictEqual(formatted[0].account, 'Bank Jago (suami)');
  });

  it('runLocalRuleBasedReconciliation mendeteksi pasangan transfer internal dan konfirmasi dobel', () => {
    const mockItems: CompactTransactionItem[] = [
      // 1 pasang internal transfer
      {
        id: 'out-1',
        time: '10:00',
        account: 'BCA (suami)',
        direction: 'out',
        amount: 250000,
        merchant: 'Transfer ke Istri',
        text: 'Transfer Rp 250.000 ke Istri berhasil',
      },
      {
        id: 'in-1',
        time: '10:01',
        account: 'Jago (istri)',
        direction: 'in',
        amount: 250000,
        merchant: 'Transfer dari Suami',
        text: 'Uang masuk Rp 250.000 dari Suami',
      },
      // 1 pasang konfirmasi ganda di bank yang sama
      {
        id: 'dup-keep',
        time: '12:30',
        account: 'Bank Jago (suami)',
        direction: 'out',
        amount: 35000,
        merchant: 'Kopi Tuku',
        text: 'Pembayaran Rp 35.000 berhasil',
      },
      {
        id: 'dup-ignore',
        time: '12:30',
        account: 'Bank Jago (suami)',
        direction: 'out',
        amount: 35000,
        merchant: 'Kopi Tuku',
        text: 'Debit rekening Rp 35.000 selesai',
      },
      // 1 transaksi belanja riil
      {
        id: 'real-1',
        time: '15:00',
        account: 'Bank Jago (suami)',
        direction: 'out',
        amount: 75000,
        merchant: 'Superindo',
        text: 'Pembayaran QRIS Rp 75.000 di Superindo',
      },
      // 1 transaksi Rp 0 (promo/chat)
      {
        id: 'zero-1',
        time: '16:00',
        account: 'ShopeePay (istri)',
        direction: 'out',
        amount: 0,
        merchant: 'Shopee',
        text: 'Diskon 50% hingga 10rb!',
      },
    ];

    const result = runLocalRuleBasedReconciliation(mockItems, ['Belanja Dapur', 'Makan & Jajan']);

    // Verifikasi pasangan transfer internal
    assert.strictEqual(result.internalTransfers.length, 1);
    assert.strictEqual(result.internalTransfers[0].outTxId, 'out-1');
    assert.strictEqual(result.internalTransfers[0].inTxId, 'in-1');

    // Verifikasi duplikat terdeteksi
    assert.strictEqual(result.duplicates.length, 1);
    assert.strictEqual(result.duplicates[0].keepTxId, 'dup-keep');
    assert.strictEqual(result.duplicates[0].ignoreTxId, 'dup-ignore');

    // Verifikasi transaksi riil direconcile
    const isRealReconciled = result.reconciled.some((r) => r.txId === 'real-1');
    assert.strictEqual(isRealReconciled, true);

    // Verifikasi transaksi Rp 0 diabaikan
    const isZeroIgnored = result.ignored.some((ig) => ig.txId === 'zero-1');
    assert.strictEqual(isZeroIgnored, true);
  });

  it('analyzeDailyTransactionsWithGemini fallback aman saat API key kosong', async () => {
    const mockItems: CompactTransactionItem[] = [
      {
        id: 'tx-test',
        time: '09:00',
        account: 'BCA (suami)',
        direction: 'out',
        amount: 15000,
        merchant: 'Warung',
        text: 'Transfer Rp 15.000',
      },
    ];

    const res = await analyzeDailyTransactionsWithGemini(mockItems, ['Makan & Jajan'], '');
    assert.strictEqual(res.reconciled.length, 1);
    assert.strictEqual(res.reconciled[0].txId, 'tx-test');
  });
});
