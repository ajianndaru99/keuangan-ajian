import { describe, expect, it, vi } from 'vitest';
import {
  processNotification,
  shouldInvokeAi,
} from './classify.ts';
import { parseLivinNotification } from './livin.ts';
import { parseJagoNotification } from './jago.ts';
import type { GeminiNotificationAnalysis } from './gemini-text.ts';

describe('Orchestration: shouldInvokeAi', () => {
  it('tidak memanggil AI jika notifikasi sensitif (OTP/PIN)', () => {
    expect(shouldInvokeAi(null, true)).toBe(false);
  });

  it('tidak memanggil AI jika regex menghasilkan outcome ignored (promo/gagal/pending)', () => {
    // Sampel nyata promo Livin
    const promoLivin = parseLivinNotification('', 'Cashback Rp 50.000 untuk kamu! Belanja sekarang', '1760248800000');
    expect(promoLivin.outcome).toBe('ignored');
    expect(shouldInvokeAi(promoLivin, false)).toBe(false);

    // Sampel nyata gagal Livin
    const gagalLivin = parseLivinNotification('', 'Transfer Rp 100.000 ke Budi gagal. Saldo Rp 2.500.000', '1760248800000');
    expect(gagalLivin.outcome).toBe('ignored');
    expect(shouldInvokeAi(gagalLivin, false)).toBe(false);
  });

  it('tidak memanggil AI jika regex menghasilkan outcome transaction yang sah', () => {
    const options = { now: new Date('2026-10-08T03:00:00.000Z') };
    const txJago = parseJagoNotification(
      'Jago',
      "You've transferred Rp50.000 to NURUL",
      '2026-10-08T09:01:00+07:00',
      options,
    );
    expect(txJago.outcome).toBe('transaction');
    expect(shouldInvokeAi(txJago, false)).toBe(false);
  });

  it('memanggil AI jika belum ada parser regex (null) atau status needs_review', () => {
    expect(shouldInvokeAi(null, false)).toBe(true);

    const reviewLivin = parseLivinNotification('', 'Pembayaran Rp 85.000 ke KFC', '1760248800000');
    expect(reviewLivin.outcome).toBe('needs_review');
    expect(shouldInvokeAi(reviewLivin, false)).toBe(true);
  });
});

describe('Orchestration: processNotification dengan Spy AI Caller', () => {
  it('memastikan spy aiCaller TIDAK dipanggil untuk notifikasi berstatus ignored dari regex', async () => {
    const aiCallerSpy = vi.fn<() => Promise<GeminiNotificationAnalysis | null>>();

    const { classification, regexResult, aiResult } = await processNotification({
      appName: 'id.co.bankmandiri.livin',
      title: 'Promo Spesial',
      content: 'Diskon hingga Rp 100.000 untuk transaksi pertama',
      receivedAtRaw: '1760248800000',
      isSensitive: false,
      aiCaller: aiCallerSpy,
    });

    expect(aiCallerSpy).not.toHaveBeenCalled();
    expect(regexResult?.outcome).toBe('ignored');
    expect(aiResult).toBeNull();
    expect(classification.outcome).toBe('ignored');
    expect(classification.reasons).toEqual(['promo']);
    expect(classification.parseMethod).toBe('regex');
  });

  it('memastikan spy aiCaller TIDAK dipanggil untuk notifikasi transaksi sah dari regex', async () => {
    const aiCallerSpy = vi.fn<() => Promise<GeminiNotificationAnalysis | null>>();

    const { classification, regexResult, aiResult } = await processNotification({
      appName: 'com.jago.bank',
      title: 'Jago',
      content: "You've transferred Rp50.000 to NURUL",
      receivedAtRaw: '2026-10-08T09:01:00+07:00',
      isSensitive: false,
      aiCaller: aiCallerSpy,
    });

    expect(aiCallerSpy).not.toHaveBeenCalled();
    expect(regexResult?.outcome).toBe('transaction');
    expect(aiResult).toBeNull();
    expect(classification.outcome).toBe('transaction');
    expect(classification.amount).toBe(50000);
    expect(classification.parseMethod).toBe('regex');
  });

  it('memastikan spy aiCaller TIDAK dipanggil untuk notifikasi sensitif (OTP)', async () => {
    const aiCallerSpy = vi.fn<() => Promise<GeminiNotificationAnalysis | null>>();

    const { classification, aiResult } = await processNotification({
      appName: 'com.jago.bank',
      title: '[REDACTED]',
      content: '[REDACTED]',
      receivedAtRaw: '1760248800000',
      isSensitive: true,
      aiCaller: aiCallerSpy,
    });

    expect(aiCallerSpy).not.toHaveBeenCalled();
    expect(aiResult).toBeNull();
    expect(classification.outcome).toBe('ignored');
    expect(classification.reasons).toEqual(['sensitive_content']);
    expect(classification.parseMethod).toBe('regex');
  });

  it('memanggil spy aiCaller tepat 1 kali ketika regex bernilai null (aplikasi tanpa parser)', async () => {
    const mockAiResponse: GeminiNotificationAnalysis = {
      label: 'PENGELUARAN',
      confidence: 90,
      reason: 'Pembayaran QRIS BCA',
      amount: 25000,
      direction: 'out',
      merchant: 'Kopi Kenangan',
      accountName: 'BCA',
      reference: 'QRIS-12345',
    };

    const aiCallerSpy = vi.fn().mockResolvedValue(mockAiResponse);

    const { classification, regexResult, aiResult } = await processNotification({
      appName: 'com.bca',
      title: 'Pembayaran QRIS Berhasil',
      content: 'Transaksi Rp 25.000 di Kopi Kenangan berhasil',
      receivedAtRaw: '1760248800000',
      isSensitive: false,
      aiCaller: aiCallerSpy,
    });

    expect(aiCallerSpy).toHaveBeenCalledTimes(1);
    expect(aiCallerSpy).toHaveBeenCalledWith(
      'com.bca',
      'Pembayaran QRIS Berhasil',
      'Transaksi Rp 25.000 di Kopi Kenangan berhasil',
    );
    expect(regexResult).toBeNull();
    expect(aiResult).toEqual(mockAiResponse);
    expect(classification.outcome).toBe('transaction');
    expect(classification.amount).toBe(25000);
    expect(classification.parseMethod).toBe('ai_gemini');
  });

  it('memanggil spy aiCaller tepat 1 kali ketika regex menghasilkan needs_review', async () => {
    const mockAiResponse: GeminiNotificationAnalysis = {
      label: 'PENGELUARAN',
      confidence: 90,
      reason: 'Pembayaran merchant terkonfirmasi',
      amount: 75000,
      direction: 'out',
      merchant: 'KFC',
      accountName: 'Mandiri',
      reference: null,
    };

    const aiCallerSpy = vi.fn().mockResolvedValue(mockAiResponse);

    // Sampel arah tidak diketahui Livin (needs_review) yang memerlukan klarifikasi AI
    const { classification, regexResult, aiResult } = await processNotification({
      appName: 'id.co.bankmandiri.livin',
      title: 'Livin Mandiri',
      content: 'Transaksi Rp 75.000 berhasil',
      receivedAtRaw: '2026-10-08T09:01:00+07:00',
      isSensitive: false,
      aiCaller: aiCallerSpy,
    });

    expect(aiCallerSpy).toHaveBeenCalledTimes(1);
    expect(regexResult).not.toBeNull();
    expect(regexResult?.outcome).toBe('needs_review');
    expect(aiResult).toEqual(mockAiResponse);
    expect(classification.outcome).toBe('transaction');
    expect(classification.amount).toBe(75000);
    expect(classification.parseMethod).toBe('ai_gemini');
  });
});
