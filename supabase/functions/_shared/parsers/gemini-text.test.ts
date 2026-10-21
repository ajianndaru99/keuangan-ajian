import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeNotificationWithGemini,
  parseGeminiResponse,
  NOTIFICATION_SYSTEM_INSTRUCTION,
} from './gemini-text.ts';

describe('Gemini Text AI Analyzer', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('mengembalikan null jika API key kosong', async () => {
    const res = await analyzeNotificationWithGemini('Bank Saqu', 'Transaksi', 'Rp 10.000', '');
    expect(res).toBeNull();
  });

  it('berhasil mem-parse respons AI berlabel PENGELUARAN dan memeriksa system_instruction', async () => {
    let capturedBody: string | null = null;
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  label: 'PENGELUARAN',
                  confidence: 95,
                  reason: 'Pembayaran sah ke Gojek Ride',
                  amount: 32000,
                  direction: 'out',
                  merchant: 'Gojek Ride',
                  accountName: 'GoPay',
                  reference: 'GO-123456',
                }),
              },
            ],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body ? String(init.body) : null;
      return new Response(JSON.stringify(mockJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await analyzeNotificationWithGemini(
      'GoPay',
      'Pembayaran Sukses',
      'Pembayaran Rp 32.000 ke Gojek Ride berhasil.',
      'fake-api-key',
    );

    expect(res).toEqual({
      label: 'PENGELUARAN',
      confidence: 95,
      reason: 'Pembayaran sah ke Gojek Ride',
      amount: 32000,
      direction: 'out',
      merchant: 'Gojek Ride',
      accountName: 'GoPay',
      reference: 'GO-123456',
    });

    // Verifikasi pemisahan system_instruction dari teks notifikasi
    expect(capturedBody).not.toBeNull();
    const parsedPayload = JSON.parse(capturedBody || '{}') as {
      system_instruction?: { parts: Array<{ text: string }> };
      contents?: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(parsedPayload.system_instruction?.parts[0]?.text).toBe(NOTIFICATION_SYSTEM_INSTRUCTION);
    expect(parsedPayload.contents?.[0]?.parts[0]?.text).toContain('DATA NOTIFIKASI:');
  });

  it('mendeteksi label PROMO dan PEMASUKAN dengan benar', async () => {
    const promoResponse = parseGeminiResponse(
      '```json\n{"label": "PROMO", "confidence": 92, "reason": "Penawaran cashback gajian", "amount": 0, "direction": "out", "merchant": "Shopee", "accountName": "ShopeePay", "reference": null}\n```',
      'ShopeePay',
    );

    expect(promoResponse).toEqual({
      label: 'PROMO',
      confidence: 92,
      reason: 'Penawaran cashback gajian',
      amount: 0,
      direction: 'out',
      merchant: 'Shopee',
      accountName: 'ShopeePay',
      reference: null,
    });

    const incomeResponse = parseGeminiResponse(
      JSON.stringify({
        label: 'PEMASUKAN',
        confidence: 90,
        reason: 'Dana transfer masuk',
        amount: 150000,
        direction: 'in',
        merchant: 'Siti Rahma',
        accountName: 'BCA',
        reference: 'TRX-9988',
      }),
      'BCA',
    );

    expect(incomeResponse).toEqual({
      label: 'PEMASUKAN',
      confidence: 90,
      reason: 'Dana transfer masuk',
      amount: 150000,
      direction: 'in',
      merchant: 'Siti Rahma',
      accountName: 'BCA',
      reference: 'TRX-9988',
    });
  });

  it('menganggap keluaran AI rusak / tidak valid sebagai label RAGU dengan confidence 0', () => {
    const corruptedRes = parseGeminiResponse('ini bukan json { rusak', 'DANA');
    expect(corruptedRes.label).toBe('RAGU');
    expect(corruptedRes.confidence).toBe(0);

    const unknownLabelRes = parseGeminiResponse(
      JSON.stringify({ label: 'UNKNOWN_ACTION', confidence: 99, reason: 'Aneh' }),
      'DANA',
    );
    expect(unknownLabelRes.label).toBe('RAGU');
    expect(unknownLabelRes.confidence).toBe(0);
  });
});
