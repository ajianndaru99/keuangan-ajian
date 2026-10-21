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
}

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
];

// Pola bukti transaksi sah yang SUDAH SELESAI / BERHASIL (Past-Tense Confirmation)
const CONFIRMED_TRANSACTION_PATTERNS = [
  /\b(?:kamu\s+telah\s+(?:membayar|mentransfer|melakukan\s+pembayaran)|you(?:'ve|\s+have)\s+(?:paid|transferred|made\s+a\s+payment|spent))\b/i,
  /\b(?:pembayaran|payment|transfer|kirim\s+uang|transaksi|transaction)\s+.*?\b(?:berhasil|sukses|successful|completed|selesai|lunas)\b/i,
  /\b(?:berhasil\s+(?:membayar|transfer|mentransfer|kirim|top\s*up)|sukses\s+(?:membayar|transfer|kirim))\b/i,
  /\b(?:uang\s+masuk|dana\s+masuk|transfer\s+masuk|dana\s+diterima|menerima\s+dana|menerima\s+transfer)\s*(?:sebesar|senilai)?\b/i,
  /\b(?:debit|kredit)\s+rekening\s+(?:berhasil|sukses)\b/i,
  /\bqris\s+payment\s+(?:to\s+.*?\s+)?(?:was\s+)?successful\b/i,
  /\byou(?:'ve|\s+have)\s+received\b/i,
  /\b(?:sent\s+you|received\s+(?:rp|idr)?|transferred\s+(?:rp|idr)?|spent\s+(?:rp|idr)?|paid\s+(?:rp|idr)?)\b/i,
  /\b(?:transaksi\s+berhasil|transaction\s+successful)\b/i,
];

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

/**
 * Ekstraksi nama merchant / tujuan transaksi
 */
export function extractMerchant(title: string, text: string, defaultAccount: string): string {
  const combined = `${title} ${text}`;

  // Pola: "ke <Merchant>" / "di <Merchant>" / "to <Merchant>" / "at <Merchant>" / "dari <Pengirim>" / "from <Pengirim>"
  const matchTarget = combined.match(/\b(?:ke|di|kepada|pembayaran\s+ke|payment\s+to|transferred\s+to|paid\s+to|transfer\s+ke|kirim\s+ke|to|at|dari|from)\b\s+([A-Za-z0-9\s&'._,-]{3,50})/i);
  if (matchTarget && matchTarget[1]) {
    // Potong jika ada titik penutup kalimat sebelum kalimat bantuan (misal ". Need help?")
    const firstSentence = matchTarget[1].split(/[.!?](?:\s|$)/)[0];
    const cleanMerchant = (firstSentence || matchTarget[1])
      .trim()
      .replace(/\s+(berhasil|sukses|pada|tanggal|tgl|sebesar|senilai|rp|idr|successful|was\s+successful|is\s+successful|completed|need\s+help|butuh\s+bantuan|hubungi|contact|tanya\s+jago).*$/i, '')
      .replace(/[,.-]+$/, '')
      .trim();
    if (cleanMerchant.length >= 2 && !/^(?:notifikasi|informasi|status|rp|idr)$/i.test(cleanMerchant)) {
      return cleanMerchant;
    }
  }

  // Fallback: jika judul bukan username chat dan tidak generik
  if (
    title &&
    title.length > 2 &&
    !/notif|transaksi|bank|promo|deals|pembayaran/i.test(title) &&
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
async function analyzeWithGeminiFlash(
  appName: string,
  title: string,
  content: string,
  apiKey: string
): Promise<{ isTransaction: boolean; amount: number; merchant: string; accountName: string; direction: 'in' | 'out' } | null> {
  const models = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

  const prompt = `Kamu adalah sistem AI verifikasi notifikasi perbankan & e-wallet Indonesia (BCA, Mandiri, BRI, Jago, GoPay, Shopee, DANA, OVO).
Analisis notifikasi ponsel berikut:
Aplikasi: ${appName}
Judul: ${title}
Isi Pesan: ${content}

Tentukan apakah ini transaksi pembayaran/transfer/uang masuk yang sah.
Perhatian ketat:
- Jika ini chat pesan dari penjual/pembeli (contoh: "Baik ka wait ya", "[Stiker]", "Kaka mohon tunggu") -> isTransaction = false, amount = 0.
- Jika ini promo, diskon, cashback, voucher, deals sekitarmu -> isTransaction = false, amount = 0.
- Jika ada nominal pembayaran riil -> isTransaction = true, amount = angka integer rupiah murni.

Kembalikan HANYA format JSON valid tanpa markdown (tanpa \`\`\`json):
{
  "isTransaction": boolean,
  "amount": number,
  "direction": "out" | "in",
  "merchant": "string",
  "accountName": "string"
}`;

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
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[Gemini Flash Rate Limit 429] Model ${model} terkena kuota/rate limit.`);
        }
        if (i < models.length - 1) {
          await sleep(200 * (i + 1));
        }
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      let cleaned = rawText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed = JSON.parse(cleaned);
      return {
        isTransaction: Boolean(parsed.isTransaction),
        amount: Number(parsed.amount) || 0,
        merchant: String(parsed.merchant || ''),
        accountName: String(parsed.accountName || ''),
        direction: parsed.direction === 'in' ? 'in' : 'out',
      };
    } catch {
      if (i < models.length - 1) {
        await sleep(200 * (i + 1));
      }
      continue;
    }
  }

  return null;
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

  // 1.5. Deteksi Aturan Pembelajaran Adaptif (Learned Promo Rules)
  // Kata kunci promo yang dipelajari dari hasil rekonsiliasi Gemini atau aksi manual pengguna
  const hasConfirmedSuccess = CONFIRMED_TRANSACTION_PATTERNS.some((pattern) => pattern.test(combinedText));
  if (learnedRules && learnedRules.length > 0) {
    const adaptiveMatch = matchesLearnedRules(combinedText, learnedRules);
    if (adaptiveMatch.matched && !hasConfirmedSuccess) {
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
  // ATURAN TEGAS: Jika terdeteksi pola promo DAN tidak ada kalimat bukti sukses pembayaran sah (past-tense),
  // MAKA PASTI PROMO dan WAJIB DIABAIKAN LANGSUNG (tanpa memanggil AI Gemini)!
  const isPromoDetected = PROMO_PATTERNS.some((pattern) => pattern.test(combinedText));

  if (isPromoDetected && !hasConfirmedSuccess) {
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
      reasons: ['Notifikasi berupa penawaran promo / voucher / gamifikasi dan bukan transaksi sah'],
      parseMethod: 'regex',
    };
  }

  // 3. Ekstraksi Akun & Arah Transaksi
  const accountInfo = detectAccountInfo(appName, combinedText);
  const isIncoming = /masuk|menerima|diterima|top up|kredit|received|incoming|sent you|credited|deposit/i.test(lowerCombined);
  const direction: 'in' | 'out' = isIncoming ? 'in' : 'out';

  // 4. Ekstraksi Nominal Angka & Tanggal
  let amount = extractNominal(combinedText);
  let merchant = extractMerchant(title, combinedText, accountInfo.name);
  const transactionDate = extractNotificationDate(combinedText) || undefined;

  // 5. Fallback ke AI Gemini Flash HANYA jika nominal belum terdeteksi namun ada bukti transaksi sah
  if (amount === 0 && hasConfirmedSuccess && !isPromoDetected && geminiApiKey) {
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
        reference: null,
        outcome: 'transaction',
        reasons: ['Diekstraksi cerdas oleh Gemini Flash AI Fallback'],
        parseMethod: 'ai_gemini',
        transactionDate,
      };
    }
  }

  // 6. Evaluasi Akhir: Transaksi Sah HANYA jika amount > 0 dan bukan promo
  const isTransaction = amount > 0 && (!isPromoDetected || hasConfirmedSuccess);

  return {
    isTransaction,
    amount: isTransaction ? amount : 0,
    direction,
    merchant,
    accountName: accountInfo.name,
    accountType: accountInfo.type,
    reference: null,
    outcome: isTransaction ? 'transaction' : 'ignored',
    reasons: isTransaction ? [] : ['Nominal transaksi tidak terdeteksi atau terindikasi bukan transaksi riil'],
    parseMethod: 'regex',
    transactionDate,
  };
}
