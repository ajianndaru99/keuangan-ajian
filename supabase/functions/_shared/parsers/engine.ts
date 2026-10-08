// ==============================================================================
// engine.ts — alur pemrosesan yang sama untuk semua aplikasi bank/e-wallet
//
// Urutan (berhenti di langkah pertama yang menyatakan "bukan transaksi"):
//   1. kosong            → ignored
//   2. OTP / rahasia     → ignored + sensitive (teks mentah tidak boleh disimpan)
//   3. tanpa nominal     → ignored
//   4. status & promo    → ignored (promo / gagal / pending)
//   5. arah, nominal utama, merchant, referensi, tanggal
//      → 'transaction' hanya jika TIDAK ada yang ambigu, selain itu 'needs_review'
// ==============================================================================

import { extractAmounts, selectMainAmount } from './amount.ts';
import { extractCounterparty, extractReference, normalizeText, parseReceivedAt } from './fields.ts';
import {
  FAILED_PATTERNS,
  PENDING_PATTERNS,
  PROMO_PATTERNS,
  REFUND_PATTERNS,
  SENSITIVE_PATTERNS,
  SUCCESS_PATTERNS,
  matchesAny,
} from './rules.ts';
import type {
  BankProfile,
  Direction,
  ParseInput,
  ParseOptions,
  ParsedNotification,
  ReasonCode,
  TxStatus,
} from './types.ts';

function emptyResult(profile: BankProfile): ParsedNotification {
  return {
    outcome: 'ignored',
    isValid: false,
    parserVersion: profile.parserVersion,
    bank: profile.bank,
    accountName: profile.accountName,
    direction: 'unknown',
    status: 'unknown',
    amount: null,
    merchant: null,
    reference: null,
    transactionDate: null,
    otherAmounts: [],
    sensitive: false,
    reasons: [],
    warnings: [],
  };
}

function ignored(result: ParsedNotification, reason: ReasonCode): ParsedNotification {
  return { ...result, outcome: 'ignored', isValid: false, reasons: [reason] };
}

/** Urutan penting: refund → gagal → pending → sukses. */
function detectStatus(lower: string, hasSuccessEvidence: boolean): TxStatus {
  if (matchesAny(lower, REFUND_PATTERNS)) return 'refund';
  if (matchesAny(lower, FAILED_PATTERNS)) return 'failed';
  if (matchesAny(lower, PENDING_PATTERNS)) return 'pending';
  return hasSuccessEvidence ? 'success' : 'unknown';
}

/** Sinyal bertentangan atau tidak ada sinyal → 'unknown' (tidak pernah menebak). */
function resolveDirection(status: TxStatus, inHit: boolean, outHit: boolean): Direction {
  if (status === 'refund') return 'in';
  if (inHit && !outHit) return 'in';
  if (outHit && !inHit) return 'out';
  return 'unknown';
}

export function parseNotification(
  profile: BankProfile,
  input: ParseInput,
  options: ParseOptions = {},
): ParsedNotification {
  const result = emptyResult(profile);

  // title dan text digabung: judul sering membawa kata kunci ("Transfer Berhasil").
  const title = normalizeText(input.title ?? '');
  const text = normalizeText(input.text ?? '');
  const combined = [title, text].filter(Boolean).join(' | ');
  const lower = combined.toLowerCase();

  if (!combined) return ignored(result, 'empty_notification');

  if (matchesAny(lower, SENSITIVE_PATTERNS)) {
    return ignored({ ...result, sensitive: true }, 'sensitive_content');
  }

  const mentions = extractAmounts(lower);
  if (mentions.length === 0) return ignored(result, 'no_amount');

  const inHit = matchesAny(lower, profile.inPatterns);
  const outHit = matchesAny(lower, profile.outPatterns);
  const hasSuccessEvidence =
    inHit || matchesAny(lower, SUCCESS_PATTERNS) || matchesAny(lower, profile.successPatterns ?? []);
  const status = detectStatus(lower, hasSuccessEvidence);
  result.status = status;

  const promoHit = matchesAny(lower, PROMO_PATTERNS);
  if (promoHit && status === 'unknown') return ignored(result, 'promo');
  if (promoHit) result.warnings.push('promo_keyword_present');

  if (status === 'failed') return ignored(result, 'status_failed');
  if (status === 'pending') return ignored(result, 'status_pending');

  const review: ReasonCode[] = [];
  if (status === 'unknown') review.push('status_unknown');
  if (status === 'refund') review.push('refund_needs_classification');

  result.direction = resolveDirection(status, inHit, outHit);
  if (result.direction === 'unknown') review.push(inHit && outHit ? 'direction_conflict' : 'direction_unknown');

  const main = selectMainAmount(mentions);
  result.amount = main.amount;
  result.otherAmounts = mentions.filter((mention) => mention.label !== 'main');
  if (main.problem) review.push(main.problem);

  result.merchant = extractCounterparty(combined, result.direction);
  if (!result.merchant) result.warnings.push('merchant_unknown');
  result.reference = extractReference(combined);

  const receivedAt = parseReceivedAt(input.receivedAt, options);
  result.transactionDate = receivedAt.iso;
  if (receivedAt.problem) review.push(receivedAt.problem);

  result.reasons = review;
  result.outcome = review.length > 0 ? 'needs_review' : 'transaction';
  result.isValid = result.outcome === 'transaction';
  return result;
}
