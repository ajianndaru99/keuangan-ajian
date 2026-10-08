// ==============================================================================
// types.ts — tipe bersama untuk semua parser notifikasi
// ==============================================================================

/** Hasil akhir pemrosesan satu notifikasi. */
export type Outcome =
  | 'transaction' // aman dimasukkan ke tabel transactions
  | 'needs_review' // kemungkinan transaksi, tapi ada yang ambigu: simpan & cek manual
  | 'ignored'; // bukan transaksi (OTP, promo, gagal, dll): jangan masuk transactions

export type Direction = 'in' | 'out' | 'unknown';

export type TxStatus = 'success' | 'failed' | 'pending' | 'refund' | 'unknown';

/** Peran sebuah nominal di dalam teks notifikasi. Hanya 'main' yang menjadi nominal transaksi. */
export type AmountLabel = 'main' | 'fee' | 'balance' | 'cashback';

export type AmountProblem =
  | 'unrecognized_format' // mis. "50,000" atau "1.5": tidak sesuai format Indonesia
  | 'non_integer' // mis. "50,50": rupiah disimpan sebagai bilangan bulat
  | 'zero'
  | 'too_large';

export interface AmountMention {
  label: AmountLabel;
  /** Teks nominal apa adanya (tanpa "Rp"), mis. "50.000". */
  raw: string;
  /** Rupiah bulat. null jika `problem` terisi. */
  value: number | null;
  problem?: AmountProblem;
}

/** Alasan sebuah notifikasi tidak langsung menjadi 'transaction'. */
export type ReasonCode =
  | 'empty_notification'
  | 'sensitive_content'
  | 'no_amount'
  | 'promo'
  | 'status_failed'
  | 'status_pending'
  | 'status_unknown'
  | 'refund_needs_classification'
  | 'direction_conflict'
  | 'direction_unknown'
  | 'no_main_amount'
  | 'multiple_main_amounts'
  | `amount_${AmountProblem}`
  | 'received_at_invalid'
  | 'received_at_in_future';

/** Catatan yang tidak menghalangi 'transaction'. */
export type WarningCode = 'promo_keyword_present' | 'merchant_unknown';

export interface ParseInput {
  title: string;
  text: string;
  /** Epoch ms / epoch detik / ISO 8601. Lihat fields.ts → parseReceivedAt. */
  receivedAt: string | number;
}

export interface ParseOptions {
  /** Waktu sekarang di server (dipakai mendeteksi jam HP yang salah). Default: new Date(). */
  now?: Date;
  /** Zona waktu jika receivedAt tidak membawa zona. Default '+07:00' (WIB). */
  defaultUtcOffset?: string;
}

export interface ParsedNotification {
  outcome: Outcome;
  /** Alias dari `outcome === 'transaction'` (kompatibel dengan parser V2). */
  isValid: boolean;
  parserVersion: string;
  bank: string;
  accountName: string;
  direction: Direction;
  status: TxStatus;
  /** Rupiah bulat. null jika tidak bisa ditentukan dengan pasti. */
  amount: number | null;
  merchant: string | null;
  reference: string | null;
  /** ISO 8601 (UTC) dari receivedAt. */
  transactionDate: string | null;
  /** Nominal lain di teks (biaya, saldo, cashback) — untuk audit, bukan transaksi. */
  otherAmounts: AmountMention[];
  /**
   * true jika notifikasi memuat OTP/data rahasia.
   * Pemanggil WAJIB tidak menyimpan maupun mencetak teks mentahnya.
   */
  sensitive: boolean;
  /** Kosong jika outcome 'transaction'. Berisi alasan jika 'needs_review' / 'ignored'. */
  reasons: ReasonCode[];
  warnings: WarningCode[];
}

/** Profil satu aplikasi bank/e-wallet. Parser baru = profil baru + test baru. */
export interface BankProfile {
  bank: string;
  accountName: string;
  /** Naikkan setiap kali pola berubah, supaya data mentah bisa diproses ulang. */
  parserVersion: string;
  /** Pola (lowercase, tanpa flag `g`) yang menandakan uang MASUK. */
  inPatterns: RegExp[];
  /** Pola (lowercase, tanpa flag `g`) yang menandakan uang KELUAR. */
  outPatterns: RegExp[];
  /** Penanda sukses tambahan khusus aplikasi ini (opsional). */
  successPatterns?: RegExp[];
}
