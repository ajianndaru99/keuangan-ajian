// ==============================================================================
// REGISTRY: supabase/functions/webhook-transaction/parsers/index.ts
// Modul utama registry parser notifikasi bank & e-wallet Indonesia
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { bcaParser } from './bca.ts';
import { mandiriParser } from './mandiri.ts';
import { briParser } from './bri.ts';
import { gopayParser } from './gopay.ts';
import { shopeepayParser } from './shopeepay.ts';
import { danaParser } from './dana.ts';
import { ovoParser } from './ovo.ts';
import { genericParser } from './generic.ts';

export type * from './types.ts';
export * from './utils.ts';
export { bcaParser, mandiriParser, briParser, gopayParser, shopeepayParser, danaParser, ovoParser, genericParser };

/**
 * Daftar seluruh parser spesifik bank/e-wallet terdaftar.
 * Untuk menambah bank baru, cukup buat file baru di folder parsers/ lalu daftarkan di sini.
 */
export const registeredParsers: BankParser[] = [
  bcaParser,
  mandiriParser,
  briParser,
  gopayParser,
  shopeepayParser,
  danaParser,
  ovoParser,
];

/**
 * Mencari parser yang cocok berdasarkan nama aplikasi atau isi notifikasi.
 * Memprioritaskan pencocokan nama aplikasi (appName) terlebih dahulu.
 */
export function findMatchingParser(appName: string, rawText: string): BankParser {
  const normApp = (appName || '').trim().toLowerCase();

  // 1. Prioritas utama: jika nama aplikasi dikirim, cocokkan dengan daftar alias
  if (normApp) {
    for (const parser of registeredParsers) {
      if (parser.aliases.some(alias => normApp === alias || normApp.includes(alias) || alias.includes(normApp))) {
        return parser;
      }
    }
  }

  // 2. Prioritas kedua: deteksi lewat isi teks notifikasi
  for (const parser of registeredParsers) {
    if (parser.canHandle(appName, rawText)) {
      return parser;
    }
  }

  return genericParser;
}

/**
 * Fungsi utama untuk memproses teks notifikasi dari MacroDroid.
 * Selalu mengembalikan ParseResult yang aman (tidak pernah melempar exception fatal).
 */
export function parseNotification(appName: string, rawText: string): ParseResult {
  const safeAppName = (appName || '').trim();
  const safeText = (rawText || '').trim();

  if (!safeText) {
    return {
      amount: 0,
      direction: 'out',
      merchant: 'Pesan Kosong',
      accountName: safeAppName || 'Lainnya',
      parsedSuccessfully: false,
      notes: 'Teks notifikasi kosong'
    };
  }

  const parser = findMatchingParser(safeAppName, safeText);

  try {
    const result = parser.parse(safeText);
    
    // Jika parser spesifik gagal mendeteksi nominal (> 0), coba fallback ke generic parser
    if (!result.parsedSuccessfully && parser !== genericParser) {
      const fallbackResult = genericParser.parse(safeText, parser.name);
      if (fallbackResult.parsedSuccessfully) {
        return fallbackResult;
      }
    }

    return result;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Safety net: jangan sampai webhook crash karena error parsing regex tak terduga
    return {
      amount: 0,
      direction: 'out',
      merchant: 'Error Parsing',
      accountName: parser.name || safeAppName || 'Lainnya',
      parsedSuccessfully: false,
      notes: `Exception parsing: ${errorMessage}`
    };
  }
}
