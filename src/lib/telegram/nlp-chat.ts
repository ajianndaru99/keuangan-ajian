// ==============================================================================
// TELEGRAM NLP CHAT & PARSER: src/lib/telegram/nlp-chat.ts
// Modul Parsing Pesan Natural Language, Perintah Cepat, dan Q&A Berbasis Gemini
// ==============================================================================

import { formatRupiah } from '../utils.ts';
import { formatTodayExpensesMessage } from './formatters.ts';
import { getTodayRangeWIB } from '../date-utils.ts';

export interface FinancialContext {
  accounts: Array<{ name: string; owner: string; balance: number }>;
  totalBalance: number;
  totalSpentMonth: number;
  totalBudgetLimit: number;
  daysRemaining: number;
  safeDailySpend: number;
  categoryBudgets: Array<{ name: string; spent: number; limit: number; remaining: number }>;
  periodLabel: string;
  pendingCount?: number;
  todaySpent?: number;
  todayTransactions?: Array<{
    time: string;
    merchant: string;
    amount: number;
    categoryName: string;
    accountName?: string;
    ownerLabel?: string;
  }>;
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
      type: 'set_balance_intent';
      accountName: string;
      amount: number;
    }
  | {
      type: 'chat_answer';
      replyText: string;
    }
  | {
      type: 'off_topic';
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

  // 1. Shorthand rupiah (rb, ribu, k, jt, juta) dengan atau tanpa awalan rp/idr
  const shorthandMatch = clean.match(/(?:(?:rp|idr)\.?\s*)?(\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta)\b/i);
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
 * Mendeteksi perintah atur saldo rekening atau penyesuaian total kas
 * Contoh: "set saldo gopay 38rb", "ubah saldo jago 2jt", "ganti saldo dana suami 1jt", "total kas ganti 1jt"
 */
export function parseSetSaldoCommand(rawText: string): { accountName: string; amount: number } | null {
  const clean = rawText.trim();
  if (!clean) return null;

  // 0. Guard: Jangan salah menangkap perintah anggaran, gajian, atau transaksi belanja
  if (/\b(anggaran|pagu|budget|gajian|beli|bayar|jajan|belanja)\b/i.test(clean)) {
    return null;
  }

  // 1. Pola atur saldo akun spesifik ("set/ubah/ganti/koreksi saldo [akun] [nominal]")
  const specificPattern = /^(?:\/setsaldo|(?:set|ubah|atur|ganti|koreksi)\s+saldo)\s+([a-zA-Z0-9\s]+?)\s+(?:menjadi|=|\:|jadi)?\s*(?:(?:rp|idr)\.?\s*)?([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const matchSpecific = clean.match(specificPattern);
  if (matchSpecific) {
    const accountName = matchSpecific[1].trim();
    const amount = parseNominal(matchSpecific[2].trim());
    if (amount >= 0 && accountName) {
      const isTotalKas = /^(total[\s_]*kas|kas[\s_]*(total|keluarga|siap\s*pakai))$/i.test(accountName);
      return { accountName: isTotalKas ? 'total_kas' : accountName, amount };
    }
  }

  // 2. Pola ubah total kas / kas keluarga ("total kas ganti 1jt", "ganti total kas 2jt", "total kas ganti Rp 1jt")
  const totalKasPattern1 = /^(?:total\s+kas|kas\s+total|kas\s+keluarga)\s+(?:ganti|ubah|atur|set|koreksi|menjadi|=|\:|jadi)\s*(?:(?:rp|idr)\.?\s*)?([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const matchTotal1 = clean.match(totalKasPattern1);
  if (matchTotal1) {
    const amount = parseNominal(matchTotal1[1].trim());
    if (amount >= 0) {
      return { accountName: 'total_kas', amount };
    }
  }

  const totalKasPattern2 = /^(?:ganti|ubah|atur|set|koreksi)\s+(?:total\s+kas|kas\s+total|kas\s+keluarga)\s+(?:menjadi|=|\:|jadi)?\s*(?:(?:rp|idr)\.?\s*)?([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const matchTotal2 = clean.match(totalKasPattern2);
  if (matchTotal2) {
    const amount = parseNominal(matchTotal2[1].trim());
    if (amount >= 0) {
      return { accountName: 'total_kas', amount };
    }
  }

  // 3. Pola akun di depan dengan awalan kata saldo ("saldo dana suami ubah 2jt", "saldo jago ganti 500rb")
  const leadingSaldoPattern = /^saldo\s+([a-zA-Z0-9\s]+?)\s+(?:ganti|ubah|atur|set|koreksi|jadi|menjadi)\s+(?:menjadi|=|\:|jadi)?\s*(?:(?:rp|idr)\.?\s*)?([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const matchLeadingSaldo = clean.match(leadingSaldoPattern);
  if (matchLeadingSaldo) {
    const accCandidate = matchLeadingSaldo[1].trim();
    const amount = parseNominal(matchLeadingSaldo[2].trim());
    if (amount >= 0 && accCandidate) {
      const isTotalKas = /^(total[\s_]*kas|kas[\s_]*(total|keluarga|siap\s*pakai))$/i.test(accCandidate);
      return { accountName: isTotalKas ? 'total_kas' : accCandidate, amount };
    }
  }

  // 4. Pola akun di depan khusus nama bank/dompet terdaftar tanpa awalan saldo ("dana suami ganti 1jt", "jago ganti 500rb")
  const knownAccountPrefixPattern = /^((?:dana|gopay|ovo|shopeepay|linkaja|bca|mandiri|bri|bni|bsi|jago|seabank|tabungan|rekening|dompet|kantong)(?:\s+[a-zA-Z0-9]+)*)\s+(?:ganti|ubah|atur|set|koreksi|jadi|menjadi)\s+(?:menjadi|=|\:|jadi)?\s*(?:(?:rp|idr)\.?\s*)?([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?)$/i;
  const matchKnownAccount = clean.match(knownAccountPrefixPattern);
  if (matchKnownAccount) {
    const accCandidate = matchKnownAccount[1].trim();
    const amount = parseNominal(matchKnownAccount[2].trim());
    if (amount >= 0 && accCandidate) {
      return { accountName: accCandidate, amount };
    }
  }

  return null;
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
 * Mendeteksi perintah atur tanggal gajian siklus bulanan (1-28)
 * Contoh: "set gajian 25", "set tanggal gajian 25", "atur gajian 20", "/setgajian 25"
 */
export function parseSetGajianCommand(rawText: string): number | null {
  const clean = rawText.trim();
  const pattern = /^(?:\/setgajian|(?:set|ubah|atur)\s+(?:tanggal\s+)?gajian)\s+(\d{1,2})$/i;
  const match = clean.match(pattern);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  if (isNaN(day) || day < 1 || day > 28) return null;

  return day;
}

/**
 * Mendeteksi apakah teks pengguna menanyakan pengeluaran hari ini (toleran typo seperti "berapa pngeluaran hari ini")
 * Tidak menangkap kalimat pencatatan transaksi ber-nominal (misal: "hari ini beli bakso 25rb")
 */
export function isTodayExpenseQuery(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;

  // Abaikan jika mengandung nominal transaksi (contoh: "25rb", "50.000", "100k", "1jt")
  if (
    /\b\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta)\b/i.test(clean) ||
    /\b(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+\b/i.test(clean) ||
    /\b\d{4,}\b/.test(clean)
  ) {
    return false;
  }

  const hasTodayWord = /\b(?:hari\s+ini|hr\s+ini|hri\s+ini|hariini|today)\b/i.test(clean);
  if (!hasTodayWord) return false;

  const hasExpenseOrAskWord = /\b(?:p[ae]?ng[e]?luaran|pngeluaran|pengluaran|b[e]?lanja|blanja|rekap|mutasi|transaksi|habis|keluar|berapa|brp|apa\s+saja|apa\s+aja|rincian|daftar|list|total|cek|info|laporan)\b/i.test(
    clean
  );

  return hasExpenseOrAskWord;
}

/**
 * Prompt instruksi sistem untuk Google Gemini Flash (Chat NLP Finansial & Guardrail)
 */
function buildSystemPrompt(context: FinancialContext): string {
  const accountLines = context.accounts
    .map((a) => `- ${a.name} (${a.owner}): ${formatRupiah(a.balance)}`)
    .join('\n');

  const budgetLines = context.categoryBudgets
    .map((b) => `- ${b.name}: Terpakai ${formatRupiah(b.spent)} dari pagu ${formatRupiah(b.limit)} (Sisa: ${formatRupiah(b.remaining)})`)
    .join('\n');

  return `Anda adalah asisten keuangan keluarga Indonesia cerdas, ramah, dan teliti untuk keluarga Ajian.
Tugas Anda:
1. PENCATATAN TRANSAKSI (type: "transaction"):
   Jika pesan pengguna mencatat pengeluaran atau pemasukan (contoh: "tadi beli martabak 35rb pake gopay", "isi bensin motor 30rb jago", "gaji masuk 10jt di bank jago", "bonus kantor 700rb", "terima transfer 500rb").
   PENTING:
   - Pemasukan (gaji, bonus, honor, terima transfer, komisi, dapat uang): direction = "in", categoryName = "Gaji/Pemasukan".
   - Pengeluaran (beli, bayar, jajan, belanja, makan, langganan): direction = "out".
   Ekstrak: amount, merchant, categoryName, accountName, direction ("out" atau "in").
2. PERMINTAAN KOREKSI SALDO / TOTAL KAS (type: "set_balance_intent"):
   Jika pengguna ingin mengubah atau mengoreksi saldo rekening atau total kas (contoh: "total kas ganti 1jt", "atur saldo jago jadi 2jt", "ganti saldo dana suami 500rb"):
   Ekstrak: accountName (nama akun spesifik atau "total_kas") dan amount (angka nominal target).
3. PERTANYAAN & KONSULTASI KEUANGAN (type: "chat_answer"):
   Jika pesan pengguna menanyakan data keuangan keluarga (saldo, pengeluaran, sisa pagu, safe daily spend) ATAU konsultasi keuangan keluarga (tips menabung, evaluasi belanja, dana darurat, investasi, utang, perencanaan keuangan).
   PENTING:
   - Jika pengguna menanyakan pengeluaran hari ini ("pengeluaran hari ini apa saja", "berapa pengeluaran hari ini", "belanja hari ini"), jawab HANYA dengan rincian pengeluaran hari ini di bawah, JANGAN mencampur dengan total pengeluaran satu bulan.
   - Saat merinci daftar pengeluaran, susun dengan baris baru (bullet/penomoran) yang rapi: urutkan per waktu (jam WIB) dan kelompokkan per kategori agar mudah dibaca, JANGAN digabung dalam satu paragraf panjang.
4. DI LUAR TOPIK KEUANGAN / NON-FINANSIAL (type: "off_topic"):
   Jika pesan pengguna TIDAK ADA HUBUNGANNYA SAMA SEKALI DENGAN KEUANGAN (contoh: tanya cuaca, resep masakan, politik, coding, kesehatan umum non-biaya, tugas sekolah umum, gosip, atau topik di luar finansial).
   Tolak secara santun dan ramah: jelaskan bahwa Anda adalah asisten khusus keuangan keluarga Ajian, dan undang mereka untuk menanyakan seputar catatan transaksi, saldo, pagu belanja, atau perencanaan finansial keluarga.
5. SALAM & SAPAAN (type: "chat_answer"):
   Jika pengguna menyapa (halo, selamat pagi, assalamu'alaikum), balas ramah dan ingatkan bahwa Anda siap membantu mencatat mutasi atau mengecek kondisi finansial keluarga.

KONTEKS FINANSIAL KELUARGA BULAN INI (${context.periodLabel}):
- Saldo Rekening Saat Ini:
${accountLines || '- Tidak ada data rekening'}
- Total Saldo Kas: ${formatRupiah(context.totalBalance)}
- Total Pengeluaran Hari Ini (Reconciled): ${formatRupiah(context.todaySpent || 0)} (${context.todayTransactions?.length || 0} transaksi)
${(context.todayTransactions || []).length > 0 ? (context.todayTransactions || []).map((t) => `  * ${t.time} • ${t.merchant}: ${formatRupiah(t.amount)} (${t.categoryName})`).join('\n') : '  * Belum ada pengeluaran hari ini'}
- Total Pengeluaran Bulan Ini (Reconciled): ${formatRupiah(context.totalSpentMonth)}
- Transaksi Pending Belum Terkonfirmasi: ${context.pendingCount || 0} transaksi
- Total Batas Anggaran: ${formatRupiah(context.totalBudgetLimit)}
- Sisa Waktu Menuju Gajian: ${context.daysRemaining} hari lagi
- Rekomendasi Belanja Aman Harian: ${formatRupiah(context.safeDailySpend)} / hari
- Rincian Pagu Anggaran per Kategori:
${budgetLines || '- Tidak ada data pagu'}

DAFTAR KATEGORI VALID:
Belanja Dapur, Makan & Jajan, Transportasi/Bensin, Tagihan & Utilitas, Kebutuhan Rumah, Jalan-jalan, Keperluan Mendadak, Kesehatan, Pendidikan/Anak, Gaji/Pemasukan, Lainnya.

Keluarkan HANYA JSON valid tanpa markdown wrapper:
{
  "type": "transaction" | "set_balance_intent" | "chat_answer" | "off_topic",
  "transaction": {
    "amount": 35000,
    "merchant": "Martabak",
    "categoryName": "Makan & Jajan",
    "accountName": "GoPay",
    "direction": "out"
  },
  "accountName": "Dana Suami",
  "amount": 1000000,
  "answer": "Jawaban finansial berbasis data riil keluarga",
  "rejectionReason": "Penolakan santun jika di luar topik keuangan"
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
  // Jika pertanyaan tentang pengeluaran hari ini, langsung gunakan formatter deterministik (0 Token Gemini & tampilan rapi)
  if (isTodayExpenseQuery(userText)) {
    return handleLocalDeterministicFallback(userText, context);
  }

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
      const isIn = tx.direction === 'in';
      const directionEmoji = isIn ? '📈' : '💸';
      const directionTitle = isIn ? 'PEMASUKAN BARU TERDETEKSI' : 'PENGELUARAN BARU TERDETEKSI';
      return {
        type: 'transaction',
        data: {
          amount: Number(tx.amount) || 0,
          merchant: String(tx.merchant || 'Transaksi').trim(),
          categoryName: String(tx.categoryName || 'Lainnya').trim(),
          accountName: String(tx.accountName || 'Utama').trim(),
          direction: isIn ? 'in' : 'out',
        },
        replyText: `${directionEmoji} *${directionTitle}*\n\n🛒 *Merchant:* ${tx.merchant}\n💰 *Nominal:* \`${formatRupiah(tx.amount)}\`\n📁 *Kategori:* ${tx.categoryName}\n🏦 *Akun:* ${tx.accountName}`,
      };
    }

    if (parsed.type === 'set_balance_intent' && Number(parsed.amount) >= 0) {
      return {
        type: 'set_balance_intent',
        accountName: String(parsed.accountName || 'total_kas').trim(),
        amount: Number(parsed.amount),
      };
    }

    if (parsed.type === 'off_topic') {
      const rejection =
        parsed.rejectionReason ||
        parsed.answer ||
        'Maaf, saya asisten khusus keuangan keluarga Ajian. Saya hanya dapat membantu pencatatan transaksi belanja, pengecekan saldo, pagu anggaran, serta konsultasi keuangan keluarga. Ada yang ingin dicek seputar keuangan hari ini? 😊';
      return {
        type: 'off_topic',
        replyText: rejection,
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
export function handleLocalDeterministicFallback(userText: string, context: FinancialContext): NLPProcessResult {
  const lower = userText.toLowerCase().trim();

  // 0. Cek apakah ada instruksi koreksi saldo / ganti total kas
  const setSaldoCmd = parseSetSaldoCommand(userText);
  if (setSaldoCmd) {
    return {
      type: 'set_balance_intent',
      accountName: setSaldoCmd.accountName,
      amount: setSaldoCmd.amount,
    };
  }

  // 0.5. Cek pola tanya pengeluaran hari ini (Urutan Waktu + Per Kategori)
  if (
    isTodayExpenseQuery(userText) ||
    lower.includes('hari ini') ||
    lower.includes('hariini') ||
    lower.includes('today') ||
    lower === 'pengeluaran hari ini' ||
    lower.includes('belanja hari ini') ||
    lower.includes('habis berapa hari ini')
  ) {
    const todayRange = getTodayRangeWIB(new Date());
    const items = (context.todayTransactions || []).map((t) => ({
      time: t.time,
      merchant: t.merchant,
      amount: t.amount,
      categoryName: t.categoryName,
      accountName: t.accountName || 'Rekening Keluarga',
      ownerLabel: t.ownerLabel,
    }));

    return {
      type: 'chat_answer',
      replyText: formatTodayExpensesMessage({
        dateLabel: todayRange.label,
        items,
        totalAmount: context.todaySpent || items.reduce((s, i) => s + i.amount, 0),
      }),
    };
  }

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

  // 3. Verifikasi apakah pertanyaan berkaitan dengan keuangan
  const financialKeywords = [
    'uang', 'duit', 'kas', 'rekap', 'belanja', 'beli', 'bayar', 'pengeluaran', 'pemasukan',
    'gaji', 'gajian', 'hemat', 'boros', 'catat', 'struk', 'bank', 'rekening', 'dompet',
    'gopay', 'dana', 'ovo', 'shopeepay', 'jago', 'bca', 'mandiri', 'bri', 'seabank',
    'investasi', 'tabungan', 'darurat', 'hutang', 'utang', 'cicilan', 'budget', 'tagihan',
    'dapur', 'makan', 'bensin', 'transport', 'pulsa', 'listrik', 'wifi', 'bpjs',
    'keuangan', 'finansial', 'inflasi', 'reksa dana', 'saham', 'aset', 'dana',
    'mutasi', 'transfer', 'transaksi', 'koreksi', 'salah', 'spam', 'promo', 'iklan', 'batal', 'hapus',
    'halo', 'hai', 'pagi', 'siang', 'sore', 'malam', 'assalamu', 'bantuan', 'bisa apa',
  ];

  const isFinancialRelated = financialKeywords.some((kw) => lower.includes(kw));

  if (!isFinancialRelated) {
    return {
      type: 'off_topic',
      replyText:
        'Maaf, saya asisten khusus keuangan keluarga Ajian. Saya hanya dapat membantu pencatatan transaksi belanja, pengecekan saldo, pagu anggaran, serta konsultasi keuangan keluarga. Ada yang ingin dicek seputar keuangan hari ini? 😊',
    };
  }

  // 4. Fallback umum finansial
  return {
    type: 'chat_answer',
    replyText: `🤖 Saya dapat membantu mencatat belanja harian Anda (misal: _"beli martabak 35rb pake gopay"_), memeriksa saldo (_"saldo jago berapa?"_), atau mengecek pagu anggaran (_"sisa belanja dapur aman?"_).`,
  };
}
