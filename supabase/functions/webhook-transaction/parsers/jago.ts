// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/jago.ts
// Parser notifikasi untuk Bank Jago (Jago App / PT Bank Jago Tbk)
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const jagoParser: BankParser = {
  name: 'Jago',
  aliases: ['jago', 'bank jago', 'bankjago', 'pt bank jago tbk', 'kantong jago'],
  accountType: 'bank',

  canHandle(appName: string, rawText: string): boolean {
    const normApp = appName.toLowerCase();
    const isAppMatch = this.aliases.some(alias => normApp.includes(alias));
    const isTextMatch = /\bjago\b|kantong jago|kartu debit jago/i.test(rawText);
    return isAppMatch || isTextMatch;
  },

  parse(rawText: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Deteksi arah transaksi: 'in' jika menerima transfer atau dana masuk
    let direction: 'out' | 'in' = 'out';
    if (
      lower.includes('kamu menerima') ||
      lower.includes('uang masuk') ||
      lower.includes('transfer masuk') ||
      lower.includes('menerima transfer') ||
      lower.includes('dana masuk')
    ) {
      direction = 'in';
    }

    // Ekstraksi Penerima / Pengirim / Merchant
    let merchant = '';

    if (direction === 'in') {
      const dariMatch = extractEntity(rawText, 'dari');
      merchant = dariMatch || 'Transfer Masuk Jago';
    } else {
      const diMatch = extractEntity(rawText, 'di');
      const keMatch = extractEntity(rawText, 'ke');
      const untukMatch = extractEntity(rawText, 'untuk');

      if (diMatch) {
        merchant = diMatch;
      } else if (keMatch) {
        // Hapus keterangan rekening atau nama bank tujuan dalam tanda kurung seperti "(BCA)"
        merchant = keMatch.replace(/\s*\([^\)]*\)?/g, '').replace(/rekening\s*\d+/gi, '').trim();
      } else if (untukMatch) {
        merchant = untukMatch;
      } else {
        merchant = 'Transaksi Bank Jago';
      }
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: 'Jago',
      parsedSuccessfully,
      notes: parsedSuccessfully ? 'Parsed via Jago Parser' : 'Jago Parser: nominal tidak terbaca'
    };
  }
};
