import { describe, expect, it } from 'vitest';
import { extractAmounts, parseIdAmount, selectMainAmount } from './amount.ts';

describe('parseIdAmount', () => {
  it.each([
    ['50.000', 50_000],
    ['1.500.000', 1_500_000],
    ['50000', 50_000],
    ['50,00', 50],
    ['50.000,00', 50_000],
  ])('menerima format Indonesia %s → %i', (token, expected) => {
    expect(parseIdAmount(token)).toEqual({ value: expected });
  });

  it.each([
    ['50,000', 'unrecognized_format'], // koma ribuan gaya Inggris: jangan ditebak
    ['1,500,000', 'unrecognized_format'],
    ['50.00', 'unrecognized_format'],
    ['1.5', 'unrecognized_format'],
    ['1000.000', 'unrecognized_format'],
    ['50,50', 'non_integer'],
    ['0', 'zero'],
    ['0,00', 'zero'],
    ['99999999999999999999', 'too_large'],
  ])('menolak %s dengan alasan %s', (token, problem) => {
    expect(parseIdAmount(token)).toEqual({ value: null, problem });
  });
});

describe('extractAmounts', () => {
  it.each([
    ['Rp50.000', 50_000],
    ['Rp 50.000', 50_000],
    ['Rp. 50.000', 50_000],
    ['IDR 50.000', 50_000],
    ['rp 50.000.', 50_000], // titik penutup kalimat tidak ikut terbaca
  ])('membaca awalan mata uang: %s', (text, expected) => {
    expect(extractAmounts(text.toLowerCase())[0]?.value).toBe(expected);
  });

  it('memberi label biaya dan saldo, bukan nominal utama', () => {
    const text = 'transfer rp 100.000 berhasil. biaya admin rp 2.500. sisa saldo rp 5.000.000';
    expect(extractAmounts(text).map((m) => [m.label, m.value])).toEqual([
      ['main', 100_000],
      ['fee', 2_500],
      ['balance', 5_000_000],
    ]);
  });

  it('"dari saldo" adalah sumber dana, bukan sisa saldo', () => {
    expect(extractAmounts('pembayaran dari saldo rp 50.000')[0]?.label).toBe('main');
  });

  it('kata setelah nominal tidak memengaruhi label nominal sebelumnya', () => {
    const labels = extractAmounts('transfer rp 100.000 biaya admin rp 2.500').map((m) => m.label);
    expect(labels).toEqual(['main', 'fee']);
  });
});

describe('selectMainAmount', () => {
  it('menolak jika ada dua nominal utama', () => {
    const mentions = extractAmounts('rp 50.000 ke budi, rp 60.000 ke siti');
    expect(selectMainAmount(mentions)).toEqual({ amount: null, problem: 'multiple_main_amounts' });
  });

  it('menolak jika tidak ada nominal utama', () => {
    expect(selectMainAmount(extractAmounts('sisa saldo rp 5.000.000'))).toEqual({
      amount: null,
      problem: 'no_main_amount',
    });
  });

  it('meneruskan alasan format yang tidak dikenali', () => {
    expect(selectMainAmount(extractAmounts('pembayaran rp 1,500,000'))).toEqual({
      amount: null,
      problem: 'amount_unrecognized_format',
    });
  });
});
