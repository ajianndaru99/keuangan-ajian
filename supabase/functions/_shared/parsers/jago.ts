// ==============================================================================
// jago.ts — profil Bank Jago (PT Bank Jago Tbk)
//
// Divalidasi langsung dari tangkapan layar notifikasi nyata pengguna:
// 1. "You've transferred Rp50.000 to NURUL..."
// 2. "RATIH CITRA SASTINALA spent Rp50.000..."
// ==============================================================================

import { parseNotification } from './engine.ts';
import type { BankProfile, ParseOptions, ParsedNotification } from './types.ts';

export const JAGO_PROFILE: BankProfile = {
  bank: 'jago',
  accountName: 'Bank Jago',
  parserVersion: 'jago-0.1.0',

  // Uang MASUK (bilingual Inggris & Indonesia)
  inPatterns: [
    /\b(?:you\s+)?received\b/i,
    /\bsent\s+you\b/i,
    /\btransfer\s+masuk\b/i,
    /\bdana\s+masuk\b/i,
    /\buang\s+masuk\b/i,
    /\bmenerima\s+(?:transfer|dana|uang)\b/i,
  ],

  // Uang KELUAR (bilingual Inggris & Indonesia)
  outPatterns: [
    /\btransferred\b/i,
    /\bspent\b/i,
    /\bpaid\b/i,
    /\bpay\b/i,
    /\bpayment\b/i,
    /\bpembayaran\b/i,
    /\bmentransfer\b/i,
    /\bmembayar\b/i,
    /\bbayar\b/i,
    /\btop\s*up\b/i,
    /\btarik\s+tunai\b/i,
    /\bwithdrew\b/i,
    /\btransfer\s+(?:berhasil|sukses|ke)\b/i,
  ],

  successPatterns: [
    /\bpaid\b/i,
    /\bhave\s+paid\b/i,
  ],
};

export function parseJagoNotification(
  title: string,
  text: string,
  receivedAt: string | number,
  options?: ParseOptions,
): ParsedNotification {
  return parseNotification(JAGO_PROFILE, { title, text, receivedAt }, options);
}
