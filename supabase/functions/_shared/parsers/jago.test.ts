import { describe, expect, it } from 'vitest';
import { parseJagoNotification } from './jago.ts';

const OPTIONS = { now: new Date('2026-10-08T03:00:00.000Z') };
const RECEIVED = '2026-10-08T09:01:00+07:00';

const run = (title: string, text: string, receivedAt: string | number = RECEIVED) =>
  parseJagoNotification(title, text, receivedAt, OPTIONS);

describe('Bank Jago - Transaksi Valid dari Notifikasi Nyata', () => {
  it('berhasil mem-parse transfer keluar: "You\'ve transferred Rp50.000 to NURUL"', () => {
    const result = run('Jago', "You've transferred Rp50.000 to NURUL");
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'jago',
      direction: 'out',
      amount: 50_000,
      merchant: 'NURUL',
    });
  });

  it('berhasil mem-parse transaksi belanja: "RATIH CITRA SASTINALA spent Rp50.000"', () => {
    const result = run('Jago', 'RATIH CITRA SASTINALA spent Rp50.000');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'jago',
      direction: 'out',
      amount: 50_000,
    });
  });

  it('berhasil mem-parse transaksi belanja dengan merchant: "RATIH CITRA SASTINALA spent Rp50.000 at Indomaret"', () => {
    const result = run('Jago', 'RATIH CITRA SASTINALA spent Rp50.000 at Indomaret');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'jago',
      direction: 'out',
      amount: 50_000,
      merchant: 'Indomaret',
    });
  });

  it('berhasil mem-parse uang masuk: "You received Rp100.000 from BUDI"', () => {
    const result = run('Jago', 'You received Rp100.000 from BUDI');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'jago',
      direction: 'in',
      amount: 100_000,
      merchant: 'BUDI',
    });
  });

  it('berhasil mem-parse pembayaran merchant: "You have paid Rp 25.000 to Ajian Store. Need help? Contact Tanya Jago at 1500 746."', () => {
    const result = run('Jago', 'You have paid Rp 25.000 to Ajian Store. Need help? Contact Tanya Jago at 1500 746.');
    expect(result).toMatchObject({
      outcome: 'transaction',
      isValid: true,
      bank: 'jago',
      direction: 'out',
      amount: 25_000,
      merchant: 'Ajian Store',
    });
  });
});

