// ==============================================================================
// DAILY RECONCILER CORE: src/lib/ai/daily-reconciler.ts
// Mesin Audit & Rekonsiliasi Finansial Harian Berbasis Google Gemini Flash
// - Membaca hasil transaksi dari Parser Regex untuk mendeteksi transfer internal
// - Mendeteksi konfirmasi ganda dari bank digital / SMS
// - Pembatasan kuota ketat: Maksimal 2x pemanggilan per hari (manual + auto 23.00 WIB)
// ==============================================================================

export const MAX_DAILY_RECONCILIATION_RUNS = 2;

export interface ReconciliationQuotaStatus {
  runsToday: number;
  maxRuns: number;
  remaining: number;
  canRun: boolean;
  dateWib: string;
  lastRunAt: string | null;
}

export interface CompactTransactionItem {
  id: string;
  time: string;
  account: string;
  direction: 'in' | 'out';
  amount: number;
  merchant: string;
  text: string;
}

export interface InternalTransferPair {
  outTxId: string;
  inTxId: string;
  confidence: number;
  reason: string;
}

export interface DuplicateConfirmationPair {
  keepTxId: string;
  ignoreTxId: string;
  reason: string;
}

export interface ReconciledAction {
  txId: string;
  categoryName: string;
  reason: string;
}

export interface IgnoredAction {
  txId: string;
  reason: string;
}

export interface GeminiReconciliationOutput {
  internalTransfers: InternalTransferPair[];
  duplicates: DuplicateConfirmationPair[];
  reconciled: ReconciledAction[];
  ignored: IgnoredAction[];
  needsReview: Array<{ txId: string; reason: string }>;
}

export interface ReconciliationExecutionResult {
  success: boolean;
  processedCount: number;
  pairedTransfersCount: number;
  duplicatesCount: number;
  reconciledCount: number;
  ignoredCount: number;
  remainingQuota: number;
  summaryNotes: string;
  details: GeminiReconciliationOutput | null;
}

/**
 * Mengembalikan string tanggal format 'YYYY-MM-DD' dalam zona waktu Asia/Jakarta (WIB)
 */
export function getJakartaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Menghitung sisa kuota harian rekonsiliasi
 */
export function calculateRemainingQuota(
  runsCount: number,
  maxRuns: number = MAX_DAILY_RECONCILIATION_RUNS
): { remaining: number; canRun: boolean } {
  const safeCount = Math.max(0, runsCount);
  const remaining = Math.max(0, maxRuns - safeCount);
  return {
    remaining,
    canRun: remaining > 0,
  };
}

/**
 * Format transaksi mentah database ke format ringkas untuk prompt AI
 */
export function formatTransactionsForPrompt(transactions: any[]): CompactTransactionItem[] {
  return transactions.map((tx) => {
    const rawDate = tx.transaction_date ? new Date(tx.transaction_date) : new Date();
    const timeStr = rawDate.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const accountName = tx.accounts?.name
      ? `${tx.accounts.name} (${tx.source_device || 'suami'})`
      : tx.source_device || 'akun-keluarga';

    return {
      id: tx.id,
      time: timeStr,
      account: accountName,
      direction: tx.direction === 'in' ? 'in' : 'out',
      amount: Math.round(Number(tx.amount || 0)),
      merchant: tx.merchant || 'Umum',
      text: (tx.raw_notification || '').slice(0, 160),
    };
  });
}

/**
 * Membersihkan respons teks JSON dari Google Gemini
 */
export function cleanGeminiReconciliationJson(rawText: string): GeminiReconciliationOutput {
  const emptyOutput: GeminiReconciliationOutput = {
    internalTransfers: [],
    duplicates: [],
    reconciled: [],
    ignored: [],
    needsReview: [],
  };

  if (!rawText || typeof rawText !== 'string') {
    return emptyOutput;
  }

  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    }

    const parsed = JSON.parse(cleaned);

    return {
      internalTransfers: Array.isArray(parsed.internalTransfers) ? parsed.internalTransfers : [],
      duplicates: Array.isArray(parsed.duplicates) ? parsed.duplicates : [],
      reconciled: Array.isArray(parsed.reconciled) ? parsed.reconciled : [],
      ignored: Array.isArray(parsed.ignored) ? parsed.ignored : [],
      needsReview: Array.isArray(parsed.needsReview) ? parsed.needsReview : [],
    };
  } catch {
    return emptyOutput;
  }
}

/**
 * Fallback algoritma lokal jika Gemini API offline / belum ada key
 * Mendeteksi pasangan internal transfer dan duplikat waktu sempit secara deterministik
 */
export function runLocalRuleBasedReconciliation(
  items: CompactTransactionItem[],
  availableCategoryNames: string[] = []
): GeminiReconciliationOutput {
  const output: GeminiReconciliationOutput = {
    internalTransfers: [],
    duplicates: [],
    reconciled: [],
    ignored: [],
    needsReview: [],
  };

  const processedIds = new Set<string>();

  // 1. Deteksi Duplikat Waktu Sempit (nominal sama, akun sama, waktu sama)
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];

      if (
        !processedIds.has(a.id) &&
        !processedIds.has(b.id) &&
        a.account === b.account &&
        a.amount === b.amount &&
        a.direction === b.direction &&
        a.time === b.time
      ) {
        output.duplicates.push({
          keepTxId: a.id,
          ignoreTxId: b.id,
          reason: 'Konfirmasi kedua/duplikat bank dalam waktu bersamaan',
        });
        processedIds.add(b.id);
      }
    }
  }

  // 2. Deteksi Transfer Internal (out di akun A dan in di akun B dengan nominal sama)
  for (const outTx of items) {
    if (outTx.direction !== 'out' || processedIds.has(outTx.id)) continue;

    const matchedIn = items.find(
      (inTx) =>
        inTx.direction === 'in' &&
        !processedIds.has(inTx.id) &&
        inTx.amount === outTx.amount &&
        inTx.id !== outTx.id
    );

    if (matchedIn) {
      output.internalTransfers.push({
        outTxId: outTx.id,
        inTxId: matchedIn.id,
        confidence: 90,
        reason: `Transfer internal sesama rekening (${outTx.account} -> ${matchedIn.account})`,
      });
      processedIds.add(outTx.id);
      processedIds.add(matchedIn.id);
    }
  }

  // 3. Sisanya yang bernilai > 0 di-reconcile dengan kategori default wajar
  const defaultCategory = availableCategoryNames[0] || 'Lain-lain';
  for (const item of items) {
    if (processedIds.has(item.id)) continue;

    if (item.amount === 0) {
      output.ignored.push({
        txId: item.id,
        reason: 'Nominal Rp 0 (bukan transaksi pengeluaran/pemasukan)',
      });
    } else {
      output.reconciled.push({
        txId: item.id,
        categoryName: defaultCategory,
        reason: 'Diverifikasi sah oleh aturan deterministik',
      });
    }
  }

  return output;
}

/**
 * Panggilan ke Google Gemini Flash REST API untuk audit harian
 */
export async function analyzeDailyTransactionsWithGemini(
  items: CompactTransactionItem[],
  availableCategoryNames: string[],
  apiKey: string
): Promise<GeminiReconciliationOutput> {
  if (!apiKey || items.length === 0) {
    return runLocalRuleBasedReconciliation(items, availableCategoryNames);
  }

  const systemInstruction = `Kamu adalah auditor finansial keluarga AI tingkat lanjut.
Tugasmu: Menganalisis kumpulan seluruh transaksi harian hasil ekstraksi notifikasi perbankan & e-wallet Indonesia (BCA, Mandiri, Jago, SeaBank, GoPay, ShopeePay, DANA, dll) untuk membersihkan dan merekonsiliasi data.

KATEGORI TERSEDIA:
${availableCategoryNames.map((c) => `- "${c}"`).join('\n')}

ATURAN REKONSILIASI:
1. DETEKSI TRANSFER INTERNAL SESAMA REKENING:
   - Jika ada transaksi OUT dan transaksi IN dengan nominal sama pada hari yang sama (misal Suami transfer ke Istri, atau transfer antar rekening pribadi), pasangkan keduanya dalam 'internalTransfers'.
2. DETEKSI NOTIFIKASI DOBEL / DUPLIKAT:
   - Jika ada 2 transaksi dari akun yang sama dengan nominal sama dan waktu berdekatan (< 3 menit) yang merupakan konfirmasi ganda bank digital atau notifikasi ganda SMS, masukkan ke 'duplicates' (keepTxId untuk disimpan, ignoreTxId untuk diabaikan).
3. DETEKSI TRANSAKSI SEMU:
   - Transaksi nominal Rp 0, promo, atau info saldo masukkan ke 'ignored'.
4. AUTO-RECONCILE TRANSAKSI BELANJA/PEMASUKAN SAH:
   - Transaksi pengeluaran atau pemasukan riil masukkan ke 'reconciled', sertakan 'categoryName' dari daftar kategori di atas yang paling tepat.
5. TRANSAKSI AMBIGU:
   - Jika masih ragu, masukkan ke 'needsReview'.

KEMBALIKAN HANYA JSON VALID TANPA MARKDOWN:
{
  "internalTransfers": [
    { "outTxId": "id", "inTxId": "id", "confidence": 95, "reason": "penjelasan singkat" }
  ],
  "duplicates": [
    { "keepTxId": "id", "ignoreTxId": "id", "reason": "penjelasan singkat" }
  ],
  "reconciled": [
    { "txId": "id", "categoryName": "nama kategori", "reason": "penjelasan singkat" }
  ],
  "ignored": [
    { "txId": "id", "reason": "penjelasan" }
  ],
  "needsReview": [
    { "txId": "id", "reason": "alasan butuh tinjauan manual" }
  ]
}`;

  const promptPayload = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Berikut daftar ${items.length} transaksi harian untuk direkonsiliasi:\n${JSON.stringify(items, null, 2)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
    },
  };

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptPayload),
        }
      );

      if (response.status === 429) {
        console.warn(`[Gemini Flash Rate Limit 429] Model ${model} sibuk, mencoba fallback model.`);
        continue;
      }

      if (!response.ok) {
        console.warn(`[Gemini Error ${response.status}] pada model ${model}`);
        continue;
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const result = cleanGeminiReconciliationJson(rawText);
        if (
          result.internalTransfers.length > 0 ||
          result.duplicates.length > 0 ||
          result.reconciled.length > 0 ||
          result.ignored.length > 0
        ) {
          return result;
        }
      }
    } catch (err: unknown) {
      console.warn(`[Gemini Exception] pada model ${model}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback lokal deterministik jika seluruh model Gemini mengalami kendala
  return runLocalRuleBasedReconciliation(items, availableCategoryNames);
}
