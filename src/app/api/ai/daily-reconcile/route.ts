// ==============================================================================
// API ROUTE: src/app/api/ai/daily-reconcile/route.ts
// Endpoint Rekonsiliasi AI Harian (Gemini Flash)
// - GET: Cek sisa kuota hari ini (Maksimal 2x per hari)
// - POST: Eksekusi rekonsiliasi harian (manual oleh user / dipanggil cron)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  calculateRemainingQuota,
  getJakartaDateString,
  formatTransactionsForPrompt,
  analyzeDailyTransactionsWithGemini,
  MAX_DAILY_RECONCILIATION_RUNS,
} from '@/lib/ai/daily-reconciler';
import { extractPromoKeywordsFromText } from '@/lib/ai/adaptive-rules';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

/**
 * GET: Ambil status kuota rekonsiliasi harian
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Dapatkan household ID
    let householdId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .maybeSingle();
      householdId = profile?.household_id || null;
    }

    // Fallback household untuk mode lokal / anon
    if (!householdId) {
      const serviceClient = getServiceSupabase();
      if (serviceClient) {
        const { data: defaultHousehold } = await serviceClient
          .from('households')
          .select('id')
          .limit(1)
          .maybeSingle();
        householdId = defaultHousehold?.id || null;
      }
    }

    if (!householdId) {
      return NextResponse.json({
        runsToday: 0,
        maxRuns: MAX_DAILY_RECONCILIATION_RUNS,
        remaining: MAX_DAILY_RECONCILIATION_RUNS,
        canRun: true,
        dateWib: getJakartaDateString(),
        lastRunAt: null,
      });
    }

    const todayWib = getJakartaDateString();
    const serviceClient = getServiceSupabase() || supabase;

    const { data: logs, count } = await serviceClient
      .from('ai_reconciliation_logs')
      .select('id, created_at', { count: 'exact' })
      .eq('household_id', householdId)
      .eq('reconciled_date', todayWib)
      .order('created_at', { ascending: false });

    const runsCount = count || logs?.length || 0;
    const quota = calculateRemainingQuota(runsCount);

    return NextResponse.json({
      runsToday: runsCount,
      maxRuns: MAX_DAILY_RECONCILIATION_RUNS,
      remaining: quota.remaining,
      canRun: quota.canRun,
      dateWib: todayWib,
      lastRunAt: logs?.[0]?.created_at || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[GET daily-reconcile quota error]:', message);
    return NextResponse.json(
      {
        runsToday: 0,
        maxRuns: MAX_DAILY_RECONCILIATION_RUNS,
        remaining: MAX_DAILY_RECONCILIATION_RUNS,
        canRun: true,
        dateWib: getJakartaDateString(),
        lastRunAt: null,
      },
      { status: 200 }
    );
  }
}

/**
 * POST: Eksekusi rekonsiliasi AI harian
 */
export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const isCron = searchParams.get('cron') === 'true';
    const clientSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const configuredSecret = process.env.CRON_SECRET || process.env.WEBHOOK_API_KEY;

    // Verifikasi Auth
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    let householdId: string | null = null;
    let serviceClient = getServiceSupabase();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .maybeSingle();
      householdId = profile?.household_id || null;
    } else if (isCron && configuredSecret && clientSecret === configuredSecret && serviceClient) {
      // Akses resmi dari Cron Scheduler
      const { data: defaultHousehold } = await serviceClient
        .from('households')
        .select('id')
        .limit(1)
        .maybeSingle();
      householdId = defaultHousehold?.id || null;
    }

    // Fallback aman HANYA untuk dev lingkungan lokal (bukan production)
    if (!householdId && serviceClient && process.env.NODE_ENV !== 'production') {
      const { data: defaultHousehold } = await serviceClient
        .from('households')
        .select('id')
        .limit(1)
        .maybeSingle();
      householdId = defaultHousehold?.id || null;
    }

    if (!householdId) {
      return NextResponse.json(
        { error: 'Unauthorized: Harap login atau sediakan kredensial valid.' },
        { status: 401 }
      );
    }

    const clientToUse = serviceClient || supabase;
    const todayWib = getJakartaDateString();

    // 1. Cek Kuota Harian (Maksimal 2x)
    const { count } = await clientToUse
      .from('ai_reconciliation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId)
      .eq('reconciled_date', todayWib);

    const runsToday = count || 0;
    if (runsToday >= MAX_DAILY_RECONCILIATION_RUNS) {
      return NextResponse.json(
        {
          error: `Batas kuota rekonsiliasi harian tercapai (${runsToday}/${MAX_DAILY_RECONCILIATION_RUNS}). Kuota akan direset kembali besok pukul 00:00 WIB.`,
          runsToday,
          maxRuns: MAX_DAILY_RECONCILIATION_RUNS,
          remaining: 0,
          canRun: false,
        },
        { status: 429 }
      );
    }

    // 2. Ambil Transaksi yang Perlu Direkonsiliasi (Status 'pending')
    const { data: pendingTxs } = await clientToUse
      .from('transactions')
      .select('id, amount, direction, merchant, transaction_date, source_device, raw_notification, accounts(name, type)')
      .eq('household_id', householdId)
      .eq('status', 'pending')
      .order('transaction_date', { ascending: true })
      .limit(100);

    // Ambil Daftar Kategori Aktif
    const { data: categories } = await clientToUse
      .from('categories')
      .select('id, name, type')
      .eq('household_id', householdId)
      .order('sort_order', { ascending: true });

    const availableCategories = categories || [];
    const categoryNames = availableCategories.map((c: any) => c.name);

    if (!pendingTxs || pendingTxs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Tidak ada transaksi berstatus pending untuk direkonsiliasi.',
        processedCount: 0,
        pairedTransfersCount: 0,
        duplicatesCount: 0,
        reconciledCount: 0,
        ignoredCount: 0,
        remainingQuota: MAX_DAILY_RECONCILIATION_RUNS - runsToday,
        summaryNotes: 'Semua transaksi sudah berstatus reconciled atau bersih.',
        details: null,
      });
    }

    // 3. Format dan Jalankan Analisis Gemini Flash
    const compactItems = formatTransactionsForPrompt(pendingTxs);
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
    const aiResult = await analyzeDailyTransactionsWithGemini(
      compactItems,
      categoryNames,
      geminiApiKey
    );

    // 4. Terapkan Hasil ke Database
    let pairedCount = 0;
    let duplicateCount = 0;
    let reconciledCount = 0;
    let ignoredCount = 0;

    // Cari ID Kategori 'Transfer Keluarga'
    const transferCategory = availableCategories.find(
      (c: any) => c.name.toLowerCase().includes('transfer')
    ) || availableCategories[0];

    const validPendingIds = new Set(pendingTxs.map((t) => t.id));

    // A. Terapkan Pasangan Transfer Internal
    for (const pair of aiResult.internalTransfers) {
      if (pair.outTxId && pair.inTxId && validPendingIds.has(pair.outTxId) && validPendingIds.has(pair.inTxId)) {
        await clientToUse
          .from('transactions')
          .update({
            status: 'reconciled',
            category_id: transferCategory?.id || null,
            needs_review: false,
          })
          .eq('household_id', householdId)
          .in('id', [pair.outTxId, pair.inTxId]);
        pairedCount++;
      }
    }

    // B. Terapkan Duplikat Konfirmasi
    for (const dup of aiResult.duplicates) {
      if (dup.ignoreTxId && validPendingIds.has(dup.ignoreTxId)) {
        await clientToUse
          .from('transactions')
          .update({
            status: 'ignored',
            needs_review: false,
          })
          .eq('household_id', householdId)
          .eq('id', dup.ignoreTxId);
        duplicateCount++;
      }
    }

    // C. Terapkan Reconciled Belanja/Pemasukan Sah
    for (const item of aiResult.reconciled) {
      if (!validPendingIds.has(item.txId)) continue;
      const matchedCat = availableCategories.find(
        (c: any) => c.name.toLowerCase() === item.categoryName.toLowerCase()
      );

      await clientToUse
        .from('transactions')
        .update({
          status: 'reconciled',
          category_id: matchedCat?.id || availableCategories[0]?.id || null,
          needs_review: false,
        })
        .eq('household_id', householdId)
        .eq('id', item.txId);
      reconciledCount++;
    }

    // D. Terapkan Ignored (Transaksi semu / Rp 0)
    for (const item of aiResult.ignored) {
      if (!validPendingIds.has(item.txId)) continue;
      await clientToUse
        .from('transactions')
        .update({
          status: 'ignored',
          needs_review: false,
        })
        .eq('household_id', householdId)
        .eq('id', item.txId);
      ignoredCount++;
    }

    // E. Pembelajaran Otomatis Regex Adaptif (Closed-Loop Learning)
    // Ekstrak frasa promo dari temuan Gemini dan simpan ke learned_promo_rules
    if (aiResult.ignored.length > 0 && householdId) {
      try {
        const learnedEntries: Array<{ household_id: string; keyword: string; source: 'gemini'; sample_text: string }> = [];

        for (const item of aiResult.ignored) {
          const tx = pendingTxs.find((t) => t.id === item.txId);
          if (tx) {
            const rawText = tx.raw_notification || '';
            const keywords = extractPromoKeywordsFromText(tx.merchant || '', rawText, item.reason);

            for (const kw of keywords) {
              learnedEntries.push({
                household_id: householdId,
                keyword: kw,
                source: 'gemini',
                sample_text: rawText.slice(0, 200),
              });
            }
          }
        }

        if (learnedEntries.length > 0) {
          await clientToUse
            .from('learned_promo_rules')
            .upsert(learnedEntries, { onConflict: 'household_id,keyword', ignoreDuplicates: true });
        }
      } catch (err: unknown) {
        console.warn('[Adaptive Promo Rules Learning Warn]:', err instanceof Error ? err.message : err);
      }
    }

    // 5. Catat ke Tabel Audit Log ai_reconciliation_logs
    const summaryNotes = `Rekonsiliasi ${isCron ? 'Otomatis (Cron 23.00)' : 'Manual'}: ${pairedCount} pasang transfer internal, ${duplicateCount} duplikat dibersihkan, ${reconciledCount} transaksi disetujui.`;

    await clientToUse
      .from('ai_reconciliation_logs')
      .insert({
        household_id: householdId,
        reconciled_date: todayWib,
        trigger_type: isCron ? 'cron' : 'manual',
        processed_count: pendingTxs.length,
        paired_transfers_count: pairedCount,
        duplicates_count: duplicateCount,
        reconciled_count: reconciledCount,
        summary_notes: summaryNotes,
      });

    const newRunsCount = runsToday + 1;
    const remainingQuota = Math.max(0, MAX_DAILY_RECONCILIATION_RUNS - newRunsCount);

    return NextResponse.json({
      success: true,
      message: 'Rekonsiliasi AI harian berhasil diterapkan.',
      processedCount: pendingTxs.length,
      pairedTransfersCount: pairedCount,
      duplicatesCount: duplicateCount,
      reconciledCount: reconciledCount,
      ignoredCount,
      remainingQuota,
      runsToday: newRunsCount,
      maxRuns: MAX_DAILY_RECONCILIATION_RUNS,
      summaryNotes,
      details: aiResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST daily-reconcile error]:', message);
    return NextResponse.json(
      { error: `Gagal menjalankan rekonsiliasi: ${message}` },
      { status: 500 }
    );
  }
}
