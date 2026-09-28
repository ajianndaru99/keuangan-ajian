// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/bca.ts
// Parser notifikasi untuk BCA (m-BCA, myBCA, BCA Mobile)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const bcaParser: BankParser = {
  name: 'BCA',
  aliases: ['bca', 'm-bca', 'mybca', 'bca mobile', 'klikbca'],
  accountType: 'bank',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /\bbca\b|m-transfer|debit bca|qris bca/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi
    let direction: 'out' | 'in' = 'out';
    if (lower.includes('dana masuk') || lower.includes('transfer masuk') || lower.includes('menerima transfer')) {
      direction = 'in';
    }

    // Ekstraksi Merchant / Penerima / Pengirim
    let merchant = '';

    if (direction === 'in') {
      const anMatch = extractEntity(rawText, /a\.n\.?/i);
      const dariMatch = extractEntity(rawText, 'dari');
      merchant = anMatch || dariMatch || 'Transfer Masuk';
      merchant = merchant.replace(/REK\s*\d+/gi, '').trim();
    } else {
      const diMatch = extractEntity(rawText, 'di');
      const anMatch = extractEntity(rawText, /a\.n\.?/i);
      const keMatch = extractEntity(rawText, 'ke');

      if (diMatch) {
        merchant = diMatch;
      } else if (anMatch) {
        merchant = anMatch;
      } else if (keMatch) {
        merchant = keMatch.replace(/rekening\s*\d+/gi, '').trim();
      } else {
        merchant = 'Transaksi BCA';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'BCA',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via BCA Parser' : 'BCA Parser: nominal tidak terbaca'
    };
  }
};
