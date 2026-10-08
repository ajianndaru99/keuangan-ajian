// ==============================================================================
// livin.ts — profil Livin' by Mandiri
//
// PENTING: pola di bawah memakai kosakata umum notifikasi bank Indonesia, BUKAN
// teks asli Livin. Setelah Fase 0 (data mentah terkumpul), cocokkan dengan teks
// nyata: tambah/ubah pola, tambah kasus di livin.test.ts, lalu naikkan parserVersion.
// ==============================================================================

import { parseNotification } from './engine.ts';
import type { BankProfile, ParseOptions, ParsedNotification } from './types.ts';

export const LIVIN_PROFILE: BankProfile = {
  bank: 'livin',
  accountName: 'Livin Mandiri',
  parserVersion: 'livin-0.1.0',

  // Uang MASUK. Sengaja TANPA kata "dari" saja: "dari rekening Anda" justru uang keluar.
  inPatterns: [
    /\b(?:dana|uang|saldo|transfer)\s+masuk\b/,
    /\bmenerima\s+(?:transfer|dana|uang|kiriman|pembayaran)\b/,
    /\bkiriman\s+(?:dana|uang)\b/,
    /\bditerima\b(?!\s+oleh)/, // "diterima oleh Budi" = konfirmasi transfer keluar
    /\bsetor(?:an)?\s+tunai\b/,
  ],

  // Uang KELUAR. "ke rekening Anda" dikecualikan karena itu uang masuk.
  outPatterns: [
    /\b(?:pembayaran|pembelian)\b/,
    /\bdebit\b/,
    /\btarik\s+tunai\b/,
    /\btop\s*up\b/, // jika e-wallet tujuan milik sendiri → nanti ditangani sebagai transfer internal
    /\btransfer\s+(?:berhasil|sukses)\b/,
    /\btransfer\b.{0,60}?\bke\s+(?!(?:rekening|tabungan)\s+(?:anda|kamu)\b)\S/,
  ],
};

export function parseLivinNotification(
  title: string,
  text: string,
  receivedAt: string | number,
  options?: ParseOptions,
): ParsedNotification {
  return parseNotification(LIVIN_PROFILE, { title, text, receivedAt }, options);
}
