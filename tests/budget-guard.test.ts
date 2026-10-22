import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchTargetCategory,
  evaluateBudgetAlert,
  TARGET_BUDGET_CATEGORIES,
} from '../src/lib/budget/budget-guard.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Budget Guard & Alert Engine', () => {
  test('TARGET_BUDGET_CATEGORIES memuat 8 kategori utama', () => {
    assert.equal(TARGET_BUDGET_CATEGORIES.length, 8);
    const ids = TARGET_BUDGET_CATEGORIES.map((c) => c.id);
    assert.ok(ids.includes('b-dapur'));
    assert.ok(ids.includes('b-makan'));
    assert.ok(ids.includes('b-trans'));
    assert.ok(ids.includes('b-tagih'));
  });

  test('matchTargetCategory mencocokkan ID dan nama kategori', () => {
    assert.equal(matchTargetCategory('b-dapur').id, 'b-dapur');
    assert.equal(matchTargetCategory('Belanja Dapur').id, 'b-dapur');
    assert.equal(matchTargetCategory('b-makan').id, 'b-makan');
    assert.equal(matchTargetCategory('Makan & Jajan').id, 'b-makan');
  });

  test('matchTargetCategory mencocokkan kata kunci kontekstual', () => {
    assert.equal(matchTargetCategory('Beli Kopi Kenangan').id, 'b-makan');
    assert.equal(matchTargetCategory('Bensin Pertalite SPBU').id, 'b-trans');
    assert.equal(matchTargetCategory('Tagihan Listrik PLN Bulanan').id, 'b-tagih');
    assert.equal(matchTargetCategory('Sembako Pasar').id, 'b-dapur');
    assert.equal(matchTargetCategory('Tiket Liburan Dufan').id, 'b-jalan');
    assert.equal(matchTargetCategory('Biaya Dokter & Obat Apotek').id, 'b-darurat');
    assert.equal(matchTargetCategory('Pembelian Random Tidak Jelas').id, 'b-lain');
  });

  test('evaluateBudgetAlert mengabaikan jika batas anggaran bernilai 0 atau belum disetel', async () => {
    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { limit_amount: 0 } }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const res = await evaluateBudgetAlert(
      mockSupabase,
      'hh-123',
      'Makan & Jajan',
      '2026-10-22T10:00:00Z'
    );

    assert.equal(res, null);
  });

  test('evaluateBudgetAlert memicu alert 80% saat pengeluaran mencapai 80%', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'category_budgets') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { limit_amount: 1000000 } }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  neq: () => ({
                    gte: () => ({
                      lte: async () => ({
                        data: [
                          { amount: 500000, category_id: 'b-makan', categories: { name: 'Makan & Jajan' } },
                          { amount: 350000, category_id: 'b-makan', categories: { name: 'Makan & Jajan' } },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'notification_alert_logs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({ data: null }), // Belum pernah dikirim
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    const alert = await evaluateBudgetAlert(
      mockSupabase,
      'hh-123',
      'b-makan',
      '2026-10-22T10:00:00Z'
    );

    assert.ok(alert !== null);
    assert.equal(alert?.level, '80');
    assert.equal(alert?.percentage, 85);
    assert.equal(alert?.totalSpent, 850000);
    assert.equal(alert?.remainingAmount, 150000);
    assert.ok(alert?.title.includes('Menipis'));
  });

  test('evaluateBudgetAlert memicu alert 100% saat pengeluaran melampaui batas anggaran', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'category_budgets') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { limit_amount: 500000 } }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  neq: () => ({
                    gte: () => ({
                      lte: async () => ({
                        data: [
                          { amount: 600000, category_id: 'b-dapur', categories: { name: 'Belanja Dapur' } },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'notification_alert_logs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({ data: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    const alert = await evaluateBudgetAlert(
      mockSupabase,
      'hh-123',
      'Belanja Dapur',
      '2026-10-22T10:00:00Z'
    );

    assert.ok(alert !== null);
    assert.equal(alert?.level, '100');
    assert.equal(alert?.percentage, 120);
    assert.ok(alert?.title.includes('Melebihi Batas'));
  });

  test('evaluateBudgetAlert meredam duplikasi alert jika level yang sama sudah pernah dikirim bulan ini', async () => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'category_budgets') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: { limit_amount: 500000 } }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  neq: () => ({
                    gte: () => ({
                      lte: async () => ({
                        data: [
                          { amount: 600000, category_id: 'b-dapur', categories: { name: 'Belanja Dapur' } },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'notification_alert_logs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({ data: { id: 'log-exist-1' } }), // SUDAH ADA LOG
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;

    const alert = await evaluateBudgetAlert(
      mockSupabase,
      'hh-123',
      'Belanja Dapur',
      '2026-10-22T10:00:00Z'
    );

    // Harus teredam menjadi null
    assert.equal(alert, null);
  });
});
