// ==============================================================================
// CLASSIFIER: supabase/functions/_shared/parsers/classify.ts
// Logika murni penentu outcome notifikasi menggabungkan Layer Regex dan AI Gemini
// Tidak melakukan panggilan jaringan dan tidak membaca jam sistem (pure functions).
// ==============================================================================

import { extractAmounts } from './amount.ts';
import { normalizeText } from './fields.ts';
import {
  FAILED_PATTERNS,
  PENDING_PATTERNS,
  REFUND_PATTERNS,
  SUCCESS_PATTERNS,
  matchesAny,
} from './rules.ts';
import { parseLivinNotification } from './livin.ts';
import { parseJagoNotification } from './jago.ts';
import { parseSeabankNotification } from './seabank.ts';
import type {
  AiLabel,
  Direction,
  Outcome,
  ParsedNotification,
  ParseMethod,
  ReasonCode,
} from './types.ts';
import type { GeminiNotificationAnalysis } from './gemini-text.ts';

/** Batas minimum keyakinan AI agar bisa langsung disetujui sebagai transaksi. */
export const AI_CONFIDENCE_THRESHOLD = 80;

/** Pola kalimat injeksi prompt/perintah mencurigakan dalam teks notifikasi. */
const SUSPICIOUS_INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\babaikan\s+(?:semua\s+|sebelumnya\s+)?(?:instruksi|perintah|prompt)\b/,
  /\bignore\s+(?:all\s+|previous\s+)?(?:instructions?|prompts?)\b/,
  /\blupakan\s+(?:semua\s+)?(?:perintah|instruksi)\b/,
];

export interface ClassifyInput {
  title: string;
  content: string;
  isSensitive: boolean;
  regexResult: ParsedNotification | null;
  aiResult: GeminiNotificationAnalysis | null;
  transactionDate?: string | null;
  appName?: string;
}

export interface FinalClassification {
  outcome: Outcome;
  reasons: ReasonCode[];
  parseMethod: ParseMethod;
  amount: number | null;
  direction: Direction;
  bank: string;
  accountName: string;
  merchant: string | null;
  reference: string | null;
  transactionDate: string | null;
  aiLabel: AiLabel | null;
  aiConfidence: number | null;
  aiReason: string | null;
  parserVersion: string;
}

export type AiClassifierCaller = (
  appName: string,
  title: string,
  content: string,
) => Promise<GeminiNotificationAnalysis | null>;

export interface OrchestrationInput {
  appName: string;
  title: string;
  content: string;
  receivedAtRaw: string;
  receivedAtIso?: string | null;
  isSensitive: boolean;
  regexRunner?: (appName: string, title: string, content: string, receivedAtRaw: string) => ParsedNotification | null;
  aiCaller?: AiClassifierCaller;
}

/**
 * Menentukan apakah AI (Gemini) perlu dipanggil.
 * Aturan:
 * 1. Teks sensitif (OTP/PIN) -> TIDAK dipanggil.
 * 2. Regex menghasilkan 'ignored' (promo/gagal/pending) -> TIDAK dipanggil.
 * 3. Regex menghasilkan 'transaction' -> TIDAK dipanggil.
 * 4. Panggil HANYA jika regexResult null (belum ada parser) ATAU outcome === 'needs_review'.
 */
export function shouldInvokeAi(
  regexResult: ParsedNotification | null,
  isSensitive: boolean,
): boolean {
  if (isSensitive) return false;
  if (regexResult === null) return true;
  return regexResult.outcome === 'needs_review';
}

/**
 * Validasi silang: apakah nominal dari AI tertera di antara nominal utama ('main')?
 * Nominal berlabel 'balance', 'fee', atau 'cashback' tidak boleh disetujui sebagai nominal transaksi.
 */
function isAiAmountMatchingText(title: string, content: string, aiAmount: number): boolean {
  if (aiAmount <= 0) return false;
  const normalized = normalizeText(`${title} ${content}`).toLowerCase();
  const mentions = extractAmounts(normalized);
  const mainAmounts = mentions
    .filter((mention) => mention.label === 'main' && mention.value !== null && mention.value > 0)
    .map((mention) => mention.value as number);

  return mainAmounts.includes(aiAmount);
}

/**
 * Memeriksa apakah teks notifikasi mengandung kalimat penyusup/injeksi prompt.
 */
function hasPromptInjection(title: string, content: string): boolean {
  const normalized = normalizeText(`${title} ${content}`).toLowerCase();
  return matchesAny(normalized, SUSPICIOUS_INSTRUCTION_PATTERNS);
}

/**
 * Klasifikasi hasil saat panggilan AI tidak berhasil (timeout, network error, API key kosong).
 */
function handleUnavailableAi(input: ClassifyInput): FinalClassification {
  const fallbackBank = input.regexResult?.bank || input.appName || 'Unknown';
  return {
    outcome: 'needs_review',
    reasons: ['ai_unavailable'],
    parseMethod: input.regexResult ? 'regex' : 'ai_gemini',
    amount: input.regexResult?.amount ?? null,
    direction: input.regexResult?.direction ?? 'unknown',
    bank: fallbackBank,
    accountName: input.regexResult?.accountName || fallbackBank,
    merchant: input.regexResult?.merchant ?? null,
    reference: input.regexResult?.reference ?? null,
    transactionDate: input.transactionDate ?? input.regexResult?.transactionDate ?? null,
    aiLabel: null,
    aiConfidence: null,
    aiReason: null,
    parserVersion: input.regexResult?.parserVersion ?? 'ai_unavailable',
  };
}

/**
 * Mengklasifikasikan hasil analisis AI (PENGELUARAN, PEMASUKAN, NOTIFIKASI, PROMO, RAGU).
 */
function classifyAiAnalysis(
  input: ClassifyInput,
  ai: GeminiNotificationAnalysis,
): FinalClassification {
  const defaultBank = input.regexResult?.bank || input.appName || 'Unknown';
  const baseResult: FinalClassification = {
    outcome: 'needs_review',
    reasons: [],
    parseMethod: 'ai_gemini',
    amount: ai.amount > 0 ? ai.amount : null,
    direction: ai.label === 'PEMASUKAN' ? 'in' : 'out',
    bank: ai.accountName || defaultBank,
    accountName: ai.accountName || defaultBank,
    merchant: ai.merchant || null,
    reference: ai.reference || input.regexResult?.reference || null,
    transactionDate: input.transactionDate ?? input.regexResult?.transactionDate ?? null,
    aiLabel: ai.label,
    aiConfidence: ai.confidence,
    aiReason: ai.reason,
    parserVersion: 'gemini-flash-ai',
  };

  const normalized = normalizeText(`${input.title} ${input.content}`).toLowerCase();
  const mentions = extractAmounts(normalized);
  const hasMainAmount = mentions.some((m) => m.label === 'main' && m.value !== null && m.value > 0);
  const hasSuccessEvidence = matchesAny(normalized, SUCCESS_PATTERNS);

  // Label NOTIFIKASI atau PROMO: hanya boleh ignored jika keyakinan >= 80 dan teks tidak memuat bukti sukses bersama nominal utama
  if (ai.label === 'NOTIFIKASI' || ai.label === 'PROMO') {
    const isPromo = ai.label === 'PROMO';
    const defaultReason: ReasonCode = isPromo ? 'ai_promo' : 'ai_notification';

    if (ai.confidence < AI_CONFIDENCE_THRESHOLD) {
      return {
        ...baseResult,
        outcome: 'needs_review',
        reasons: ['ai_low_confidence'],
        amount: input.regexResult?.amount ?? null,
      };
    }

    if (hasSuccessEvidence && hasMainAmount) {
      return {
        ...baseResult,
        outcome: 'needs_review',
        reasons: ['ai_uncertain'],
        amount: input.regexResult?.amount ?? null,
      };
    }

    return {
      ...baseResult,
      outcome: 'ignored',
      reasons: [defaultReason],
      amount: null,
    };
  }

  if (ai.label === 'RAGU') {
    return { ...baseResult, outcome: 'needs_review', reasons: ['ai_uncertain'], amount: null };
  }

  // Label PENGELUARAN atau PEMASUKAN
  if (ai.confidence < AI_CONFIDENCE_THRESHOLD) {
    return { ...baseResult, outcome: 'needs_review', reasons: ['ai_low_confidence'] };
  }

  // Validasi silang: nominal AI wajib cocok dengan nominal berlabel 'main'
  if (!isAiAmountMatchingText(input.title, input.content, ai.amount)) {
    return {
      ...baseResult,
      outcome: 'needs_review',
      reasons: ['ai_amount_mismatch'],
      amount: input.regexResult?.amount ?? null, // Jangan bawa nominal AI yang salah
    };
  }

  // Pagar keamanan pola status
  if (matchesAny(normalized, FAILED_PATTERNS)) {
    return { ...baseResult, outcome: 'needs_review', reasons: ['status_failed'] };
  }

  if (matchesAny(normalized, PENDING_PATTERNS)) {
    return { ...baseResult, outcome: 'needs_review', reasons: ['status_pending'] };
  }

  // Refund diperiksa sebelum penanda sukses agar diarahkan ke klasifikasi manual
  if (matchesAny(normalized, REFUND_PATTERNS)) {
    return {
      ...baseResult,
      outcome: 'needs_review',
      reasons: ['refund_needs_classification'],
      direction: 'in',
    };
  }

  if (!hasSuccessEvidence) {
    return { ...baseResult, outcome: 'needs_review', reasons: ['status_unknown'] };
  }

  if (hasPromptInjection(input.title, input.content)) {
    return { ...baseResult, outcome: 'needs_review', reasons: ['ai_uncertain'] };
  }

  return {
    ...baseResult,
    outcome: 'transaction',
    reasons: [],
    amount: ai.amount,
    direction: ai.label === 'PEMASUKAN' ? 'in' : 'out',
  };
}

/**
 * Fungsi murni pengambil keputusan akhir status notifikasi.
 * Menggabungkan hasil regex dan AI sesuai aturan 7 poin FASE 6A.
 */
export function classifyNotification(input: ClassifyInput): FinalClassification {
  if (input.isSensitive) {
    return {
      outcome: 'ignored',
      reasons: ['sensitive_content'],
      parseMethod: 'regex',
      amount: null,
      direction: 'unknown',
      bank: input.appName || 'Unknown',
      accountName: input.appName || 'Unknown',
      merchant: null,
      reference: null,
      transactionDate: input.transactionDate ?? null,
      aiLabel: null,
      aiConfidence: null,
      aiReason: null,
      parserVersion: input.regexResult?.parserVersion ?? 'v1-rules',
    };
  }

  // Jika regex sudah menentukan 'transaction' atau 'ignored', hormati keputusannya tanpa memanggil AI
  if (input.regexResult && input.regexResult.outcome !== 'needs_review') {
    return {
      outcome: input.regexResult.outcome,
      reasons: input.regexResult.reasons,
      parseMethod: 'regex',
      amount: input.regexResult.amount,
      direction: input.regexResult.direction,
      bank: input.regexResult.bank,
      accountName: input.regexResult.accountName,
      merchant: input.regexResult.merchant,
      reference: input.regexResult.reference,
      transactionDate: input.transactionDate ?? input.regexResult.transactionDate ?? null,
      aiLabel: null,
      aiConfidence: null,
      aiReason: null,
      parserVersion: input.regexResult.parserVersion,
    };
  }

  // Jalur AI: dipanggil jika regexResult null atau regexResult.outcome === 'needs_review'
  if (!input.aiResult) {
    return handleUnavailableAi(input);
  }

  return classifyAiAnalysis(input, input.aiResult);
}

/** Parser regex bawaan untuk aplikasi m-banking / e-wallet yang didukung. */
export function defaultRegexRunner(
  appName: string,
  title: string,
  content: string,
  receivedAtRaw: string,
): ParsedNotification | null {
  const lowerApp = appName.toLowerCase();
  if (lowerApp.includes('livin')) {
    return parseLivinNotification(title, content, receivedAtRaw);
  }
  if (lowerApp.includes('jago')) {
    return parseJagoNotification(title, content, receivedAtRaw);
  }
  if (lowerApp.includes('seabank') || lowerApp.includes('bankbke')) {
    return parseSeabankNotification(title, content, receivedAtRaw);
  }
  return null;
}

/**
 * Orkestrasi alur parsing: jalankan regex lokal -> panggil AI jika diperlukan -> klasifikasi akhir.
 * Menerima aiCaller opsional sehingga mudah di-mock dalam pengujian tanpa efek samping jaringan.
 */
export async function processNotification(
  input: OrchestrationInput,
): Promise<{
  classification: FinalClassification;
  regexResult: ParsedNotification | null;
  aiResult: GeminiNotificationAnalysis | null;
}> {
  let regexResult: ParsedNotification | null = null;
  if (!input.isSensitive) {
    const runner = input.regexRunner || defaultRegexRunner;
    regexResult = runner(input.appName, input.title, input.content, input.receivedAtRaw);
  }

  let aiResult: GeminiNotificationAnalysis | null = null;
  if (shouldInvokeAi(regexResult, input.isSensitive) && input.aiCaller) {
    aiResult = await input.aiCaller(input.appName, input.title, input.content);
  }

  const classification = classifyNotification({
    title: input.title,
    content: input.content,
    isSensitive: input.isSensitive,
    regexResult,
    aiResult,
    transactionDate: input.receivedAtIso,
    appName: input.appName,
  });

  return { classification, regexResult, aiResult };
}
