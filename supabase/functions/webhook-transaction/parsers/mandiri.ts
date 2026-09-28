// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/mandiri.ts
// Parser notifikasi untuk Bank Mandiri (Livin' by Mandiri)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const mandiriParser: BankParser = {
  name: 'Mandiri',
  aliases: ['mandiri', 'livin', "livin'", 'livin by mandiri', 'bank mandiri'],
  accountType: 'bank',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /mandiri|livin/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (lower.includes('dana masuk') || lower.includes('transfer masuk') || lower.includes('terima dana')) {
      direction = 'in';
    }

    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      merchant = dariMatch || 'Dana Masuk Mandiri';
    } else {
      const diMatch = extractEntity(rawText, 'di');
      const anMatch = extractEntity(rawText, /a\.n\.?/i);
      const keMatch = extractEntity(rawText, 'ke');

      if (diMatch) {
        merchant = diMatch;
      } else if (anMatch) {
        merchant = anMatch;
      } else if (keMatch) {
        merchant = keMatch.replace(/rekening\s*\d+/gi, '').replace(/\(.*\)/, '').trim();
      } else {
        merchant = 'Transaksi Mandiri';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'Mandiri',
      parsedSuccessfully,
      notes: parsedSuccessfully ? "Parsed via Mandiri (Livin') Parser" : 'Mandiri Parser: nominal tidak terbaca'
    };
  }
};
