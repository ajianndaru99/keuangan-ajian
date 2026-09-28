// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/dana.ts
// Parser notifikasi untuk DANA (Dompet Digital Indonesia)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const danaParser: BankParser = {
  name: 'DANA',
  aliases: ['dana', 'dompet digital indonesia'],
  accountType: 'ewallet',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /\bdana\b/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (
      lower.includes('isi saldo') ||
      lower.includes('menerima uang') ||
      lower.includes('transfer masuk') ||
      lower.includes('dana masuk') ||
      lower.includes('cashback')
    ) {
      direction = 'in';
    }

    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      const viaMatch = extractEntity(rawText, 'via');

      if (dariMatch) {
        merchant = dariMatch;
      } else if (viaMatch) {
        merchant = `Isi Saldo via ${viaMatch}`;
      } else if (lower.includes('isi saldo')) {
        merchant = 'Isi Saldo DANA';
      } else {
        merchant = 'Dana Masuk DANA';
      }
    } else {
      const keMatch = extractEntity(rawText, 'ke');
      const diMatch = extractEntity(rawText, 'di');
      const bayarMatch = extractEntity(rawText, 'bayar');

      if (keMatch) {
        merchant = keMatch;
      } else if (diMatch) {
        merchant = diMatch;
      } else if (bayarMatch) {
        merchant = bayarMatch;
      } else {
        merchant = 'Transaksi DANA';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'DANA',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via DANA Parser' : 'DANA Parser: nominal tidak terbaca'
    };
  }
};
