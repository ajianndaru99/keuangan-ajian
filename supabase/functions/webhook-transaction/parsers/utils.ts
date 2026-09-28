// ==============================================================================
// UTILS: supabase/functions/webhook-transaction/parsers/utils.ts
// Helper fungsi ekstraksi nominal Rupiah, sanitasi string, dan hashing dedupe
// ==============================================================================

/**
 * Membersihkan dan mengonversi format nominal Indonesia menjadi angka murni (number).
 * Mendukung format:
 * - "Rp1.250.000" -> 1250000
 * - "Rp 1.250.000,00" -> 1250000
 * - "Rp 50.000,00" -> 50000
 * - "Rp. 45.000" -> 45000
 * - "IDR 350.000" -> 350000
 * - "75.000" -> 75000
 * - "1250000" -> 1250000
 * - "Rp 34.500,50" -> 34500.5
 */
export function parseIndonesianCurrency(rawStr: string): number | null {
  if (!rawStr) return null;

  // Bersihkan teks dari label mata uang dan spasi
  let str = rawStr.replace(/(?:Rp\.?|IDR)\s*/gi, '').trim();

  // Pola: 1.250.000,50 (titik sebagai ribuan, koma sebagai desimal)
  if (/\.\d{3},\d{1,2}$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } 
  // Pola: 1.250.000 (titik sebagai ribuan tanpa koma desimal)
  else if (/\.\d{3}/.test(str)) {
    str = str.replace(/\./g, '');
  }
  // Pola desimal dengan koma di akhir: 50000,00
  else if (/,\d{1,2}$/.test(str)) {
    str = str.replace(',', '.');
  }

  // Ambil hanya digit angka dan titik desimal
  const cleaned = str.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Ekstraksi nominal Rupiah dari potongan teks notifikasi menggunakan regex
 */
export function extractAmountFromText(text: string): number | null {
  if (!text) return null;

  // 1. Coba cocokkan awalan Rp/IDR yang diikuti nominal
  const rpMatch = text.match(/(?:Rp\.?|IDR)\s*([\d\.,]+)/i);
  if (rpMatch && rpMatch[1]) {
    const val = parseIndonesianCurrency(rpMatch[1]);
    if (val !== null && val > 0) return val;
  }

  // 2. Coba cocokkan kata "sebesar [nominal]"
  const sebesarMatch = text.match(/sebesar\s+(?:Rp\.?\s*)?([\d\.,]+)/i);
  if (sebesarMatch && sebesarMatch[1]) {
    const val = parseIndonesianCurrency(sebesarMatch[1]);
    if (val !== null && val > 0) return val;
  }

  // 3. Fallback: cari bilangan ribuan berformat 1.000 atau 10.000 atau lebih
  const thousandMatch = text.match(/\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/);
  if (thousandMatch) {
    const val = parseIndonesianCurrency(thousandMatch[0]);
    if (val !== null && val > 0) return val;
  }

  return null;
}

/**
 * Ekstraksi nama merchant / pihak kedua setelah kata kunci tertentu (misal: 'di', 'ke', 'dari', 'a.n')
 * secara aman tanpa regex negated character class yang rentan memotong nama.
 */
export function extractEntity(
  text: string,
  prefix: string | RegExp,
  customStopWords: string[] = []
): string | null {
  const defaultStopWords = [
    'berhasil', 'sukses', 'telah', 'tgl', 'tanggal',
    'sebesar', 'via', 'pakai', 'pada', 'dengan'
  ];
  const stopWords = [...defaultStopWords, ...customStopWords];

  const prefixPattern = typeof prefix === 'string' ? new RegExp(`\\b${prefix}\\s+`, 'i') : prefix;
  const match = text.match(prefixPattern);
  if (!match || match.index === undefined) return null;

  const after = text.slice(match.index + match[0].length).trim();
  if (!after) return null;

  let endIndex = after.length;

  for (const stop of stopWords) {
    const stopRegex = new RegExp(`(?:\\s+${stop}\\b|\\s*\\(${stop}\\b)`, 'i');
    const stopMatch = after.match(stopRegex);
    if (stopMatch && stopMatch.index !== undefined && stopMatch.index < endIndex) {
      endIndex = stopMatch.index;
    }
  }

  // Hentikan jika bertemu titik akhir kalimat atau baris baru
  const dotMatch = after.match(/\.\s|\.$|\n/);
  if (dotMatch && dotMatch.index !== undefined && dotMatch.index < endIndex) {
    endIndex = dotMatch.index;
  }

  const result = after.slice(0, endIndex).trim();
  return result || null;
}

/**
 * Membersihkan nama merchant/tujuan dari tanda baca dan spasi berlebih
 */
export function sanitizeMerchantName(raw: string): string {
  if (!raw) return 'Tidak Diketahui';
  return raw
    .replace(/^[\s\.\,\:\-\(\)]+|[\s\.\,\:\-\(\)]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Menghasilkan hash SHA-256 unik untuk mencegah duplikasi notifikasi (deduplikasi).
 * Menggunakan Web Crypto API standar (kompatibel Deno, Node.js 18+, dan Browser).
 * Komponen hash: accountId + amount + roundToMinute(timestamp) + merchant + direction
 */
export async function generateDedupeHash(
  accountId: string,
  amount: number,
  transactionDate: string | Date,
  merchant: string,
  direction: string
): Promise<string> {
  const d = new Date(transactionDate);
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  // Bulatkan ke satuan menit UTC (YYYY-MM-DDTHH:mm)
  const minuteKey = validDate.toISOString().slice(0, 16);
  const normalizedMerchant = sanitizeMerchantName(merchant).toLowerCase();
  
  const rawKey = `${accountId}_${amount}_${minuteKey}_${normalizedMerchant}_${direction}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
