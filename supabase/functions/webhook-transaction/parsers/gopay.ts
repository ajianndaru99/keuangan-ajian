// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/gopay.ts
// Parser notifikasi untuk GoPay (Gojek / GoPay App)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const gopayParser: BankParser = {
  name: 'GoPay',
  aliases: ['gopay', 'gojek', 'go-jek', 'gopay app'],
  accountType: 'ewallet',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /gopay|gojek|gofood|goride|gocar/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi: 'in' jika menerima transfer, top up, atau dana masuk
    let direction: 'out' | 'in' = 'out';
    if (
      lower.includes('menerima transfer') ||
      lower.includes('top up') ||
      lower.includes('topup') ||
      lower.includes('dana masuk') ||
      lower.includes('menerima saldo')
    ) {
      direction = 'in';
    }

    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      if (dariMatch) {
        merchant = lower.includes('top up') ? `Top up dari ${dariMatch}` : dariMatch;
      } else {
        merchant = lower.includes('top up') ? 'Top Up GoPay' : 'Transfer Masuk GoPay';
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
        merchant = 'Transaksi GoPay';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'GoPay',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via GoPay Parser' : 'GoPay Parser: nominal tidak terbaca'
    };
  }
};
