// ==============================================================================
// TELEGRAM NLP CHAT & PARSER: src/lib/telegram/nlp-chat.ts
// Modul Parsing Pesan Natural Language, Perintah Cepat, dan Q&A Berbasis Gemini
// ==============================================================================

import { formatRupiah } from '../utils.ts';

export interface FinancialContext {
  accounts: Array<{ name: string; owner: string; balance: number }>;
  totalBalance: number;
  totalSpentMonth: number;
  totalBudgetLimit: number;
  daysRemaining: number;
  safeDailySpend: number;
  categoryBudgets: Array<{ name: string; spent: number; limit: number; remaining: number }>;
  periodLabel: string;
}

export interface ExtractedTransaction {
  amount: number;
  merchant: string;
  categoryName: string;
  accountName: string;
  direction: 'out' | 'in';
}

export type NLPProcessResult =
  | {
      type: 'transaction';
      data: ExtractedTransaction;
      replyText: string;
    }
  | {
      type: 'chat_answer';
      replyText: string;
    }
  | {
      type: 'unknown';
      replyText: string;
    };

/**
 * Parsing format nominal rupiah bahasa Indonesia santai
 * Contoh: 38rb -> 38000, 2jt -> 2000000, 1,5jt -> 1500000, 35.000 -> 35000
 */
export function parseNominal(raw: string): number {
  if (!raw) return 0;
  const clean = raw.trim().toLowerCase();

  // 1. Shorthand rupiah (rb, ribu, k, jt, juta)
  const shorthandMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)\b/i);
  if (shorthandMatch) {
    const num = parseFloat(shorthandMatch[1].replace(',', '.'));
    const unit = shorthandMatch[2].toLowerCase();
    if (!isNaN(num) && num > 0) {
      if (unit === 'rb' || unit === 'ribu' || unit === 'k') return Math.round(num * 1000);
      if (unit === 'jt' || unit === 'juta') return Math.round(num * 1000000);
    }
  }

  // 2. Format standar berawalan Rp / IDR atau angka dengan pemisah ribuan
  const digitsOnly = clean.replace(/^(?:rp|idr)\.?\s*/i, '').replace(/[.,]/g, '');
  const val = parseInt(digitsOnly, 10);
  if (!isNaN(val) && val > 0) return val;

  return 0;
}

/**
 * Mendeteksi perintah atur saldo rekening
 * Contoh: "set saldo gopay 38rb", "ubah saldo jago 2jt", "/setsaldo bca 1500000"
 */
export function parseSetSaldoCommand(rawText: string): { accountName: string; amount: number } | null {
  const clean = rawText.trim();
  const pattern = /^(?:\/setsaldo|(?:set|ubah|atur)\s+saldo)\s+([a-zA-Z0-9\s]+?)\s+(?:menjadi|=|\:)?\s*([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const match = clean.match(pattern);
  if (!match) return null;

  const accountName = match[1].trim();
  const amount = parseNominal(match[2].trim());
  if (amount <= 0 || !accountName) return null;

  return { accountName, amount };
}

/**
 * Mendeteksi perintah atur pagu anggaran kategori
 * Contoh: "set anggaran belanja dapur 1,5jt", "ubah anggaran makan 800rb", "/setanggaran dapur 2jt"
 */
export function parseSetAnggaranCommand(rawText: string): { categoryName: string; amount: number } | null {
  const clean = rawText.trim();
  const pattern = /^(?:\/setanggaran|(?:set|ubah|atur)\s+anggaran)\s+([a-zA-Z0-9\s]+?)\s+(?:menjadi|=|\:)?\s*([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const match = clean.match(pattern);
  if (!match) return null;

  const categoryName = match[1].trim();
  const amount = parseNominal(match[2].trim());
  if (amount <= 0 || !categoryName) return null;

  return { categoryName, amount };
}

/**
 * Prompt instruksi sistem untuk Google Gemini Flash (Chat NLP Finansial)
 */
function buildSystemPrompt(context: FinancialContext): string {
  const accountLines = context.accounts
    .map((a) => `- ${a.name} (${a.owner}): ${formatRupiah(a.balance)}`)
    .join('\n');

  const budgetLines = context.categoryBudgets
    .map((b) => `- ${b.name}: Terpakai ${formatRupiah(b.spent)} dari pagu ${formatRupiah(b.limit)} (Sisa: ${formatRupiah(b.remaining)})`)
    .join('\n');

  return `Anda adalah asisten keuangan keluarga Indonesia cerdas, ramah, dan ringkas.
Tugas Anda:
1. Jika pesan pengguna adalah PENCATATAN TRANSAKSI (contoh: "tadi beli martabak 35rb pake gopay", "beli bensin motor 30rb jago", "gaji masuk 10jt di bank jago"):
   Ekstrak data transaksi secara presisi.
2. Jika pesan pengguna adalah TANYA-JAWAB FINANSIAL (contoh: "sisa anggaran belanja dapur masih aman nggak?", "uang keluar bulan ini berapa?", "saldo gopay berapa?"):
   Jawab langsung berbasis data riil keluarga di bawah ini secara ringkas (maksimal 2-3 kalimat, to-the-point, santun).
3. Jika pesan adalah obrolan santai/salam:
   Balas ramah dan ingatkan bahwa Anda siap membantu mencatat transaksi atau mengecek anggaran keluarga.

KONTEKS FINANSIAL KELUARGA BULAN INI (${context.periodLabel}):
- Saldo Rekening Saat Ini:
${accountLines || '- Tidak ada data rekening'}
- Total Saldo Kas: ${formatRupiah(context.totalBalance)}
- Total Pengeluaran Bulan Ini: ${formatRupiah(context.totalSpentMonth)}
- Total Batas Anggaran: ${formatRupiah(context.totalBudgetLimit)}
- Sisa Waktu Menuju Gajian: ${context.daysRemaining} hari lagi
- Rekomendasi Belanja Aman Harian: ${formatRupiah(context.safeDailySpend)} / hari
- Rincian Pagu Anggaran per Kategori:
${budgetLines || '- Tidak ada data pagu'}

DAFTAR KATEGORI VALID:
Belanja Dapur, Makan & Jajan, Transportasi/Bensin, Tagihan & Utilitas, Kebutuhan Rumah, Jalan-jalan, Keperluan Mendadak, Kesehatan, Pendidikan/Anak, Gaji/Pemasukan, Lainnya.

Keluarkan HANYA JSON valid tanpa markdown wrapper:
{
  "type": "transaction" | "chat_answer",
  "transaction": {
    "amount": 35000,
    "merchant": "Martabak",
    "categoryName": "Makan & Jajan",
    "accountName": "GoPay",
    "direction": "out"
  },
  "answer": "Jawaban informatif berbasis konteks riil keluarga"
}`;
}

/**
 * Membersihkan wrapper json dari teks respons Gemini
 */
function cleanGeminiJsonResponse(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }
  return cleaned;
}

/**
 * Memproses pesan bebas pengguna via Gemini Flash 2.5 (atau fallback lokal jika tanpa API key)
 */
export async function processFinancialChatWithAI(
  userText: string,
  context: FinancialContext,
  options?: { apiKey?: string; modelName?: string }
): Promise<NLPProcessResult> {
  const apiKey = options?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  // Fallback lokal deterministik jika API key belum disetel
  if (!apiKey) {
    return handleLocalDeterministicFallback(userText, context);
  }

  const model = options?.modelName || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemPrompt(context) }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userText }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[Gemini Flash HTTP ${response.status}] Fallback ke respons deterministik.`);
      return handleLocalDeterministicFallback(userText, context);
    }

    const resJson = await response.json();
    const rawContent = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      return handleLocalDeterministicFallback(userText, context);
    }

    const cleaned = cleanGeminiJsonResponse(rawContent);
    const parsed = JSON.parse(cleaned);

    if (parsed.type === 'transaction' && parsed.transaction?.amount > 0) {
      const tx = parsed.transaction;
      const directionEmoji = tx.direction === 'in' ? '📈' : '💸';
      return {
        type: 'transaction',
        data: {
          amount: Number(tx.amount) || 0,
          merchant: String(tx.merchant || 'Transaksi').trim(),
          categoryName: String(tx.categoryName || 'Lainnya').trim(),
          accountName: String(tx.accountName || 'Utama').trim(),
          direction: tx.direction === 'in' ? 'in' : 'out',
        },
        replyText: `${directionEmoji} *CATATAN BARU TERDETEKSI*\n\n🛒 *Merchant:* ${tx.merchant}\n💰 *Nominal:* \`${formatRupiah(tx.amount)}\`\n📁 *Kategori:* ${tx.categoryName}\n🏦 *Akun:* ${tx.accountName}`,
      };
    }

    if (parsed.type === 'chat_answer' && parsed.answer) {
      return {
        type: 'chat_answer',
        replyText: parsed.answer,
      };
    }

    return handleLocalDeterministicFallback(userText, context);
  } catch (err) {
    console.warn('[Gemini Chat NLP Error]:', err instanceof Error ? err.message : String(err));
    return handleLocalDeterministicFallback(userText, context);
  }
}

/**
 * Fallback lokal deterministik bila offline atau tanpa API key
 */
function handleLocalDeterministicFallback(userText: string, context: FinancialContext): NLPProcessResult {
  const lower = userText.toLowerCase();

  // 1. Cek pola tanya saldo
  if (lower.includes('saldo')) {
    const accLines = context.accounts.map((a) => `• *${a.name}:* \`${formatRupiah(a.balance)}\``).join('\n');
    return {
      type: 'chat_answer',
      replyText: `💼 *Informasi Saldo Saat Ini:*\n\n${accLines || 'Belum ada data saldo.'}\n\n*Total Kas:* \`${formatRupiah(context.totalBalance)}\``,
    };
  }

  // 2. Cek pola tanya anggaran / pagu
  if (lower.includes('anggaran') || lower.includes('pagu') || lower.includes('sisa')) {
    const matchedCategory = context.categoryBudgets.find((b) => lower.includes(b.name.toLowerCase()));
    if (matchedCategory) {
      return {
        type: 'chat_answer',
        replyText: `📊 *Status Anggaran ${matchedCategory.name}:*\n\n• Terpakai: \`${formatRupiah(matchedCategory.spent)}\`\n• Batas Pagu: \`${formatRupiah(matchedCategory.limit)}\`\n• Sisa Anggaran: \`${formatRupiah(matchedCategory.remaining)}\``,
      };
    }

    return {
      type: 'chat_answer',
      replyText: `📊 *Total Pengeluaran Bulan Ini:* \`${formatRupiah(context.totalSpentMonth)}\` dari pagu \`${formatRupiah(context.totalBudgetLimit)}\`.\nSisa waktu: *${context.daysRemaining} hari lagi*.`,
    };
  }

  // 3. Fallback umum
  return {
    type: 'chat_answer',
    replyText: `🤖 Saya dapat membantu mencatat belanja harian Anda (misal: _"beli martabak 35rb pake gopay"_), memeriksa saldo (_"saldo jago berapa?"_), atau mengecek pagu anggaran (_"sisa belanja dapur aman?"_).`,
  };
}
