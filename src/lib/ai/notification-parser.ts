// ==============================================================================
// NOTIFICATION PARSER & AI ANALYZER: src/lib/ai/notification-parser.ts
// Modul cerdas pemfilter chat/promo dan ekstraksi notifikasi perbankan & e-wallet
// Menggabungkan Regex Berkecepatan Tinggi + Fallback AI Vision/Text Google Gemini Flash
// ==============================================================================

import { matchesLearnedRules } from './adaptive-rules.ts';

export interface ParsedNotificationResult {
  isTransaction: boolean;
  amount: number;
  direction: 'in' | 'out';
  merchant: string;
  accountName: string;
  accountType: 'bank' | 'ewallet';
  reference: string | null;
  outcome: 'transaction' | 'ignored';
  reasons: string[];
  parseMethod: 'regex' | 'ai_gemini' | 'manual';
  transactionDate?: string;
  suggestedCategoryName?: string;
  hasStrictConfirmation?: boolean;
}

export interface SyncAiEnhancementResult {
  isTransaction: boolean;
  amount: number;
  direction: 'in' | 'out';
  merchant: string;
  accountName: string;
  categoryName: string;
  reason?: string;
}

// Kata ajakan marketing yang tidak boleh dianggap konfirmasi transaksi meskipun ada kata "berhasil"
const MARKETING_CALL_TO_ACTION_PATTERN =
  /\b(?:pakai\s+kode|kode\s+(?:promo|referral)|ajak\s+teman|klaim\s+(?:sekarang|voucher|kupon|hadiah|gratis|saldo|promo|diskon|cashback)|serbu\s+sekarang|buruan\s+(?:cek|serbu|klaim)|jangan\s+lewatkan|khusus\s+(?:untukmu|buatmu)|eksklusif\s+untukmu|spin\s*(?:&|and)\s*win|roda\s+hadiah|paylater|spaylater|spinjam|gopay\s+pinjam|dana\s+cicil|limit\s+(?:hingga|sampai)|ajukan\s+sekarang|bunga\s+(?:0%|rendah)|cicilan\s+0%|cashback\s+hingga|diskon\s+(?:hingga|s\.?d\.?))\b/i;

// Pola kata kunci chat dari penjual/pembeli marketplace (Shopee, Tokopedia, dll)
const CHAT_PATTERNS = [
  /\[stiker\]/i,
  /\[foto\]/i,
  /\[gambar\]/i,
  /\[video\]/i,
  /\b(wait\s*ya|mohon\s*tunggu|antrean|antrian|kirim\s*email|di\s*coba\s*saja|siap\s*ka|ready\s*ka)\b/i,
  /\b(halo\s*ka|pagi\s*ka|siang\s*ka|sore\s*ka|malam\s*ka|terima\s*kasih\s*ka)\b/i,
  /\b(pesan\s*dari|membalas\s*pesan|chat\s*baru)\b/i,
  /\b(bisa\s*ka|baik\s*ka|oke\s*ka|iya\s*ka)\b/i,
];

// Pola promosi, voucher, diskon, kuis/gamifikasi, dan iklan marketing e-wallet/bank
const PROMO_PATTERNS = [
  /\b(?:roda\s*hadiah|spin\s*(?:&|and)\s*win|putar\s*roda|goyang\s*shopee|tebak\s*kata|shopee\s*games|lucky\s*draw|undian|buka\s*kado|mainkan\s*game)\b/i,
  /\b(?:diskon|cashback|voucher|kupon|ongkir|promo|deals?|penawaran)\b/i,
  /\b(?:klaim\s*(?:paket|data|koin|coins?|poin|voucher|hadiah|bonus|cashback|saldo|reward))\b/i,
  /\b(?:gratis\s*(?:\d+\s*(?:bulan|hari|minggu|tahun)|ongkir|kuota|langganan|biaya\s*admin)|google\s*one\s*gratis|free\s*trial)\b/i,
  /\b(?:nonton\s*.*\s*klaim|paket\s*data\s*hemat|nonton\s*anime)\b/i,
  /\b(?:buat\s*kamu!?|khusus\s*(?:untukmu|buat\s*kamu)|eksklusif\s*untukmu|jangan\s*lewatkan|serbu\s*sekarang|buruan\s*cek|yuk\s*belanja|hanya\s*hari\s*ini|spesial\s*hari\s*ini)\b/i,
  /\b(?:cuma\s*(?:rp\s*)?(?:0|1|\d+[\d.,]*)\b|hanya\s*(?:rp\s*)?(?:0|1|\d+[\d.,]*)\b|mulai\s*(?:dari\s*)?(?:rp\s*)?(?:0|1|\d+[\d.,]*)\b)/i,
  /\b(?:menangkan\s*(?:hadiah|uang|saldo|koin|coins?|poin|s\.?d\.?|hingga))\b/i,
  /\b(?:dapatkan\s*(?:diskon|cashback|bonus|koin|coins?|poin|hadiah|voucher|gratis))\b/i,
  /\b(?:s\.?d\.?|up\s*to|hingga)\s*(?:rp|idr)?\.?\s*\d+/i,
  /\bflash\s*(?:coffee|sale|deal)\b/i,
  /\bngopi\s*hemat\b/i,
  /\b(?:asuransi(?:\s+penipuan|\s+digital)?|perlindungan\s+dari|aktifkan\s+asuransi|cuma\s+bayar\s+\d+\s+bulan)\b/i,
  /\bcuma\s+(?:dengan\s+)?(?:rp|idr)?\.?\s*\d+/i,
  /\b(?:top\s*up|isi\s*saldo|isi\s*ulang|bayar\s*tagihan|beli\s*pulsa)\s+.*?\b(?:dapat|dapetin|bonus|untung|hemat|diskon|cashback|hadiah|gratis|cuma|hanya|pakai\s+kode)\b/i,
  /\b(?:dapat|dapetin|klaim|serbu|nikmati|ambil)\s+.*?\b(?:voucher|kupon|saldo\s+dana|dana\s+kaget|hadiah|cashback|diskon|potongan|reward)\b/i,
  /\b(?:dana\s*kaget|a\+\s*rewards?|dana\s*deals?|dana\s*points?|dana\s*surprize|danamon\s*promo)\b/i,
  /\b(?:paylater|spaylater|spinjam|gopay\s*pinjam|dana\s*cicil|pinjaman\s*(?:online|cepat|tunai)|limit\s*(?:kredit|tersedia|hingga)|ajukan\s*(?:sekarang|pinjaman|kartu)|bunga\s*0%|cicilan\s*0%|kode\s*referral|ajak\s*teman|upgrade\s*(?:plus|premium)|poin\s*(?:akan\s*)?(?:hangus|kadaluarsa))\b/i,
  /\b(?:selamat\s*(?:anda|kamu)\s*(?:mendapatkan|memenangkan)|tukar\s*(?:poin|koin|coins)|bebas\s*(?:admin|ongkir)|top\s*up\s+min\.?\s*rp)\b/i,
];

// Pola bukti transaksi sah yang SUDAH SELESAI / BERHASIL (Past-Tense Confirmation ketat)
const CONFIRMED_TRANSACTION_PATTERNS = [
  /\b(?:kamu\s+telah\s+(?:membayar|mentransfer|melakukan\s+pembayaran|menerima)|you(?:'ve|\s+have)\s+(?:paid|transferred|made\s+a\s+payment|spent))\b/i,
  /\b(?:pembayaran|payment|transfer|kirim\s+uang|bayar\s+qris|pembelian)\s+(?:ke\s+.+?\s+)?(?:sebesar|senilai|rp)?[\w\s.,]*\b(?:berhasil|sukses|successful|completed|selesai|lunas)\b/i,
  /\b(?:berhasil\s+(?:membayar|transfer|mentransfer|kirim|top\s*up|beli)|sukses\s+(?:membayar|transfer|kirim))\b/i,
  /\b(?:uang\s+masuk|dana\s+masuk|transfer\s+masuk|dana\s+diterima|menerima\s+dana|menerima\s+transfer)\s*(?:sebesar|senilai|dari|rp)?\b/i,
  /\b(?:debit|kredit)\s+rekening\s+(?:berhasil|sukses)\b/i,
  /\bqris\s+payment\s+(?:to\s+.*?\s+)?(?:was\s+)?successful\b/i,
  /\byou(?:'ve|\s+have)\s+received\b/i,
  /\b(?:sent\s+you|received\s+(?:rp|idr)|transferred\s+(?:rp|idr)|spent\s+(?:rp|idr)|paid\s+(?:rp|idr))\b/i,
  /\b(?:transaksi\s+(?:pembayaran\s+)?berhasil|transaction\s+successful)\b/i,
];

/**
 * Ekstraksi kode referensi transaksi bank/e-wallet untuk layer dedupe tambahan
 */
export function extractReferenceCode(text: string): string | null {
  const match = text.match(
    /\b(?:no\.?\s*ref(?:erensi)?|ref(?:erence)?(?:\s*no\.?|\s*id)?|rrn|id\s*transaksi|trx\s*id|trace\s*no)\s*[:#=-]?\s*([A-Z0-9-]{6,32})\b/i
  );
  return match && match[1] ? match[1].toUpperCase() : null;
}

// Pola transaksi keuangan sah umum (m-banking & e-wallet Indonesia)
const FINANCIAL_ACTION_PATTERNS = [
  /\b(berhasil|sukses|successful|completed|terkirim)\b/i,
  /\b(pembayaran|payment|paid|bayar|spent)\b/i,
  /\b(transfer|transferred|mentransfer|kirim\s*uang)\b/i,
  /\b(terima|diterima|received|incoming|masuk|top\s*up|kredit|debit|deposit|credited)\b/i,
  /\b(qris|edc|merchant)\b/i,
  /\b(uang\s*keluar|uang\s*masuk|dana\s*masuk|transfer\s*masuk)\b/i,
  /\b(kamu\s+telah\s+(?:membayar|mentransfer|menerima|melakukan)|you(?:'ve|\s+have)\s+(?:made|paid|transferred|spent|received))\b/i,
  /\b(kantong|jago|bank\s*jago|seabank|bank\s*bke)\b/i,
  /\b(transaksi|transaction)\b/i,
];

/**
 * Deteksi nama akun bank atau e-wallet dari packageName atau teks
 */
export function detectAccountInfo(appName: string, text: string): { name: string; type: 'bank' | 'ewallet' } {
  const app = (appName || '').toLowerCase();

  // Prioritas 1: Berdasarkan nama aplikasi pengirim (packageName / appName)
  if (app.includes('jago')) return { name: 'Jago', type: 'bank' };
  if (app.includes('livin') || app.includes('mandiri') || app.includes('bmri')) return { name: 'Mandiri', type: 'bank' };
  if (app.includes('bca') || app.includes('mybca')) return { name: 'BCA', type: 'bank' };
  if (app.includes('brimo') || app.includes('bri')) return { name: 'BRI', type: 'bank' };
  if (app.includes('bni') || app.includes('wondr')) return { name: 'BNI', type: 'bank' };
  if (app.includes('bsi') || app.includes('bsm') || app.includes('byond')) return { name: 'BSI', type: 'bank' };
  if (app.includes('seabank') || app.includes('bankbke')) return { name: 'SeaBank', type: 'bank' };
  if (app.includes('saqu') || app.includes('bjj')) return { name: 'Bank Saqu', type: 'bank' };
  if (app.includes('blu')) return { name: 'blu BCA', type: 'bank' };
  if (app.includes('shopeepay') || app.includes('shopee')) return { name: 'ShopeePay', type: 'ewallet' };
  if (app.includes('gopay') || app.includes('gojek')) return { name: 'GoPay', type: 'ewallet' };
  if (app.includes('dana')) return { name: 'DANA', type: 'ewallet' };
  if (app.includes('ovo')) return { name: 'OVO', type: 'ewallet' };
  if (app.includes('linkaja') || app.includes('cpm')) return { name: 'LinkAja', type: 'ewallet' };

  // Prioritas 2: Berdasarkan isi teks jika nama aplikasi tidak spesifik
  const combined = `${appName} ${text}`.toLowerCase();

  if (combined.includes('jago')) return { name: 'Jago', type: 'bank' };
  if (combined.includes('livin') || combined.includes('mandiri') || combined.includes('bmri')) return { name: 'Mandiri', type: 'bank' };
  if (combined.includes('bca') || combined.includes('mybca')) return { name: 'BCA', type: 'bank' };
  if (combined.includes('brimo') || combined.includes('bri')) return { name: 'BRI', type: 'bank' };
  if (combined.includes('bni') || combined.includes('wondr')) return { name: 'BNI', type: 'bank' };
  if (combined.includes('bsi') || combined.includes('bsm') || combined.includes('byond')) return { name: 'BSI', type: 'bank' };
  if (combined.includes('seabank') || combined.includes('bankbke')) return { name: 'SeaBank', type: 'bank' };
  if (combined.includes('saqu') || combined.includes('bjj')) return { name: 'Bank Saqu', type: 'bank' };
  if (combined.includes('blu')) return { name: 'blu BCA', type: 'bank' };
  if (combined.includes('shopeepay') || combined.includes('shopee')) return { name: 'ShopeePay', type: 'ewallet' };
  if (combined.includes('gopay') || combined.includes('gojek')) return { name: 'GoPay', type: 'ewallet' };
  if (combined.includes('dana')) return { name: 'DANA', type: 'ewallet' };
  if (combined.includes('ovo')) return { name: 'OVO', type: 'ewallet' };
  if (combined.includes('linkaja')) return { name: 'LinkAja', type: 'ewallet' };

  return { name: 'BCA', type: 'bank' };
}

/**
 * Ekstraksi tanggal & waktu transaksi dari isi notifikasi (WIB / Asia/Jakarta)
 * Contoh: "12 October 2026, 17:11 WIB" -> "2026-10-12T10:11:00.000Z" (sore hari)
 */
export function extractNotificationDate(text: string): string | null {
  const MONTHS: Record<string, number> = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    agu: 7, agustus: 7, aug: 7, august: 7,
    sep: 8, september: 8,
    okt: 9, oktober: 9, oct: 9, october: 9,
    nop: 10, nov: 10, november: 10,
    des: 11, desember: 11, dec: 11, december: 11,
  };

  // 1. Pola: "12 October 2026, 17:11 WIB" atau "12 Okt 2026 17:11"
  const textDateMatch = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})[,\s]+(?:pukul\s+)?(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(?:wib|wita|wit)?\b/i);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const mStr = textDateMatch[2].toLowerCase();
    const year = parseInt(textDateMatch[3], 10);
    const hour = parseInt(textDateMatch[4], 10);
    const minute = parseInt(textDateMatch[5], 10);
    const second = textDateMatch[6] ? parseInt(textDateMatch[6], 10) : 0;

    if (MONTHS[mStr] !== undefined) {
      const month = MONTHS[mStr];
      const utcMs = Date.UTC(year, month, day, hour - 7, minute, second);
      return new Date(utcMs).toISOString();
    }
  }

  // 2. Pola numerik: "12-10-2026 17:11" atau "12/10/2026 17:11"
  const numericDateMatch = text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})[,\s]+(?:pukul\s+)?(\d{1,2})[:.](\d{2})(?::(\d{2}))?\b/);
  if (numericDateMatch) {
    const day = parseInt(numericDateMatch[1], 10);
    const month = parseInt(numericDateMatch[2], 10) - 1;
    const year = parseInt(numericDateMatch[3], 10);
    const hour = parseInt(numericDateMatch[4], 10);
    const minute = parseInt(numericDateMatch[5], 10);
    const second = numericDateMatch[6] ? parseInt(numericDateMatch[6], 10) : 0;
    const utcMs = Date.UTC(year, month, day, hour - 7, minute, second);
    return new Date(utcMs).toISOString();
  }

  return null;
}

/**
 * Ekstraksi nominal rupiah dari judul dan isi teks secara presisi
 * Mendukung variasi format Indonesia (titik) & perbankan Inggris (koma), serta unit singkatan (73rb, 73k)
 */
export function extractNominal(text: string): number {
  if (!text || typeof text !== 'string') return 0;

  // 1. Bersihkan kuantitas non-mata uang: "1.000.000 Coins", "50.000 Poin", "10 GB", "3 Bulan"
  // agar angka non-uang tidak dikira nominal rupiah
  let cleanedText = text.replace(
    /\b\d+[\d.,]*\s*(?:coins?|koin|poin|points?|tiket|kupon|voucher|kali|hari|bulan|minggu|tahun|orang|gb|mb|kb|km|meter|kg|gr|gram|xp|level)\b/gi,
    ' '
  );

  // 2. Bersihkan batas promo / diskon maksimum: "Diskon s.d. 100RB", "Cashback hingga 50.000", "hemat up to 25k"
  // agar angka batas diskon tidak terambil sebagai nominal belanja
  cleanedText = cleanedText.replace(
    /\b(?:diskon|cashback|potongan(?:\s+harga)?|hemat|menangkan|s\.?d\.?|up\s*to|hingga)\s*(?:sebesar\s+)?(?:rp|idr)?\.?\s*\d+[\d.,]*(?:\s*(?:rb|k|ribu|jt|juta|%))?/gi,
    ' '
  );

  // 3. Bersihkan nominal umpan clickbait marketing ("cuma Rp 1", "hanya Rp 0", "mulai Rp 1")
  cleanedText = cleanedText.replace(
    /\b(?:cuma|hanya|mulai(?:\s+dari)?)\s*(?:rp|idr)?\.?\s*(?:0|1)\b/gi,
    ' '
  );

  // 4. Format singkatan rupiah: 73rb, 73 rb, 73ribu, 73 ribu, 73k, 1.5jt, dll.
  const shorthandMatch = cleanedText.match(/(?:rp|idr)?\.?\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)\b/i);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1].replace(',', '.'));
    const unit = shorthandMatch[2].toLowerCase();
    if (!isNaN(num) && num > 0) {
      if (unit === 'rb' || unit === 'ribu' || unit === 'k') return Math.round(num * 1000);
      if (unit === 'jt' || unit === 'juta') return Math.round(num * 1000000);
    }
  }

  // 5. Format standar: Rp 10.000 / Rp 10,000 / IDR 10,000 / Rp 10.000,00 / Rp 10,000.00
  const rpRegex = /(?:rp|idr)\.?\s*([\d.,]+)/gi;
  const candidates: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = rpRegex.exec(cleanedText)) !== null) {
    let raw = match[1].trim().replace(/[.,]+$/, '');
    if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})$/.test(raw)) {
      raw = raw.slice(0, -3);
    }
    const cleaned = raw.replace(/[.,]/g, '');
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) {
      candidates.push(val);
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  // 6. Keyword konteks finansial (sebesar 10.000, total 10,000, amount Rp 10.000, uang keluar 10.000)
  const kwRegex = /(?:sebesar|nominal|total|amount|paid|transferred|spent|uang keluar|uang masuk)\s*(?:rp|idr)?\.?\s*([\d.,]+)/gi;
  while ((match = kwRegex.exec(cleanedText)) !== null) {
    let raw = match[1].trim().replace(/[.,]+$/, '');
    if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})$/.test(raw)) {
      raw = raw.slice(0, -3);
    }
    const cleaned = raw.replace(/[.,]/g, '');
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) {
      return val;
    }
  }

  // 7. Pola angka ribuan murni (10.000 atau 73.000 atau 10,000)
  const thousandsMatch = cleanedText.match(/\b([1-9]\d{0,2}(?:[.,]\d{3})+)\b/);
  if (thousandsMatch) {
    const cleaned = thousandsMatch[1].replace(/[.,]/g, '');
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0 && val !== 2024 && val !== 2025 && val !== 2026) return val;
  }

  return 0;
}

// Pola sumber dana / kantong internal e-wallet yang BUKAN merupakan nama merchant
const WALLET_POCKET_PATTERNS = /^(?:your\s+daily\s+pocket|daily\s+pocket|pocket|kantong|kantong\s+harian|kantong\s+utama|saldo|saldo\s+utama|rekening\s+utama)$/i;

/**
 * Ekstraksi nama merchant / tujuan transaksi
 */
export function extractMerchant(title: string, text: string, defaultAccount: string): string {
  const combined = `${title} ${text}`;

  // 1. Pola tujuan: "ke <Merchant>" / "kepada <Merchant>" / "to <Merchant>" / "di <Merchant>" / "at <Merchant>"
  // Prioritaskan tujuan (ke/to/top up/di) daripada sumber (dari/from)
  const matchTarget = combined.match(
    /\b(?:ke|kepada|pembayaran\s+ke|payment\s+to|transferred\s+to|paid\s+to|paid\s+(?:rp|idr)?\.?\s*[\d.,]+\s+to|transfer\s+ke|kirim\s+ke|top\s*up\s+(?:ke\s+)?|isi\s*saldo\s+(?:ke\s+)?|to|di|at)\b\s+([A-Za-z0-9\s&'._,-]{2,50})/i
  );
  if (matchTarget && matchTarget[1]) {
    // Potong jika ada titik penutup kalimat sebelum kalimat bantuan (misal ". Need help?")
    const firstSentence = matchTarget[1].split(/[.!?](?:\s|$)/)[0];
    const cleanMerchant = (firstSentence || matchTarget[1])
      .trim()
      .replace(/\s+(berhasil|sukses|pada|tanggal|tgl|sebesar|senilai|rp|idr|successful|was\s+successful|is\s+successful|completed|need\s+help|butuh\s+bantuan|hubungi|contact|tanya\s+jago).*$/i, '')
      .replace(/[,.-]+$/, '')
      .trim();
    if (
      cleanMerchant.length >= 2 &&
      !/^(?:notifikasi|informasi|status|rp|idr)$/i.test(cleanMerchant) &&
      !WALLET_POCKET_PATTERNS.test(cleanMerchant) &&
      cleanMerchant.toLowerCase() !== (defaultAccount || '').toLowerCase()
    ) {
      return cleanMerchant;
    }
  }

  // 2. Pola sumber: "dari <Pengirim>" / "from <Pengirim>"
  const matchSource = combined.match(/\b(?:dari|from)\b\s+([A-Za-z0-9\s&'._,-]{2,50})/i);
  if (matchSource && matchSource[1]) {
    const firstSentence = matchSource[1].split(/[.!?](?:\s|$)/)[0];
    const cleanSource = (firstSentence || matchSource[1])
      .trim()
      .replace(/\s+(berhasil|sukses|pada|tanggal|tgl|sebesar|senilai|rp|idr).*$/i, '')
      .replace(/[,.-]+$/, '')
      .trim();
    if (
      cleanSource.length >= 2 &&
      !WALLET_POCKET_PATTERNS.test(cleanSource) &&
      cleanSource.toLowerCase() !== (defaultAccount || '').toLowerCase()
    ) {
      return cleanSource;
    }
  }

  // 3. Fallback: jika judul bukan username chat, bukan nama kantong e-wallet, dan tidak generik
  if (
    title &&
    title.length > 2 &&
    !/notif|transaksi|bank|promo|deals|pembayaran/i.test(title) &&
    !WALLET_POCKET_PATTERNS.test(title.trim()) &&
    !title.includes('.id') &&
    !title.includes('_')
  ) {
    return title.trim();
  }

  return defaultAccount || 'Merchant Transaksi';
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fallback AI Gemini Flash untuk ekstraksi teks notifikasi jika regex belum yakin
 */
/**
 * Helper terpusat pemanggilan REST Gemini Flash (timeout cepat & tanpa thinking overhead)
 */
async function callGeminiFlashJson<T>(
  prompt: string,
  apiKey: string,
  timeoutMs: number = 3500
): Promise<T | null> {
  const models = ['gemini-2.5-flash', 'gemini-flash-latest'];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.05,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!res.ok) {
        if (i < models.length - 1) await sleep(150);
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleaned = rawText
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      return JSON.parse(cleaned) as T;
    } catch {
      if (i < models.length - 1) await sleep(150);
    }
  }

  return null;
}

/**
 * Fallback AI Gemini Flash untuk ekstraksi teks notifikasi jika regex belum yakin
 */
async function analyzeWithGeminiFlash(
  appName: string,
  title: string,
  content: string,
  apiKey: string
): Promise<{ isTransaction: boolean; amount: number; merchant: string; accountName: string; direction: 'in' | 'out' } | null> {
  const prompt = `Analisis notifikasi perbankan/e-wallet Indonesia berikut dan pastikan apakah benar-benar transaksi uang riil:
Aplikasi: ${appName}
Judul: ${title}
Isi Pesan: ${content}

Aturan:
- Chat penjual/pembeli, promo, diskon, cashback, voucher, tawaran pinjaman/paylater, ajakan klaim, deals -> isTransaction = false, amount = 0.
- Jika transaksi/transfer/pembayaran riil sudah terjadi -> isTransaction = true, amount = integer rupiah murni.

Kembalikan HANYA JSON:
{"isTransaction":boolean,"amount":number,"direction":"out"|"in","merchant":"string","accountName":"string"}`;

  const parsed = await callGeminiFlashJson<Record<string, unknown>>(prompt, apiKey, 3500);
  if (!parsed) return null;

  return {
    isTransaction: Boolean(parsed.isTransaction),
    amount: Number(parsed.amount) || 0,
    merchant: String(parsed.merchant || ''),
    accountName: String(parsed.accountName || ''),
    direction: parsed.direction === 'in' ? 'in' : 'out',
  };
}

/**
 * Pengayaan AI Sinkron (Fast-Path) untuk verifikasi anti-spam, perbaikan nama merchant, dan pemisahan 9 kategori:
 * Belanja Dapur vs Makan Harian vs Jajan vs Transportasi/Bensin vs Tagihan & Utilitas vs Kebutuhan Rumah vs Jalan-jalan vs Keperluan Mendadak vs Lainnya.
 */
export async function enhanceNotificationWithSyncAI(
  appName: string,
  title: string,
  content: string,
  regexDraft: ParsedNotificationResult,
  apiKey: string
): Promise<SyncAiEnhancementResult | null> {
  if (!apiKey) return null;

  const prompt = `Kamu validator & kategorizer transaksi keuangan keluarga Indonesia yang sangat ketat dan cepat.
Notifikasi:
- App: ${appName}
- Judul: ${title}
- Isi: ${content}
Draft Regex: nominal=${regexDraft.amount}, direction=${regexDraft.direction}, merchant="${regexDraft.merchant}", akun="${regexDraft.accountName}"

Tugas 1 (Anti-Spam):
Tolak (isTransaction=false) jika ini promo, iklan, tawaran cashback/voucher/koin/diskon, ajakan klaim, paylater/pinjaman, reminder tagihan belum dibayar, atau chat marketplace.
Terima (isTransaction=true) HANYA jika uang benar-benar sudah keluar atau masuk.

Tugas 2 (Kategori):
Pilih tepat SATU dari daftar resmi ini:
- "Belanja Dapur": pasar, sayur, buah, bumbu, beras, daging, telur, sembako, gas LPG, air galon.
- "Makan Harian": makanan pokok, warteg, nasi, lauk matang, mie/bakso/soto/geprek/sate, resto makan berat, GoFood/GrabFood makan berat.
- "Jajan": kopi, es teh/cokelat, boba, snack, roti, kue, martabak, gorengan, cilok, es krim, dessert, cemilan.
- "Transportasi/Bensin": SPBU, BBM, Pertalite/Pertamax, ojek online, parkir, tol, KRL/MRT/KAI.
- "Tagihan & Utilitas": listrik PLN, PDAM, WiFi/internet, pulsa, kuota data, BPJS, IPL, cicilan.
- "Kebutuhan Rumah": sabun, detergen, tisu, perabot, belanja online non-makan, perlengkapan anak/popok/susu.
- "Jalan-jalan": wisata, hotel, bioskop, hiburan, staycation, tiket hiburan.
- "Keperluan Mendadak": obat, apotek, klinik, dokter, rumah sakit, servis darurat.
- "Lainnya": pengeluaran lain yang tidak masuk 8 pos di atas.
- "Gaji/Pemasukan": khusus direction="in".
- "Transfer Internal": pindah saldo/top up ke rekening atau e-wallet milik sendiri.

Kembalikan HANYA JSON ringkas:
{"isTransaction":boolean,"amount":number,"direction":"out"|"in","merchant":"nama toko bersih","accountName":"${regexDraft.accountName}","categoryName":"nama kategori resmi","reason":"singkat max 8 kata"}`;

  const parsed = await callGeminiFlashJson<Record<string, unknown>>(prompt, apiKey, 3500);
  if (!parsed) return null;

  return {
    isTransaction: Boolean(parsed.isTransaction),
    amount: Math.max(0, Math.round(Number(parsed.amount) || regexDraft.amount)),
    direction: parsed.direction === 'in' ? 'in' : 'out',
    merchant: String(parsed.merchant || regexDraft.merchant || '').trim(),
    accountName: String(parsed.accountName || regexDraft.accountName || '').trim(),
    categoryName: String(parsed.categoryName || 'Lainnya').trim(),
    reason: parsed.reason ? String(parsed.reason) : undefined,
  };
}

/**
 * Parser Utama Notifikasi Ponsel (3 Layer Parsing + Layer Adaptif)
 */
export async function parseNotificationPayload(
  appName: string,
  title: string,
  content: string,
  geminiApiKey?: string,
  learnedRules?: string[]
): Promise<ParsedNotificationResult> {
  const combinedText = `${title} ${content}`.trim();
  const lowerCombined = combinedText.toLowerCase();

  // 1. Deteksi Chat Penjual / Pembeli (Shopee Chat, Marketplace Chat)
  const isChatAppName = appName.toLowerCase().includes('shopee') || appName.toLowerCase().includes('tokopedia');
  const isBankApp = /jago|mandiri|livin|bmri|bca|mybca|bri|brimo|bni|wondr|bsi|bsm|byond|seabank|bankbke|saqu|bjj|blu/i.test(`${appName} ${title}`);
  const hasFinancialWords = FINANCIAL_ACTION_PATTERNS.some((p) => p.test(combinedText));
  const hasNoFinancialWords = !hasFinancialWords;

  // Notifikasi chat: HANYA jika BUKAN aplikasi bank resmi dan tidak memiliki kata kunci transaksi finansial
  const isChatText = CHAT_PATTERNS.some((pattern) => pattern.test(combinedText));
  const isChat = !isBankApp && (isChatText || (isChatAppName && hasNoFinancialWords && !combinedText.includes('Rp')));

  if (isChat) {
    return {
      isTransaction: false,
      amount: 0,
      direction: 'out',
      merchant: title || 'Chat Shopee',
      accountName: 'ShopeePay',
      accountType: 'ewallet',
      reference: null,
      outcome: 'ignored',
      reasons: ['Notifikasi berupa obrolan/chat penjual dan bukan transaksi keuangan'],
      parseMethod: 'regex',
    };
  }

  // 1.5. Deteksi Aturan Pembelajaran Adaptif (Learned Promo Rules) & Kalimat Ajakan Marketing
  const hasMarketingCTA = MARKETING_CALL_TO_ACTION_PATTERN.test(combinedText);
  const hasRawConfirmation = CONFIRMED_TRANSACTION_PATTERNS.some((pattern) => pattern.test(combinedText));
  const hasStrictConfirmation = hasRawConfirmation && !hasMarketingCTA;

  if (learnedRules && learnedRules.length > 0) {
    const adaptiveMatch = matchesLearnedRules(combinedText, learnedRules);
    if (adaptiveMatch.matched && !hasStrictConfirmation) {
      const fallbackAcc = detectAccountInfo(appName, combinedText);
      return {
        isTransaction: false,
        amount: 0,
        direction: 'out',
        merchant: title || 'Promo Terdeteksi (Adaptif)',
        accountName: fallbackAcc.name,
        accountType: fallbackAcc.type,
        reference: null,
        outcome: 'ignored',
        reasons: [`Ditolak oleh aturan regex adaptif: "${adaptiveMatch.rule}"`],
        parseMethod: 'regex',
      };
    }
  }

  // 2. Deteksi Promo / Voucher / Diskon / Gamifikasi / Iklan Marketing
  // Hanya boleh lewat jika memenuhi bukti konfirmasi transaksi sah DAN bebas ajakan marketing
  const isPromoDetected = PROMO_PATTERNS.some((pattern) => pattern.test(combinedText));

  if ((isPromoDetected || hasMarketingCTA) && !hasStrictConfirmation) {
    const fallbackAcc = detectAccountInfo(appName, combinedText);
    return {
      isTransaction: false,
      amount: 0,
      direction: 'out',
      merchant: title || 'Promo Penawaran',
      accountName: fallbackAcc.name,
      accountType: fallbackAcc.type,
      reference: null,
      outcome: 'ignored',
      reasons: ['Notifikasi berupa penawaran promo / voucher / marketing dan bukan transaksi sah'],
      parseMethod: 'regex',
    };
  }

  // 3. Ekstraksi Akun & Arah Transaksi
  const accountInfo = detectAccountInfo(appName, combinedText);
  const isIncoming = /masuk|menerima|diterima|top up|kredit|received|incoming|sent you|credited|deposit/i.test(lowerCombined);
  const direction: 'in' | 'out' = isIncoming ? 'in' : 'out';

  // 4. Ekstraksi Nominal Angka, Kode Referensi & Tanggal
  let amount = extractNominal(combinedText);
  let merchant = extractMerchant(title, combinedText, accountInfo.name);
  const reference = extractReferenceCode(combinedText);
  const transactionDate = extractNotificationDate(combinedText) || undefined;

  // 5. Fallback ke AI Gemini Flash HANYA jika nominal belum terdeteksi namun ada bukti transaksi sah
  if (amount === 0 && hasStrictConfirmation && !isPromoDetected && geminiApiKey) {
    const aiResult = await analyzeWithGeminiFlash(appName, title, content, geminiApiKey);
    if (aiResult && aiResult.isTransaction && aiResult.amount > 0) {
      amount = aiResult.amount;
      if (aiResult.merchant) merchant = aiResult.merchant;
      return {
        isTransaction: true,
        amount,
        direction: aiResult.direction,
        merchant,
        accountName: aiResult.accountName || accountInfo.name,
        accountType: accountInfo.type,
        reference,
        outcome: 'transaction',
        reasons: ['Diekstraksi cerdas oleh Gemini Flash AI Fallback'],
        parseMethod: 'ai_gemini',
        transactionDate,
        hasStrictConfirmation,
      };
    }
  }

  // 6. Evaluasi Akhir: Transaksi Sah HANYA jika amount > 0 dan lolos saringan promo/marketing
  const isTransaction = amount > 0 && (hasStrictConfirmation || (!isPromoDetected && !hasMarketingCTA));

  return {
    isTransaction,
    amount: isTransaction ? amount : 0,
    direction,
    merchant,
    accountName: accountInfo.name,
    accountType: accountInfo.type,
    reference,
    outcome: isTransaction ? 'transaction' : 'ignored',
    reasons: isTransaction ? [] : ['Nominal transaksi tidak terdeteksi atau terindikasi bukan transaksi riil'],
    parseMethod: 'regex',
    transactionDate,
    hasStrictConfirmation,
  };
}
