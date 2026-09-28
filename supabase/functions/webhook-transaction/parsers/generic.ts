// ==============================================================================
// PARSER: supabase/functions/webhook-transaction/parsers/generic.ts
// Parser cadangan (fallback) untuk notifikasi umum atau bank/e-wallet baru
// ==============================================================================

import type { BankParser, ParseResult } from './types.ts';
import { extractAmountFromText, extractEntity, sanitizeMerchantName } from './utils.ts';

export const genericParser: BankParser = {
  name: 'Lainnya',
  aliases: [],
  accountType: 'bank',

  canHandle(): boolean {
    return true; // Menangani semua notifikasi yang tidak tertangkap parser spesifik
  },

  parse(rawText: string, appName?: string): ParseResult {
    const amount = extractAmountFromText(rawText) ?? 0;
    const lower = rawText.toLowerCase();

    // Kata kunci penentu arah transaksi
    const inKeywords = [
      'masuk', 'terima', 'menerima', 'top up', 'topup', 'isi saldo',
      'cashback', 'pengembalian', 'refund', 'kredit', 'cr'
    ];
    const isIncome = inKeywords.some(keyword => lower.includes(keyword));
    const direction: 'out' | 'in' = isIncome ? 'in' : 'out';

    let merchant = '';
    const diMatch = extractEntity(rawText, 'di');
    const keMatch = extractEntity(rawText, 'ke');
    const dariMatch = extractEntity(rawText, 'dari');
    const untukMatch = extractEntity(rawText, 'untuk');

    if (direction === 'in' && dariMatch) {
      merchant = dariMatch;
    } else if (diMatch) {
      merchant = diMatch;
    } else if (keMatch) {
      merchant = keMatch;
    } else if (untukMatch) {
      merchant = untukMatch;
    } else {
      merchant = amount > 0 ? (appName ? `Transaksi ${appName}` : 'Transaksi Umum') : 'Perlu Cek Manual';
    }

    const cleanMerchant = sanitizeMerchantName(merchant);
    const parsedSuccessfully = amount > 0;

    return {
      amount,
      direction,
      merchant: cleanMerchant,
      accountName: appName || 'Lainnya',
      parsedSuccessfully,
      notes: parsedSuccessfully
        ? 'Diparsing menggunakan Generic Fallback Parser'
        : 'Gagal mengekstrak nominal: perlu dicek manual'
    };
  }
};
