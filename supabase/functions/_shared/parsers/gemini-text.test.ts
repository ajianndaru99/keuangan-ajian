import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { analyzeNotificationWithGemini } from './gemini-text.ts';

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

  it('berhasil mem-parse transaksi GoPay dari respons AI JSON', async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  isTransaction: true,
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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    } as any);

    const res = await analyzeNotificationWithGemini(
      'GoPay',
      'Pembayaran Sukses',
      'Pembayaran Rp 32.000 ke Gojek Ride berhasil.',
      'fake-api-key'
    );

    expect(res).toEqual({
      isTransaction: true,
      amount: 32000,
      direction: 'out',
      merchant: 'Gojek Ride',
      accountName: 'GoPay',
      reference: 'GO-123456',
    });
  });

  it('mendeteksi bukan transaksi jika notifikasi promo / iklan', async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```json\n{"isTransaction": false, "amount": 0, "direction": "out", "merchant": "Shopee", "accountName": "ShopeePay", "reference": null}\n```',
              },
            ],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    } as any);

    const res = await analyzeNotificationWithGemini(
      'ShopeePay',
      'Promo Gajian!',
      'Dapatkan cashback s.d Rp 50.000 hanya hari ini!',
      'fake-api-key'
    );

    expect(res).toEqual({
      isTransaction: false,
      amount: 0,
      direction: 'out',
      merchant: 'Shopee',
      accountName: 'ShopeePay',
      reference: null,
    });
  });
});
