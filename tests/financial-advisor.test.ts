// ==============================================================================
// UNIT TEST: tests/financial-advisor.test.ts
// Menguji pemrosesan analisis keuangan on-demand AI & Smart Fallback
// ==============================================================================

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCleanJson,
  generateLocalFallbackAnalysis,
  analyzeFinancesWithGemini,
} from '../src/lib/ai/financial-advisor.ts';
import type { FinancialAnalysisPayload } from '../src/lib/ai/financial-advisor.ts';

describe('Financial AI Advisor (Gemini Flash & Smart Fallback)', () => {
  const dummyPayload: FinancialAnalysisPayload = {
    monthName: 'Oktober 2026',
    totalExpense: 1450000,
    totalIncome: 5000000,
    netDifference: 3550000,
    dailyAverage: 46774,
    peakInsight: {
      dateStr: '2026-10-08',
      formattedDate: 'Kamis, 8 Oktober 2026',
      totalExpense: 650000,
      dailyAverage: 46774,
      percentageAboveAverage: 1289,
      transactions: [
        {
          merchant: 'Superindo Supermarket',
          amount: 500000,
          categoryName: 'Belanja Dapur',
        },
        {
          merchant: 'SPBU Pertamina',
          amount: 150000,
          categoryName: 'Transportasi',
        },
      ],
    },
    topCategories: [
      { name: 'Belanja Dapur', amount: 800000, percentage: 55 },
      { name: 'Transportasi', amount: 350000, percentage: 24 },
    ],
    transactionCount: 8,
  };

  test('extractCleanJson membersihkan markdown codeblock dengan benar', () => {
    const raw = '```json\n{\n  "headline": "Keuangan Bagus"\n}\n```';
    const cleaned = extractCleanJson(raw);
    assert.equal(cleaned, '{\n  "headline": "Keuangan Bagus"\n}');
  });

  test('extractCleanJson tidak merusak json yang sudah bersih', () => {
    const raw = '{"status":"ok"}';
    const cleaned = extractCleanJson(raw);
    assert.equal(cleaned, '{"status":"ok"}');
  });

  test('generateLocalFallbackAnalysis menghasilkan analisis surplus yang akurat', () => {
    const res = generateLocalFallbackAnalysis(dummyPayload);

    assert.ok(res.headline.includes('Surplus'));
    assert.equal(res.cashFlowStatus, 'surplus');
    assert.ok(res.peakAnalysis.includes('Superindo Supermarket'));
    assert.ok(res.actionableTips.length >= 2);
    assert.ok(res.savingsOpportunity.length > 0);
  });

  test('generateLocalFallbackAnalysis menangani kondisi defisit kas dengan benar', () => {
    const deficitPayload: FinancialAnalysisPayload = {
      ...dummyPayload,
      totalIncome: 1000000,
      totalExpense: 2000000,
      netDifference: -1000000,
    };
    const res = generateLocalFallbackAnalysis(deficitPayload);

    assert.equal(res.cashFlowStatus, 'deficit');
    assert.ok(res.headline.includes('Defisit'));
    assert.ok(res.cashFlowEvaluation.includes('defisit'));
  });

  test('generateLocalFallbackAnalysis menangani kondisi belum ada transaksi', () => {
    const emptyPayload: FinancialAnalysisPayload = {
      monthName: 'Oktober 2026',
      totalExpense: 0,
      totalIncome: 0,
      netDifference: 0,
      dailyAverage: 0,
      peakInsight: {
        dateStr: null,
        formattedDate: '-',
        totalExpense: 0,
        dailyAverage: 0,
        percentageAboveAverage: 0,
        transactions: [],
      },
    };
    const res = generateLocalFallbackAnalysis(emptyPayload);

    assert.equal(res.cashFlowStatus, 'healthy');
    assert.ok(res.headline.includes('Terkendali'));
  });

  test('analyzeFinancesWithGemini fallback aman saat tidak ada API key', async () => {
    // Dipanggil tanpa key override dan tanpa env
    const res = await analyzeFinancesWithGemini(dummyPayload, '');
    assert.ok(res.headline);
    assert.ok(res.peakAnalysis);
    assert.ok(res.actionableTips.length > 0);
  });
});
