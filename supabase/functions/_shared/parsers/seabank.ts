// ==============================================================================
// seabank.ts — profil SeaBank (PT Bank Seabank Indonesia / ex-Bank BKE)
//
// Mendukung notifikasi transfer masuk/keluar, pembayaran QRIS, dan top up
// dari aplikasi Android (id.co.bankbkemobile.digitalbank).
// ==============================================================================

import { parseNotification } from './engine.ts';
import type { BankProfile, ParseOptions, ParsedNotification } from './types.ts';

export const SEABANK_PROFILE: BankProfile = {
  bank: 'seabank',
  accountName: 'SeaBank',
  parserVersion: 'seabank-0.1.0',

  // Uang MASUK
  inPatterns: [
    /\b(?:dana|uang|saldo|transfer)\s+masuk\b/i,
    /\bmenerima\s+(?:transfer|dana|uang|kiriman|pembayaran)\b/i,
    /\bkamu\s+menerima\b/i,
    /\bkiriman\s+(?:dana|uang)\b/i,
    /\bditerima\b(?!\s+oleh)/i,
    /\bsetor(?:an)?\s+tunai\b/i,
    /\breceived\b/i,
    /\bincoming\b/i,
  ],

  // Uang KELUAR
  outPatterns: [
    /\b(?:pembayaran|pembelian)\b/i,
    /\bdebit\b/i,
    /\btarik\s+tunai\b/i,
    /\btop\s*up\b/i,
    /\bmentransfer\b/i,
    /\bmembayar\b/i,
    /\bbayar\b/i,
    /\bkamu\s+telah\s+(?:mentransfer|membayar|melakukan)\b/i,
    /\bpembayaran\s+qris\b/i,
    /\btransfer\s+(?:berhasil|sukses)\s+ke\b/i,
    /\btransfer\s+keluar\b/i,
    /\btransfer\b.{0,60}?\bke\s+(?!(?:rekening|tabungan)\s+(?:anda|kamu)\b)\S/i,
  ],

  successPatterns: [
    /\bberhasil\b/i,
    /\bsukses\b/i,
    /\bsuccessful\b/i,
    /\bkamu\s+telah\b/i,
    /\bkamu\s+menerima\b/i,
  ],
};

export function parseSeabankNotification(
  title: string,
  text: string,
  receivedAt: string | number,
  options?: ParseOptions,
): ParsedNotification {
  return parseNotification(SEABANK_PROFILE, { title, text, receivedAt }, options);
}
