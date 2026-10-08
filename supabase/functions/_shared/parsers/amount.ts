// ==============================================================================
// amount.ts — mengambil nominal rupiah dari teks notifikasi
//
// Prinsip: lebih baik menandai "perlu dicek" daripada diam-diam salah angka.
// Format yang diterima HANYA format Indonesia (titik = ribuan, koma = desimal).
// Format lain ("50,000", "1.5") ditolak, bukan ditebak.
// ==============================================================================

import type { AmountLabel, AmountMention, AmountProblem } from './types.ts';

/** Cocokkan "Rp 50.000", "Rp50.000", "Rp. 50.000", "IDR 50.000" (teks sudah lowercase). */
const AMOUNT_PATTERN = /\b(?:rp|idr)\.?\s*(\d[\d.,]*)/g;

/** 1.500.000 | 50000 | 50.000,00 — desimal maksimal 2 digit. */
const STRICT_ID_AMOUNT = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/** Berapa karakter sebelum nominal yang dilihat untuk menentukan labelnya. */
const LABEL_WINDOW = 24;

const LABEL_RULES: ReadonlyArray<readonly [AmountLabel, RegExp]> = [
  // "dari saldo Rp 50.000" artinya sumber dana, bukan sisa saldo.
  ['balance', /(?<!\b(?:dari|dengan|via|menggunakan)\s+)\bsaldo\b/],
  ['fee', /\b(?:biaya|admin|adm|fee)\b/],
  ['cashback', /\b(?:cashback|bonus|diskon|potongan|poin)\b/],
];

export function parseIdAmount(token: string): { value: number | null; problem?: AmountProblem } {
  const match = STRICT_ID_AMOUNT.exec(token);
  if (!match) return { value: null, problem: 'unrecognized_format' };

  const decimals = match[1];
  if (decimals !== undefined && Number(decimals) !== 0) return { value: null, problem: 'non_integer' };

  const integerPart = token.split(',')[0] ?? '';
  const value = Number(integerPart.replace(/\./g, ''));
  if (!Number.isSafeInteger(value)) return { value: null, problem: 'too_large' };
  if (value === 0) return { value: null, problem: 'zero' };
  return { value };
}

/**
 * Label ditentukan dari kata SEBELUM nominal, dalam kalimat yang sama
 * (batas kalimat: ". ", "! ", "? ", ";" atau "|" = baris baru).
 * Kata setelah nominal sengaja tidak dipakai: "Rp 100.000 biaya admin Rp 2.500"
 * akan salah memberi label fee pada 100.000.
 */
function labelFor(lower: string, index: number, previousEnd: number): AmountLabel {
  const start = Math.max(previousEnd, index - LABEL_WINDOW);
  const before = lower.slice(start, index);
  const cut = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('! '),
    before.lastIndexOf('? '),
    before.lastIndexOf(';'),
    before.lastIndexOf('|'),
  );
  const sentence = cut >= 0 ? before.slice(cut + 1) : before;
  for (const [label, pattern] of LABEL_RULES) {
    if (pattern.test(sentence)) return label;
  }
  return 'main';
}

/** `lower` = teks ternormalisasi dan sudah lowercase. */
export function extractAmounts(lower: string): AmountMention[] {
  const mentions: AmountMention[] = [];
  let previousEnd = 0;

  for (const match of lower.matchAll(AMOUNT_PATTERN)) {
    const index = match.index ?? 0;
    const raw = (match[1] ?? '').replace(/[.,]+$/, ''); // buang titik/koma penutup kalimat
    const { value, problem } = parseIdAmount(raw);
    mentions.push({
      label: labelFor(lower, index, previousEnd),
      raw,
      value,
      ...(problem ? { problem } : {}),
    });
    previousEnd = index + match[0].length;
  }
  return mentions;
}

/** Nominal transaksi = tepat satu nominal berlabel 'main'. Selain itu → perlu dicek. */
export function selectMainAmount(mentions: readonly AmountMention[]): {
  amount: number | null;
  problem: 'no_main_amount' | 'multiple_main_amounts' | `amount_${AmountProblem}` | null;
} {
  const mains = mentions.filter((mention) => mention.label === 'main');
  const only = mains[0];
  if (!only) return { amount: null, problem: 'no_main_amount' };
  if (mains.length > 1) return { amount: null, problem: 'multiple_main_amounts' };
  if (only.value === null) return { amount: null, problem: `amount_${only.problem ?? 'unrecognized_format'}` };
  return { amount: only.value, problem: null };
}
