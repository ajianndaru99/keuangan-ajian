import { describe, expect, it } from 'vitest';
import { extractCounterparty, extractReference, normalizeText, parseReceivedAt } from './fields.ts';

const NOW = new Date('2026-10-08T03:00:00.000Z');

describe('normalizeText', () => {
  it('mengubah baris baru jadi pemisah dan merapatkan spasi', () => {
    expect(normalizeText('  Transfer\u00A0Berhasil \n Rp   50.000  ')).toBe('Transfer Berhasil | Rp 50.000');
  });

  it('membersihkan zero-width space dan menormalkan full-width karakter (NFKC)', () => {
    expect(normalizeText('Kode O\u200BTP')).toBe('Kode OTP');
    expect(normalizeText('Kode ＯＴＰ')).toBe('Kode OTP');
  });
});

describe('extractCounterparty', () => {
  it.each([
    ['out', 'Transfer Rp 50.000 ke Bpk Budi (BCA) berhasil.', 'Bpk Budi'],
    ['out', 'Transfer ke Budi sebesar Rp 50.000 berhasil', 'Budi'],
    ['out', 'Pembayaran Rp 50.000 dari rekening Anda ke Indomaret 1234 berhasil', 'Indomaret 1234'],
    ['out', 'Pembayaran QRIS ke KFC & Co berhasil Rp 85.000', 'KFC & Co'],
    ['out', 'Pembayaran ke PT. Sinar Jaya berhasil Rp 150.000', 'PT. Sinar Jaya'],
    ['out', 'Transfer ke Budi.', 'Budi'],
    ['in', 'Dana masuk Rp 1.000.000 dari Siti', 'Siti'],
    ['in', 'Transfer masuk Rp 50.000 dari Siti ke rekening Anda', 'Siti'],
  ] as const)('%s: "%s" → %s', (direction, text, expected) => {
    expect(extractCounterparty(text, direction)).toBe(expected);
  });

  it.each([
    ['out', 'Transfer masuk ke rekening Anda'], // rekening sendiri
    ['out', 'Pembayaran berhasil'], // tidak ada nama
    ['unknown', 'Transfer ke Budi'], // arah belum pasti → tidak menebak
  ] as const)('mengembalikan null: %s "%s"', (direction, text) => {
    expect(extractCounterparty(text, direction)).toBeNull();
  });
});

describe('extractReference', () => {
  it('membaca nomor referensi yang memuat angka', () => {
    expect(extractReference('Transfer berhasil. No. Ref: 20261008ABC123')).toBe('20261008ABC123');
  });

  it('mengabaikan kata mirip "ref" tanpa nomor', () => {
    expect(extractReference('Ajak teman dengan kode referral')).toBeNull();
  });
});

describe('parseReceivedAt', () => {
  const WIB_0830_IN_UTC = '2026-10-08T01:30:00.000Z';

  it.each([
    ['epoch milidetik', String(Date.parse(WIB_0830_IN_UTC))],
    ['epoch detik', String(Date.parse(WIB_0830_IN_UTC) / 1000)],
    ['ISO dengan offset', '2026-10-08T08:30:00+07:00'],
    ['offset tanpa titik dua', '2026-10-08T08:30:00+0700'],
    ['ISO UTC', '2026-10-08T01:30:00Z'],
    ['tanpa zona → dianggap WIB', '2026-10-08 08:30:00'],
  ])('menerima %s', (_name, input) => {
    expect(parseReceivedAt(input, { now: NOW })).toEqual({ iso: WIB_0830_IN_UTC });
  });

  it.each([
    ['teks bebas', 'kemarin'],
    ['tanggal ambigu', '10/08/2026 08:30'],
    ['kosong', ''],
    ['epoch nol', '0'],
  ])('menolak %s', (_name, input) => {
    expect(parseReceivedAt(input, { now: NOW })).toEqual({ iso: null, problem: 'received_at_invalid' });
  });

  it('menolak waktu yang jauh di masa depan (jam HP salah)', () => {
    expect(parseReceivedAt('2026-12-31T08:30:00+07:00', { now: NOW })).toEqual({
      iso: null,
      problem: 'received_at_in_future',
    });
  });
});
