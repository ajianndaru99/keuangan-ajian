// ==============================================================================
// ADAPTIVE RULES ENGINE: src/lib/ai/adaptive-rules.ts
// Modul Pembelajaran Regex Tertutup (Closed-Loop Rule Learning)
// Mengubah temuan promo dari Gemini & aksi manual menjadi aturan pencekalan dinamis
// ==============================================================================

// Daftar kata yang terlalu umum dan TIDAK BOLEH dijadikan kata kunci blokir
const RESERVED_WORDS = new Set([
  'rp', 'idr', 'uang', 'dana', 'keluar', 'masuk', 'transfer', 'transferred',
  'bayar', 'pembayaran', 'payment', 'paid', 'berhasil', 'sukses', 'successful',
  'bca', 'mandiri', 'livin', 'jago', 'bri', 'bni', 'seabank', 'shopeepay',
  'gopay', 'dana', 'ovo', 'linkaja', 'qris', 'bank', 'kantong', 'utama',
]);

/**
 * Membersihkan frasa kandidat kata kunci:
 * Menghapus emoji, tanda baca berlebih, dan spasi ganda.
 */
export function cleanRuleKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ') // hapus emoji dan simbol non-alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validasi apakah suatu frasa aman untuk dijadikan kata kunci blokir otomatis.
 * Menghindari pemblokiran kata umum seperti "transfer", "bca", atau "berhasil".
 */
export function isSafePromoKeyword(keyword: string): boolean {
  const cleaned = cleanRuleKeyword(keyword);
  if (cleaned.length < 4 || cleaned.length > 50) return false;
  if (/^\d+$/.test(cleaned)) return false; // tolak jika hanya angka

  // Jika kata tunggal ada di daftar terlarang
  if (RESERVED_WORDS.has(cleaned)) return false;

  // Jika semua kata dalam frasa merupakan reserved words
  const words = cleaned.split(' ').filter(Boolean);
  const allReserved = words.every((w) => RESERVED_WORDS.has(w));
  if (allReserved) return false;

  return true;
}

/**
 * Mengekstrak frasa kandidat promo dari judul, isi notifikasi, atau alasan Gemini.
 * Contoh masukan:
 * - title: "🛡 Dapetin perlindungan dari penipuan cuma dengan Rp100!"
 * - text: "Aktifkan Asuransi Penipuan Digital sekarang dan dapetin diskon terbatas."
 * Hasil: ["perlindungan dari penipuan", "asuransi penipuan digital"]
 */
export function extractPromoKeywordsFromText(
  title: string,
  text: string,
  reason?: string,
  isExplicitManualPromo: boolean = false
): string[] {
  const combined = `${title} ${text} ${reason || ''}`;
  const keywords: Set<string> = new Set();

  // 1. Ekstrak dari judul HANYA jika notifikasi terindikasi kuat promo / iklan / gamifikasi atau ditandai manual
  const hasPromoSign =
    isExplicitManualPromo ||
    /\b(promo|diskon|cashback|voucher|kupon|hadiah|gratis|asuransi|penipuan|perlindungan|spin|tebak|game|games|deals|kado|undian|poin|coins|bonus|paket\s+data|nonton\s+anime|iklan|marketing|paylater|pinjaman|investasi|reward)\b/i.test(
      combined
    );

  if (hasPromoSign) {
    const cleanedTitle = cleanRuleKeyword(title)
      .replace(/\b(?:cuma|hanya|mulai)\s*(?:rp\s*)?\d+.*$/i, '')
      .trim();

    if (isSafePromoKeyword(cleanedTitle)) {
      keywords.add(cleanedTitle);
    }
  }

  // 2. Ekstrak frasa khusus yang sering muncul dalam marketing fintech
  const MARKETING_TARGETS = [
    /\b(asuransi\s+penipuan(?:\s+digital)?)\b/i,
    /\b(perlindungan\s+dari\s+penipuan)\b/i,
    /\b(roda\s+hadiah)\b/i,
    /\b(spin\s+(?:&|and)\s+win)\b/i,
    /\b(nonton\s+anime)\b/i,
    /\b(klaim\s+paket\s+data)\b/i,
    /\b(google\s+one\s+gratis)\b/i,
    /\b(goyang\s+shopee)\b/i,
    /\b(tebak\s+kata)\b/i,
    /\b(shopee\s+games)\b/i,
    /\b(flash\s+coffee)\b/i,
    /\b(ngopi\s+hemat)\b/i,
    /\b(diskon\s+bayar\s+tagihan)\b/i,
    /\b(penawaran\s+khusus)\b/i,
    /\b(ajak\s+teman)\b/i,
    /\b(cashback\s+spesial)\b/i,
  ];

  for (const pattern of MARKETING_TARGETS) {
    const match = combined.match(pattern);
    if (match && match[1]) {
      const clean = cleanRuleKeyword(match[1]);
      if (isSafePromoKeyword(clean)) {
        keywords.add(clean);
      }
    }
  }

  // 3. Fallback jika ditandai manual oleh pengguna tapi belum ada kata kunci terambil
  if (isExplicitManualPromo && keywords.size === 0) {
    const cleanCandidate = cleanRuleKeyword(title);
    if (isSafePromoKeyword(cleanCandidate)) {
      keywords.add(cleanCandidate);
    } else {
      const words = cleanRuleKeyword(text).split(' ').filter(Boolean);
      for (let len = 3; len >= 2; len--) {
        if (words.length >= len) {
          const phrase = words.slice(0, len).join(' ');
          if (isSafePromoKeyword(phrase)) {
            keywords.add(phrase);
            break;
          }
        }
      }
    }
  }

  return Array.from(keywords);
}

/**
 * Mencocokkan teks notifikasi terhadap daftar kata kunci aturan yang dipelajari (Learned Rules)
 */
export function matchesLearnedRules(
  text: string,
  learnedRules: string[]
): { matched: boolean; rule?: string } {
  if (!learnedRules || learnedRules.length === 0) {
    return { matched: false };
  }

  const cleanedText = cleanRuleKeyword(text);

  for (const rule of learnedRules) {
    const cleanRule = cleanRuleKeyword(rule);
    if (!cleanRule) continue;

    // Pencocokan berbasis substring kata utuh / frasa
    if (cleanedText.includes(cleanRule)) {
      return { matched: true, rule: cleanRule };
    }
  }

  return { matched: false };
}
