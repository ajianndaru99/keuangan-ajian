// ==============================================================================
// GEMINI TEXT AI ANALYZER: supabase/functions/_shared/parsers/gemini-text.ts
// Fallback cerdas untuk membaca notifikasi bank/e-wallet Indonesia
// Menggunakan Google Gemini Flash (REST API tanpa dependensi eksternal)
// ==============================================================================

export interface GeminiNotificationAnalysis {
  isTransaction: boolean;
  amount: number;
  direction: 'out' | 'in';
  merchant: string;
  accountName: string;
  reference: string | null;
  confidenceScore?: number;
}

const NOTIFICATION_ANALYSIS_PROMPT = `Kamu adalah sistem AI analis notifikasi perbankan & dompet digital Indonesia (BCA, Mandiri, BRI, BNI, Jago, Bank Saqu, BPDDIY, GoPay, ShopeePay, DANA, OVO, AstraPay, QRIS, dll).
Tugasmu: Menganalisis judul & teks notifikasi ponsel untuk menentukan apakah ini bukti transaksi keuangan yang nyata.

Kembalikan HANYA format JSON valid tanpa tanda markdown (tanpa \`\`\`json):
{
  "isTransaction": boolean, // true HANYA jika transaksi pembayaran, transfer, belanja, atau uang masuk yang sah
  "amount": number, // nominal angka rupiah tanpa titik/koma (contoh: 25000). Set 0 jika bukan transaksi.
  "direction": "out" | "in", // "out" untuk uang keluar/belanja/transfer/pembayaran, "in" untuk transfer masuk/dana diterima
  "merchant": "string", // nama penerima, merchant, atau toko yang bertransaksi. Jika transfer pribadi, nama orang. Jika tidak ada nama merchant, gunakan nama aplikasi bank
  "accountName": "string", // nama bank atau e-wallet (contoh: "Bank Jago", "BCA", "GoPay", "ShopeePay", "DANA", "BRI")
  "reference": string | null // nomor referensi / ID transaksi jika tertera di teks, selain itu null
}

ATURAN KETAT:
1. Jika teks berupa promosi, diskon, cashback, voucher, pengingat baterai, verifikasi login, atau OTP -> set isTransaction = false dan amount = 0.
2. Nominal harus berupa integer murni (contoh: "Rp 25.000" -> 25000, "Rp 1.500.000" -> 1500000).
3. Bersihkan nama merchant dari kata penghubung seperti "ke", "di", "kepada", "at", atau tanda baca penutup.`;

/**
 * Menganalisis teks notifikasi menggunakan Gemini Flash REST API
 */
export async function analyzeNotificationWithGemini(
  appName: string,
  title: string,
  text: string,
  apiKey: string,
  preferredModel: string = 'gemini-1.5-flash'
): Promise<GeminiNotificationAnalysis | null> {
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  const models = [preferredModel, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-1.5-flash'];
  const uniqueModels = [...new Set(models)];

  const userContent = `Aplikasi: ${appName}
Judul: ${title}
Isi Pesan: ${text}`;

  for (const model of uniqueModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: NOTIFICATION_ANALYSIS_PROMPT },
                { text: userContent },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (!response.ok) {
        continue; // Coba model fallback jika model tertentu rate-limited atau deprecated
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) continue;

      let cleanedText = rawText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
      }

      const parsed = JSON.parse(cleanedText);

      return {
        isTransaction: Boolean(parsed.isTransaction),
        amount: Number(parsed.amount) || 0,
        direction: parsed.direction === 'in' ? 'in' : 'out',
        merchant: String(parsed.merchant || appName).trim(),
        accountName: String(parsed.accountName || appName).trim(),
        reference: parsed.reference ? String(parsed.reference).trim() : null,
      };
    } catch {
      // Lanjutkan ke kandidat model berikutnya
    }
  }

  return null;
}
