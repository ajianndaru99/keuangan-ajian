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

// Pola transaksi keuangan sah
const FINANCIAL_ACTION_PATTERNS = [
  /\b(berhasil|sukses|successful|terkirim)\b/i,
  /\b(pembayaran|payment|paid|bayar|spent)\b/i,
  /\b(transfer|transferred|mentransfer|kirim\s*uang)\b/i,
  /\b(terima|diterima|received|incoming|masuk|top\s*up|kredit|debit)\b/i,
  /\b(qris|edc|merchant)\b/i,
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
 * Ekstraksi nominal rupiah dari judul dan isi teks secara presisi
 */
export function extractNominal(text: string): number {
  // 1. Format: Rp 10.000 / Rp. 10.000 / IDR 10.000 / Rp10.000
  const rpMatch = text.match(/(?:rp|idr)\.?\s*([\d.]+)/i);
  if (rpMatch && rpMatch[1]) {
    const rawDigits = rpMatch[1].replace(/\./g, '').trim();
    const val = parseInt(rawDigits, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // 2. Format: Sebesar 10.000 / nominal 10.000 / total 10.000 / amount Rp 10.000
  const keywordMatch = text.match(/(?:sebesar|nominal|total|amount|paid|transferred|spent)\s*(?:rp|idr)?\.?\s*([\d.]+)/i);
  if (keywordMatch && keywordMatch[1]) {
    const rawDigits = keywordMatch[1].replace(/\./g, '').trim();
    const val = parseInt(rawDigits, 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Pola angka ribuan Indonesia: 10.000 atau 73.000 (minimal ada 1 titik pemisah ribuan)
  const dotThousandMatch = text.match(/\b(\d{1,3}(?:\.\d{3})+)\b/);
  if (dotThousandMatch && dotThousandMatch[1]) {
    const val = parseInt(dotThousandMatch[1].replace(/\./g, ''), 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return 0;
}

/**
 * Ekstraksi nama merchant / tujuan transaksi
 */
export function extractMerchant(title: string, text: string, defaultAccount: string): string {
  // Pola: "ke <Merchant>" atau "di <Merchant>" atau "to <Merchant>"
  const matchTarget = text.match(/(?:ke|di|kepada|pembayaran ke|payment to|transferred to|paid to)\s+([A-Za-z0-9\s&'._-]{3,35})/i);
  if (matchTarget && matchTarget[1]) {
    const cleanMerchant = matchTarget[1]
      .trim()
      .replace(/\s+(berhasil|sukses|pada|sebesar|rp|idr|successful|is\s+successful).*$/i, '');
    if (cleanMerchant.length >= 2 && !/notifikasi|informasi|status/i.test(cleanMerchant)) {
      return cleanMerchant;
    }
  }

  // Pola subjek email/notif Jago: "You have made a payment to pentol anugerah, BMBNG LP"
  const jagoSubjectMatch = `${title} ${text}`.match(/payment to\s+([A-Za-z0-9\s&'._-]{3,35})/i);
  if (jagoSubjectMatch && jagoSubjectMatch[1]) {
    return jagoSubjectMatch[1].trim().replace(/\s+(berhasil|sukses|pada|sebesar).*$/i, '');
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
  const isChat = CHAT_PATTERNS.some((pattern) => pattern.test(combinedText));
  const isChatAppName = appName.toLowerCase().includes('shopee') || appName.toLowerCase().includes('tokopedia');
  const hasNoFinancialWords = !FINANCIAL_ACTION_PATTERNS.some((p) => p.test(combinedText));

  if (isChat || (isChatAppName && hasNoFinancialWords && !combinedText.includes('Rp'))) {
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
  if (isPromo && hasNoFinancialWords) {
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

  // 4. Ekstraksi Nominal Angka
  let amount = extractNominal(combinedText);
  let merchant = extractMerchant(title, combinedText, accountInfo.name);

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
  };
}
