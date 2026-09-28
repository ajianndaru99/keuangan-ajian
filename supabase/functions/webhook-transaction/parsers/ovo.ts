// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/ovo.ts
// Parser notifikasi untuk OVO (OVO Cash)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const ovoParser: BankParser = {
  name: 'OVO',
  aliases: ['ovo', 'ovo cash'],
  accountType: 'ewallet',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /\bovo\b/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (
      lower.includes('top up') ||
      lower.includes('topup') ||
      lower.includes('menerima transfer') ||
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
        merchant = `Top Up via ${viaMatch}`;
      } else if (lower.includes('top up') || lower.includes('topup')) {
        merchant = 'Top Up OVO';
      } else {
        merchant = 'Dana Masuk OVO';
      }
    } else {
      const diMatch = extractEntity(rawText, 'di');
      const keMatch = extractEntity(rawText, 'ke');
      const untukMatch = extractEntity(rawText, 'untuk');

      if (diMatch) {
        merchant = diMatch;
      } else if (keMatch) {
        merchant = keMatch;
      } else if (untukMatch) {
        merchant = untukMatch;
      } else {
        merchant = 'Transaksi OVO';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'OVO',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via OVO Parser' : 'OVO Parser: nominal tidak terbaca'
    };
  }
};
