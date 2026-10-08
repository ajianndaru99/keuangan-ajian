import { describe, expect, it } from 'vitest';
import { parseLivinNotification } from './livin.ts';

// CATATAN: semua teks di bawah SINTETIS (kosakata umum bank Indonesia), bukan teks asli Livin.
// Setelah Fase 0, tambahkan kasus dari teks nyata (nominal/nama boleh disamarkan).

const OPTIONS = { now: new Date('2026-10-08T03:00:00.000Z') };
const RECEIVED = '2026-10-08T08:30:00+07:00';

const run = (title: string, text: string, receivedAt: string | number = RECEIVED) =>
  parseLivinNotification(title, text, receivedAt, OPTIONS);

describe('transaksi valid', () => {
  it.each([
    {
      name: 'transfer keluar dengan nama bank di kurung',
      title: 'Transfer Berhasil',
      text: 'Transfer Rp 50.000 ke Bpk Budi (BCA) berhasil.',
      expected: { direction: 'out', amount: 50_000, merchant: 'Bpk Budi' },
    },
    {
      name: '"dari rekening Anda" tetap uang keluar',
      title: 'Transfer Berhasil',
      text: 'Transfer Rp 50.000 ke Budi dari rekening Anda',
      expected: { direction: 'out', amount: 50_000, merchant: 'Budi' },
    },
    {
      name: 'pembayaran dari rekening Anda ke merchant bernomor',
      title: '',
      text: 'Pembayaran Rp 50.000 dari rekening Anda ke Indomaret 1234 berhasil',
      expected: { direction: 'out', amount: 50_000, merchant: 'Indomaret 1234' },
    },
    {
      name: 'nominal di tengah kalimat tidak ikut jadi nama',
      title: '',
      text: 'Transfer ke Budi sebesar Rp 50.000 berhasil',
      expected: { direction: 'out', amount: 50_000, merchant: 'Budi' },
    },
    {
      name: 'dana masuk',
      title: '',
      text: 'Dana masuk Rp 1.000.000 dari Siti',
      expected: { direction: 'in', amount: 1_000_000, merchant: 'Siti' },
    },
    {
      name: 'QRIS dengan simbol & di nama merchant',
      title: '',
      text: 'Pembayaran QRIS ke KFC & Co berhasil Rp 85.000',
      expected: { direction: 'out', amount: 85_000, merchant: 'KFC & Co' },
    },
    {
      name: 'nama berawalan PT.',
      title: '',
      text: 'Pembayaran ke PT. Sinar Jaya berhasil Rp 150.000',
      expected: { direction: 'out', amount: 150_000, merchant: 'PT. Sinar Jaya' },
    },
    {
      name: 'nominal dengan ,00',
      title: '',
      text: 'Pembayaran Rp 50.000,00 ke Toko A berhasil',
      expected: { direction: 'out', amount: 50_000, merchant: 'Toko A' },
    },
    {
      name: '"dari saldo" bukan sisa saldo',
      title: '',
      text: 'Pembayaran dari saldo Rp 50.000 ke Toko A berhasil',
      expected: { direction: 'out', amount: 50_000, merchant: 'Toko A' },
    },
    {
      name: 'top up dari rekening bank = uang keluar',
      title: '',
      text: 'Top up GoPay Rp 100.000 berhasil',
      expected: { direction: 'out', amount: 100_000, merchant: null },
    },
    {
      name: 'peringatan umum jangan berikan rekening tidak menggagalkan transaksi sah',
      title: 'Transfer Berhasil',
      text: 'Transfer Rp 75.000 ke Budi berhasil. Jangan berikan data rekening kepada siapapun',
      expected: { direction: 'out', amount: 75_000, merchant: 'Budi' },
    },
  ])('$name', ({ title, text, expected }) => {
    const result = run(title, text);
    expect(result).toMatchObject({ outcome: 'transaction', isValid: true, reasons: [], ...expected });
    expect(result.transactionDate).toBe('2026-10-08T01:30:00.000Z');
  });

  it('biaya admin dan saldo masuk otherAmounts, bukan nominal transaksi', () => {
    const result = run(
      'Transfer Berhasil',
      'Transfer Rp 100.000 berhasil. Biaya admin Rp 2.500. Sisa saldo Rp 5.000.000',
    );
    expect(result).toMatchObject({ outcome: 'transaction', direction: 'out', amount: 100_000 });
    expect(result.otherAmounts.map((m) => [m.label, m.value])).toEqual([
      ['fee', 2_500],
      ['balance', 5_000_000],
    ]);
  });

  it('kata cashback pada transaksi sukses hanya jadi peringatan', () => {
    const result = run('', 'Pembayaran Rp 50.000 ke Toko A berhasil. Dapatkan cashback Rp 5.000');
    expect(result).toMatchObject({ outcome: 'transaction', amount: 50_000 });
    expect(result.warnings).toContain('promo_keyword_present');
    expect(result.otherAmounts.map((m) => [m.label, m.value])).toEqual([['cashback', 5_000]]);
  });
});

describe('diabaikan (bukan transaksi)', () => {
  it.each([
    ['OTP', '', 'Kode OTP 123456 untuk transaksi Rp 100.000. Jangan berikan kode ini', 'sensitive_content'],
    ['promo cashback', '', 'Cashback Rp 50.000 untuk kamu! Belanja sekarang', 'promo'],
    ['promo diskon', 'Promo Spesial', 'Diskon hingga Rp 100.000 untuk transaksi pertama', 'promo'],
    ['transaksi gagal', '', 'Transfer Rp 100.000 ke Budi gagal. Saldo Rp 2.500.000', 'status_failed'],
    ['transaksi diproses', '', 'Transfer Rp 100.000 ke Budi sedang diproses', 'status_pending'],
    ['tanpa nominal', '', 'Transfer ke Budi berhasil', 'no_amount'],
    ['kosong', '', '', 'empty_notification'],
  ])('%s', (_name, title, text, reason) => {
    const result = run(title, text);
    expect(result).toMatchObject({ outcome: 'ignored', isValid: false, reasons: [reason], amount: null });
  });

  it('OTP ditandai sensitive agar teks mentahnya tidak disimpan', () => {
    expect(run('', 'Kode OTP 123456 untuk transaksi Rp 100.000').sensitive).toBe(true);
    expect(run('', 'Kode O\u200BTP Anda 123456').sensitive).toBe(true);
    expect(run('', 'Kode ＯＴＰ Anda 123456').sensitive).toBe(true);
    expect(run('', 'Cashback Rp 50.000 untuk kamu!').sensitive).toBe(false);
  });
});

describe('perlu dicek (tidak menebak)', () => {
  it.each([
    ['koma ribuan 1,500,000', '', 'Pembayaran Rp 1,500,000 ke Toko A berhasil', 'amount_unrecognized_format'],
    ['koma ribuan 50,000', '', 'Pembayaran Rp 50,000 ke Toko A berhasil', 'amount_unrecognized_format'],
    ['sinyal masuk dan keluar bersamaan', '', 'Anda menerima pembayaran Rp 50.000 dari Toko A', 'direction_conflict'],
    ['arah tidak diketahui', '', 'Transaksi Rp 75.000 berhasil', 'direction_unknown'],
    ['status tidak diketahui', '', 'Pembayaran Rp 85.000 ke KFC', 'status_unknown'],
    ['dua nominal utama', 'Transfer Berhasil', 'Rp 50.000 ke Budi, Rp 60.000 ke Siti', 'multiple_main_amounts'],
    ['hanya ada saldo', 'Transfer Berhasil', 'Sisa saldo Rp 5.000.000', 'no_main_amount'],
  ])('%s', (_name, title, text, reason) => {
    const result = run(title, text);
    expect(result.outcome).toBe('needs_review');
    expect(result.isValid).toBe(false);
    expect(result.reasons).toContain(reason);
  });

  it('refund: arah masuk, tapi kategorinya diputuskan manual', () => {
    expect(run('', 'Dana dikembalikan Rp 50.000 dari transaksi gagal')).toMatchObject({
      outcome: 'needs_review',
      status: 'refund',
      direction: 'in',
      amount: 50_000,
      reasons: ['refund_needs_classification'],
    });
  });

  it('nominal tetap terisi jika masalahnya hanya di tanggal', () => {
    expect(run('', 'Pembayaran Rp 50.000 ke Toko A berhasil', 'kemarin')).toMatchObject({
      outcome: 'needs_review',
      amount: 50_000,
      transactionDate: null,
      reasons: ['received_at_invalid'],
    });
  });

  it('nominal gagal-baca tidak pernah menjadi angka tebakan', () => {
    expect(run('', 'Pembayaran Rp 1,500,000 ke Toko A berhasil').amount).toBeNull();
  });
});

describe('metadata', () => {
  it('menyertakan versi parser dan nama akun', () => {
    expect(run('', 'Dana masuk Rp 10.000 dari Siti')).toMatchObject({
      bank: 'livin',
      accountName: 'Livin Mandiri',
      parserVersion: 'livin-0.1.0',
    });
  });

  it('isValid selalu sama dengan outcome === transaction', () => {
    const samples: Array<[string, string]> = [
      ['', 'Dana masuk Rp 10.000 dari Siti'],
      ['', 'Kode OTP 1 Rp 1.000'],
      ['', 'Transaksi Rp 75.000 berhasil'],
    ];
    for (const [title, text] of samples) {
      const result = run(title, text);
      expect(result.isValid).toBe(result.outcome === 'transaction');
    }
  });
});
