// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/shopeepay.ts
// Parser notifikasi untuk ShopeePay (Shopee / ShopeePay)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const shopeepayParser: BankParser = {
  name: 'ShopeePay',
  aliases: ['shopeepay', 'shopee', 'shopee pay'],
  accountType: 'ewallet',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /shopeepay|shopee/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (
      lower.includes('menerima transfer') ||
      lower.includes('top up') ||
      lower.includes('topup') ||
      lower.includes('pengembalian dana') ||
      lower.includes('cashback') ||
      lower.includes('telah masuk ke shopeepay') ||
      lower.includes('transfer masuk')
    ) {
      direction = 'in';
    }

    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      if (dariMatch) {
        merchant = lower.includes('top up') ? `Top up dari ${dariMatch}` : dariMatch;
      } else if (lower.includes('pengembalian dana') || lower.includes('refund')) {
        merchant = 'Pengembalian Dana (Refund)';
      } else if (lower.includes('top up') || lower.includes('topup')) {
        merchant = 'Top Up ShopeePay';
      } else {
        merchant = 'Dana Masuk ShopeePay';
      }
    } else {
      const keMatch = extractEntity(rawText, 'ke');
      const diMatch = extractEntity(rawText, 'di');

      if (keMatch) {
        merchant = keMatch;
      } else if (diMatch) {
        merchant = diMatch;
      } else {
        merchant = 'Transaksi ShopeePay';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'ShopeePay',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via ShopeePay Parser' : 'ShopeePay Parser: nominal tidak terbaca'
    };
  }
};
