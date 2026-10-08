// ==============================================================================
// fields.ts — normalisasi teks, nama lawan transaksi, nomor referensi, waktu
// ==============================================================================

import type { Direction } from './types.ts';

// ------------------------------------------------------------------------------
// Normalisasi
// ------------------------------------------------------------------------------

/**
 * Merapikan teks notifikasi: Unicode NFKC (spasi non-breaking jadi spasi biasa),
 * buang karakter lebar-nol, baris baru menjadi " | ", spasi ganda dirapatkan.
 * "|" dipakai sebagai batas antar-baris oleh modul lain.
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s*[\r\n]+\s*/g, ' | ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ------------------------------------------------------------------------------
// Nama lawan transaksi (merchant / pengirim / penerima)
// ------------------------------------------------------------------------------

const MAX_COUNTERPARTY_LENGTH = 60;

/** Singkatan yang diakhiri titik dan BUKAN akhir kalimat ("PT. Sinar Jaya"). */
const ABBREVIATIONS = new Set([
  'pt', 'cv', 'ud', 'tbk', 'bpk', 'sdr', 'sdri', 'dr', 'drs', 'ir', 'hj', 'h', 'ny', 'st', 'jl', 'gg', 'no',
]);

/** Kata/tanda yang menandai nama sudah selesai. */
const COUNTERPARTY_STOP =
  /\s+(?:berhasil|sukses|gagal|sebesar|senilai|dengan|pada|tanggal|tgl|melalui|via|dari|ke|kepada|untuk|biaya|saldo|sisa|ref|referensi|no|nomor|was|successful|at|for)\b|\s+(?:rp|idr)(?=\s|\d|\.)|\s*[(|]/i;

// "ke rekening Anda" / "ke tabungan Anda" / "to your account" menunjuk rekening sendiri, bukan lawan transaksi.
const NOT_SELF = String.raw`(?!(?:rekening|tabungan)\s+(?:anda|kamu)\b|(?:your\s+account)\b)`;
const OUT_COUNTERPARTY = new RegExp(String.raw`\b(?:kepada|ke|to|at)\s+${NOT_SELF}(\S.*)$`, 'i');
const IN_COUNTERPARTY = new RegExp(String.raw`\b(?:dari|from)\s+${NOT_SELF}(\S.*)$`, 'i');

function cutAtSentenceEnd(value: string): string {
  const terminator = /[.!?;](?=\s|$)/g;
  for (const match of value.matchAll(terminator)) {
    const index = match.index ?? 0;
    const previousWord = /([A-Za-z]+)$/.exec(value.slice(0, index))?.[1]?.toLowerCase() ?? '';
    if (match[0] === '.' && ABBREVIATIONS.has(previousWord)) continue;
    return value.slice(0, index);
  }
  return value;
}

/**
 * Keluar → nama setelah "ke"/"kepada". Masuk → nama setelah "dari".
 * Konservatif: lebih baik null daripada potongan kalimat.
 * `text` = teks ternormalisasi dengan huruf asli (bukan lowercase).
 */
export function extractCounterparty(text: string, direction: Direction): string | null {
  if (direction === 'unknown') return null;

  const match = (direction === 'out' ? OUT_COUNTERPARTY : IN_COUNTERPARTY).exec(text);
  if (!match) return null;

  const cut = cutAtSentenceEnd(match[1] ?? '');
  const name = (cut.split(COUNTERPARTY_STOP)[0] ?? '').replace(/[\s.,;:!?-]+$/, '').trim();

  if (!name || name.length > MAX_COUNTERPARTY_LENGTH) return null;
  if (/^(?:tanggal|tgl|jam|pukul)\b/i.test(name)) return null;
  return name;
}

// ------------------------------------------------------------------------------
// Nomor referensi (jika ada) — berguna sebagai kunci dedupe
// ------------------------------------------------------------------------------

const REFERENCE_PATTERN =
  /\b(?:no\.?\s*ref(?:erensi)?|ref(?:erensi)?|id\s*transaksi|trx\s*id)\b\s*[:#]?\s*((?=[A-Za-z-]*\d)[A-Za-z0-9-]{6,32})\b/i;

export function extractReference(text: string): string | null {
  return REFERENCE_PATTERN.exec(text)?.[1] ?? null;
}

// ------------------------------------------------------------------------------
// Waktu notifikasi
// ------------------------------------------------------------------------------

export interface ReceivedAtOptions {
  now?: Date;
  defaultUtcOffset?: string;
}

export type ReceivedAtResult =
  | { iso: string; problem?: undefined }
  | { iso: null; problem: 'received_at_invalid' | 'received_at_in_future' };

const DEFAULT_UTC_OFFSET = '+07:00';
const MIN_PLAUSIBLE_MS = Date.UTC(2020, 0, 1);
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Menerima: epoch milidetik (13 digit), epoch detik (10 digit), atau
 * "YYYY-MM-DD[T ]HH:mm[:ss]" dengan/ tanpa zona. Tanpa zona dianggap `defaultUtcOffset`.
 * Format lain ditolak supaya tanggal tidak ditebak (mis. "10/08/2026" bisa 8 Okt atau 10 Agu).
 */
export function parseReceivedAt(input: string | number, options: ReceivedAtOptions = {}): ReceivedAtResult {
  const now = options.now ?? new Date();
  const raw = String(input ?? '').trim();
  let ms = Number.NaN;

  if (/^\d{13}$/.test(raw)) {
    ms = Number(raw);
  } else if (/^\d{10}$/.test(raw)) {
    ms = Number(raw) * 1000;
  } else {
    const match = DATE_TIME.exec(raw);
    if (match) {
      let zone = (match[3] ?? options.defaultUtcOffset ?? DEFAULT_UTC_OFFSET).toUpperCase();
      if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
      ms = Date.parse(`${match[1]}T${match[2]}${zone}`);
    }
  }

  if (!Number.isFinite(ms) || ms < MIN_PLAUSIBLE_MS) return { iso: null, problem: 'received_at_invalid' };
  if (ms > now.getTime() + MAX_FUTURE_SKEW_MS) return { iso: null, problem: 'received_at_in_future' };
  return { iso: new Date(ms).toISOString() };
}
