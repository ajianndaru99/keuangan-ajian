import { describe, expect, it } from 'vitest';
import { parseSeabankNotification } from './seabank.ts';

const OPTIONS = { now: new Date('2026-10-16T03:00:00.000Z') };
const RECEIVED = '2026-10-16T09:00:00+07:00';

const run = (title: string, text: string, receivedAt: string | number = RECEIVED) =>
  parseSeabankNotification(title, text, receivedAt, OPTIONS);

describe('SeaBank - Transaksi Valid dari Notifikasi', () => {
  it('berhasil mem-parse transfer keluar: "Transfer Berhasil! Kamu telah mentransfer Rp 50.000 ke BUDI"', () => {
    const result = run('Transfer Berhasil', 'Kamu telah mentransfer Rp 50.000 ke BUDI');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'seabank',
      direction: 'out',
      amount: 50_000,
      merchant: 'BUDI',
    });
  });

  it('berhasil mem-parse uang masuk: "Transfer Berhasil! Kamu menerima transfer sebesar Rp 100.000 dari SITI"', () => {
    const result = run('Transfer Berhasil', 'Kamu menerima transfer sebesar Rp 100.000 dari SITI');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'seabank',
      direction: 'in',
      amount: 100_000,
      merchant: 'SITI',
    });
  });

  it('berhasil mem-parse pembayaran QRIS: "Pembayaran Berhasil! Pembayaran QRIS sebesar Rp 25.000 ke Kopi Kenangan berhasil."', () => {
    const result = run('Pembayaran Berhasil', 'Pembayaran QRIS sebesar Rp 25.000 ke Kopi Kenangan berhasil.');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'seabank',
      direction: 'out',
      amount: 25_000,
      merchant: 'Kopi Kenangan',
    });
  });

  it('berhasil mem-parse notifikasi SeaBank dengan judul SeaBank', () => {
    const result = run('SeaBank', 'Transfer masuk sebesar Rp 75.000 dari AHMAD berhasil');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'seabank',
      direction: 'in',
      amount: 75_000,
      merchant: 'AHMAD',
    });
  });
});
