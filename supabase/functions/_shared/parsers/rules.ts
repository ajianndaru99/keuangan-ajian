// ==============================================================================
// rules.ts — pola umum untuk notifikasi bank/e-wallet berbahasa Indonesia
//
// - Semua pola dicocokkan terhadap teks yang SUDAH di-lowercase.
// - JANGAN pakai flag `g` di sini: RegExp.test() dengan `g` menyimpan state
//   dan memberi hasil berbeda pada pemanggilan berikutnya.
// - Pola khusus satu aplikasi (arah masuk/keluar) ada di profil aplikasinya.
// ==============================================================================

/** OTP / data rahasia. Cocok → notifikasi dibuang dan teksnya tidak boleh disimpan. */
export const SENSITIVE_PATTERNS: RegExp[] = [
  /\botp\b/,
  /\bone[\s-]?time[\s-]?password\b/,
  /\bkode\s+(?:verifikasi|keamanan|rahasia|otp|auth\w*)\b/,
  /\bverification\s+code\b/,
  // Persempit 'jangan berikan' agar tidak membuang transaksi sah (misal: 'jangan berikan data rekening')
  /\bjangan\s+(?:pernah\s+)?(?:berikan|bagikan|beritahu\w*|sebar\w*|kasih)\b.*?\b(?:kode|otp|pin|password|kata\s+sandi)\b/,
  // Persempit 'pin' dan 'password' agar tidak menangkap kalimat transaksi wajar
  /\b(?:kode\s+pin|pin\s+(?:anda|baru|sementara|atm))\b/,
  /\bpin\s*:\s*\d+/,
  /\b(?:kata\s+sandi|password)\s+(?:anda|baru|sementara)\b/,
  /\b(?:kata\s+sandi|password)\s*:\s*\S+/,
  /\b(?:masukkan|input)\s+(?:kode\s+otp|otp|pin|kata\s+sandi)\b/,
];

/** Kata promosi. Dianggap promo HANYA jika tidak ada penanda sukses transaksi. */
export const PROMO_PATTERNS: RegExp[] = [
  /\bcashback\b/,
  /\bdiskon\b/,
  /\bpromo\b/,
  /\bvoucher\b/,
  /\bkupon\b/,
  /\bgratis\b/,
  /\bhadiah\b/,
  /\bundian\b/,
  /\bbonus\b/,
  /\bpenawaran\b/,
  /\bdapatkan\b/,
  /\bnikmati\b/,
  /\bklaim\b/,
  /\bhemat\b/,
  /\bsyarat\s+(?:dan|&)\s+ketentuan\b/,
  /\bs&k\b/,
];

export const REFUND_PATTERNS: RegExp[] = [
  /\brefund\b/,
  /\bpengembalian\s+dana\b/,
  /\bdana\s+(?:telah\s+)?(?:dikembalikan|kembali)\b/,
  /\bdikembalikan\b/,
];

export const FAILED_PATTERNS: RegExp[] = [
  /\bgagal\b/,
  /\bditolak\b/,
  /\bdibatalkan\b/,
  /\btidak\s+berhasil\b/,
  /\bkedaluwarsa\b/,
  /\bexpired\b/,
];

/** Dicek SEBELUM penanda sukses, karena "belum berhasil" memuat kata "berhasil". */
export const PENDING_PATTERNS: RegExp[] = [
  /\bsedang\s+diproses\b/,
  /\bdalam\s+proses\b/,
  /\bmenunggu\b/,
  /\bpending\b/,
  /\bbelum\s+berhasil\b/,
];

export const SUCCESS_PATTERNS: RegExp[] = [
  /\bberhasil\b/,
  /\bsukses\b/,
  /\bselesai\b/,
  /\blunas\b/,
  /\bditerima\b/,
  /\bmenerima\b/,
  /\b(?:dana|uang|saldo|transfer)\s+masuk\b/,
  /\btransferred\b/,
  /\bspent\b/,
  /\bpaid\b/,
  /\bmembayar\b/,
  /\breceived\b/,
  /\bsuccessful\b/,
];

export function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
