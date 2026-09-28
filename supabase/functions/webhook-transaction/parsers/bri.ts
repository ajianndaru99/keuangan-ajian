// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/bri.ts
// Parser notifikasi untuk Bank BRI (BRImo)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const briParser: BankParser = {
  name: 'BRI',
  aliases: ['bri', 'brimo', 'bank bri'],
  accountType: 'bank',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /\bbri\b|brimo/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (lower.includes('transfer masuk') || lower.includes('dana masuk') || lower.includes('menerima transfer')) {
      direction = 'in';
    }

    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      merchant = dariMatch || 'Dana Masuk BRI';
    } else {
      const diMatch = extractEntity(rawText, 'di');
      const bayarMatch = extractEntity(rawText, 'pembayaran');
      const anMatch = extractEntity(rawText, /a\.n\.?/i);
      const keMatch = extractEntity(rawText, 'ke');

      if (diMatch) {
        merchant = diMatch;
      } else if (anMatch) {
        merchant = anMatch;
      } else if (bayarMatch) {
        merchant = bayarMatch;
      } else if (keMatch) {
        merchant = keMatch.replace(/rekening\s*\d+/gi, '').trim();
      } else {
        merchant = 'Transaksi BRI';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'BRI',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via BRI (BRImo) Parser' : 'BRI Parser: nominal tidak terbaca'
    };
  }
};
