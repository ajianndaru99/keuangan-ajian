// ==============================================================================
// NOTIFICATION PARSER & AI ANALYZER: src/lib/ai/notification-parser.ts
// Modul cerdas pemfilter chat/promo dan ekstraksi notifikasi perbankan & e-wallet
// Menggabungkan Regex Berkecepatan Tinggi + Fallback AI Vision/Text Google Gemini Flash
// ==============================================================================

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

// Pola promosi, voucher, dan iklan yang bukan transaksi riil
const PROMO_PATTERNS = [
  /\bcuma\s+\d+/i,
  /\bflash\s*(?:coffee|sale|deal)\b/i,
  /\bdeals\s*sekitarmu\b/i,
  /\bngopi\s*hemat\b/i,
  /\bdiskon\s*(?:hingga|s\/d|up\s*to|\d+%)/i,
  /\bvoucher\s*(?:diskon|cashback|gratis)\b/i,
  /\bpromo\s*(?:spesial|terbatas|spesial\s*hari\s*ini)\b/i,
  /\bgratis\s*ongkir\b/i,
  /\bklaim\s*(?:hadiah|koin|reward)\b/i,
];

// Pola transaksi keuangan sah (m-banking & e-wallet Indonesia)
const FINANCIAL_ACTION_PATTERNS = [
  /\b(berhasil|sukses|successful|terkirim)\b/i,
  /\b(pembayaran|payment|paid|bayar|spent)\b/i,
  /\b(transfer|transferred|mentransfer|kirim\s*uang)\b/i,
  /\b(terima|diterima|received|incoming|masuk|top\s*up|kredit|debit)\b/i,
  /\b(qris|edc|merchant)\b/i,
  /\b(uang\s*keluar|uang\s*masuk|dana\s*masuk|transfer\s*masuk)\b/i,
  /\b(kamu\s+telah\s+(?:membayar|mentransfer|menerima|melakukan)|you\s+have\s+(?:made|paid|transferred))\b/i,
  /\b(kantong|jago|bank\s*jago)\b/i,
  /\b(transaksi|transaction)\b/i,
];

/**
 * Deteksi nama akun bank atau e-wallet dari packageName atau teks
 */
export function detectAccountInfo(appName: string, text: string): { name: string; type: 'bank' | 'ewallet' } {
  const combined = `${appName} ${text}`.toLowerCase();

  if (combined.includes('jago')) return { name: 'Jago', type: 'bank' };
  if (combined.includes('livin') || combined.includes('mandiri')) return { name: 'Mandiri', type: 'bank' };
  if (combined.includes('bca')) return { name: 'BCA', type: 'bank' };
  if (combined.includes('brimo') || combined.includes('bri')) return { name: 'BRI', type: 'bank' };
  if (combined.includes('shopeepay') || combined.includes('shopee')) return { name: 'ShopeePay', type: 'ewallet' };
  if (combined.includes('gopay') || combined.includes('gojek')) return { name: 'GoPay', type: 'ewallet' };
  if (combined.includes('dana')) return { name: 'DANA', type: 'ewallet' };
  if (combined.includes('ovo')) return { name: 'OVO', type: 'ewallet' };

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
  // 1. Format singkatan: 73rb, 73 rb, 73ribu, 73 ribu, 73k, 1.5jt, dll.
  const shorthandMatch = text.match(/(?:rp|idr)?\.?\s*(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)\b/i);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1].replace(',', '.'));
    const unit = shorthandMatch[2].toLowerCase();
    if (!isNaN(num) && num > 0) {
      if (unit === 'rb' || unit === 'ribu' || unit === 'k') return Math.round(num * 1000);
      if (unit === 'jt' || unit === 'juta') return Math.round(num * 1000000);
    }
  }

  // 2. Format standar: Rp 10.000 / Rp 10,000 / IDR 10,000 / Rp 10.000,00 / Rp 10,000.00
  const rpRegex = /(?:rp|idr)\.?\s*([\d.,]+)/gi;
  const candidates: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = rpRegex.exec(text)) !== null) {
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

  // 3. Keyword konteks finansial (sebesar 10.000, total 10,000, amount Rp 10.000, uang keluar 10.000)
  const kwRegex = /(?:sebesar|nominal|total|amount|paid|transferred|spent|uang keluar|uang masuk)\s*(?:rp|idr)?\.?\s*([\d.,]+)/gi;
  while ((match = kwRegex.exec(text)) !== null) {
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

  // 4. Pola angka ribuan murni (10.000 atau 73.000 atau 10,000)
  const thousandsMatch = text.match(/\b(\d{1,3}(?:[.,]\d{3})+)\b/);
  if (thousandsMatch) {
    const cleaned = thousandsMatch[1].replace(/[.,]/g, '');
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return 0;
}

/**
 * Ekstraksi nama merchant / tujuan transaksi
 */
export function extractMerchant(title: string, text: string, defaultAccount: string): string {
  const combined = `${title} ${text}`;

  // Pola: "ke <Merchant>" / "di <Merchant>" / "to <Merchant>" / "at <Merchant>"
  const matchTarget = combined.match(/\b(?:ke|di|kepada|pembayaran\s+ke|payment\s+to|transferred\s+to|paid\s+to|transfer\s+ke|kirim\s+ke|to|at)\b\s+([A-Za-z0-9\s&'._,-]{3,50})/i);
  if (matchTarget && matchTarget[1]) {
    const cleanMerchant = matchTarget[1]
      .trim()
      .replace(/\s+(berhasil|sukses|pada|tanggal|tgl|sebesar|senilai|rp|idr|successful|is\s+successful).*$/i, '')
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
 * Parser Utama Notifikasi Ponsel (3 Layer Parsing)
 */
export async function parseNotificationPayload(
  appName: string,
  title: string,
  content: string,
  geminiApiKey?: string
): Promise<ParsedNotificationResult> {
  const combinedText = `${title} ${content}`.trim();
  const lowerCombined = combinedText.toLowerCase();

  // 1. Deteksi Chat Penjual / Pembeli (Shopee Chat, Marketplace Chat)
  const isChatAppName = appName.toLowerCase().includes('shopee') || appName.toLowerCase().includes('tokopedia');
  const isBankApp = /jago|mandiri|livin|bca|bri|brimo|dana|gopay|ovo|seabank/i.test(`${appName} ${title}`);
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

  // 2. Deteksi Promo / Voucher / Diskon Iklan
  const isPromo = PROMO_PATTERNS.some((pattern) => pattern.test(combinedText));
  if (isPromo && hasNoFinancialWords && !isBankApp) {
    return {
      isTransaction: false,
      amount: 0,
      direction: 'out',
      merchant: title || 'Promo Penawaran',
      accountName: 'ShopeePay',
      accountType: 'ewallet',
      reference: null,
      outcome: 'ignored',
      reasons: ['Notifikasi berupa penawaran promo / voucher'],
      parseMethod: 'regex',
    };
  }

  // 3. Ekstraksi Akun & Arah Transaksi
  const accountInfo = detectAccountInfo(appName, combinedText);
  const isIncoming = /masuk|menerima|diterima|top up|kredit|received|incoming|sent you/i.test(lowerCombined);
  const direction: 'in' | 'out' = isIncoming ? 'in' : 'out';

  // 4. Ekstraksi Nominal Angka & Tanggal
  let amount = extractNominal(combinedText);
  let merchant = extractMerchant(title, combinedText, accountInfo.name);
  const transactionDate = extractNotificationDate(combinedText) || undefined;

  // 5. Fallback ke AI Gemini Flash jika nominal belum terdeteksi namun ada indikasi transaksi
  if (amount === 0 && FINANCIAL_ACTION_PATTERNS.some((p) => p.test(combinedText)) && geminiApiKey) {
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

  // 6. Evaluasi Akhir: Transaksi Sah HANYA jika amount > 0
  const isTransaction = amount > 0;

  return {
    isTransaction,
    amount,
    direction,
    merchant,
    accountName: accountInfo.name,
    accountType: accountInfo.type,
    reference: null,
    outcome: isTransaction ? 'transaction' : 'ignored',
    reasons: isTransaction ? [] : ['Nominal transaksi tidak terdeteksi atau bernilai 0'],
    parseMethod: 'regex',
    transactionDate,
  };
}
