import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatWibDateParts, buildSheetTransactionRow } from '../src/lib/spreadsheet/sheets-sync.ts';

describe('Google Spreadsheet Sync Helpers', () => {
  test('formatWibDateParts mengonversi timestamp UTC ke tanggal & jam WIB', () => {
    const res = formatWibDateParts('2026-10-12T10:15:00.000Z');
    assert.equal(res.tanggal, '2026-10-12');
    assert.equal(res.waktu, '17:15');
  });

  test('buildSheetTransactionRow memisahkan arah Masuk, Keluar, dan Transfer Internal', () => {
    const transfer = buildSheetTransactionRow({
      id: 'tx-1',
      transaction_date: '2026-10-12T03:00:00.000Z',
      account_name: 'Bank Jago',
      direction: 'out',
      amount: 50000,
      merchant: 'Transfer Internal: Bank Jago ➔ GoPay',
      status: 'reconciled',
    });
    assert.equal(transfer.arah, 'Transfer Internal');
    assert.equal(transfer.kategori, 'Transfer Internal');
    assert.equal(transfer.nominal, 50000);

    const jajan = buildSheetTransactionRow({
      id: 'tx-2',
      transaction_date: '2026-10-12T04:00:00.000Z',
      account_name: 'GoPay',
      direction: 'out',
      amount: 18000,
      merchant: 'Kopi Kenangan',
      category_name: 'Jajan',
      status: 'reconciled',
    });
    assert.equal(jajan.arah, 'Keluar');
    assert.equal(jajan.kategori, 'Jajan');
  });
});
