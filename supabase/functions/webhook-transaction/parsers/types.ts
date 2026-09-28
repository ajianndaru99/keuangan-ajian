// ==============================================================================
// TYPES: supabase/functions/webhook-transaction/parsers/types.ts
// Definisi tipe data hasil parsing notifikasi transaksi
// ==============================================================================

export type TransactionDirection = 'out' | 'in';

export interface ParseResult {
  /** Nominal dalam Rupiah (bilangan bulat/desimal murni) */
  amount: number;
  /** Arah transaksi: 'out' (pengeluaran) atau 'in' (pemasukan/top up) */
  direction: TransactionDirection;
  /** Nama merchant/penerima/pengirim yang terdeteksi */
  merchant: string;
  /** Nama standar akun bank/e-wallet (contoh: BCA, Mandiri, BRI, GoPay, ShopeePay, DANA, OVO) */
  accountName: string;
  /** Status apakah regex berhasil mengekstrak nominal dan arah secara valid */
  parsedSuccessfully: boolean;
  /** Catatan atau flag tambahan (misal info parser mana yang dipakai) */
  notes?: string;
}

export interface BankParser {
  /** Nama kanonikal akun */
  name: string;
  /** Daftar nama/alias aplikasi yang cocok */
  aliases: string[];
  /** Tipe akun: 'bank' atau 'ewallet' */
  accountType: 'bank' | 'ewallet';
  /** Fungsi pengecekan apakah parser ini menangani appName atau teks tertentu */
  canHandle: (appName: string, rawText: string) => boolean;
  /** Fungsi ekstraksi notifikasi */
  parse: (rawText: string) => ParseResult;
}
