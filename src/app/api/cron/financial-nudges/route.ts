// ==============================================================================
// CRON ROUTE: src/app/api/cron/financial-nudges/route.ts
// Mesin Laporan Harian Pukul 11:00 WIB (Cuaca Yogyakarta, Libur Pemerintah & Motivasi)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { broadcastToAllowedChats, isTelegramConfigured } from '@/lib/telegram/bot';
import {
  formatWeeklyDigestNudge,
  formatPayYourselfFirstNudge,
  formatBillReminderNudge,
  formatMidMonthNudge,
} from '@/lib/telegram/formatters';
import { buildDaily11AMReportText } from '@/lib/telegram/commands';
import { getWeeklyRange, getMonthlyRange, calculateComparison } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

export async function GET(req: NextRequest) {
  return handleNudgeExecution(req);
}

export async function POST(req: NextRequest) {
  return handleNudgeExecution(req);
}

async function handleNudgeExecution(req: NextRequest) {
  try {
    // 1. Verifikasi Keamanan Pemicu Cron
    const authHeader = req.headers.get('authorization') || '';
    const cronSecretHeader = req.headers.get('x-cron-secret') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '') || cronSecretHeader;
    const configuredSecret = process.env.CRON_SECRET || process.env.WEBHOOK_API_KEY;

    if (configuredSecret && token !== configuredSecret) {
      console.warn('[Cron Financial Nudges] Percobaan akses tanpa token secret yang sah.');
      return NextResponse.json({ error: 'Unauthorized: Kredensial cron tidak valid.' }, { status: 401 });
    }

    if (!isTelegramConfigured()) {
      return NextResponse.json({
        success: false,
        message: 'TELEGRAM_BOT_TOKEN belum disetel di environment.',
      });
    }

    const supabase = getServiceSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Koneksi database backend gagal diinisialisasi.' }, { status: 500 });
    }

    // Ambil default household
    const { data: household } = await supabase
      .from('households')
      .select('id')
      .limit(1)
      .maybeSingle();

    const householdId = household?.id;
    if (!householdId) {
      return NextResponse.json({ error: 'Household belum terdaftar.' }, { status: 404 });
    }

    // Ambil konfigurasi tanggal gajian dari settings
    const { data: settingData } = await supabase
      .from('settings')
      .select('month_start_day')
      .eq('household_id', householdId)
      .maybeSingle();
    const monthStartDay = settingData?.month_start_day || 25;

    // Evaluasi Tanggal & Waktu Asia/Jakarta (WIB)
    const nowWib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentDayOfWeek = nowWib.getDay(); // 0 = Minggu, 1 = Senin, ...
    const currentDateOfMonth = nowWib.getDate();

    const dispatchedNudges: string[] = [];

    // =========================================================================
    // KONDISI 0: Laporan Harian Siang Pukul 11:00 WIB (Setiap Hari)
    // Memuat Cuaca Yogyakarta, Libur Resmi Pemerintah, Ringkasan Kas & Motivasi Harian
    // =========================================================================
    const daily11Report = await buildDaily11AMReportText(supabase, householdId, monthStartDay);
    await broadcastToAllowedChats(daily11Report);
    dispatchedNudges.push('daily_11am_report');

    // =========================================================================
    // KONDISI 1: Senin Pagi -> Rekap Finansial Mingguan (Weekly Digest)
    // =========================================================================
    if (currentDayOfWeek === 1) {
      const currentWeek = getWeeklyRange(0);
      const prevWeek = getWeeklyRange(-1);

      const { data: currTxs } = await supabase
        .from('transactions')
        .select('amount, category_id, categories(name)')
        .eq('household_id', householdId)
        .eq('direction', 'out')
        .neq('status', 'ignored')
        .gte('transaction_date', currentWeek.startDate.toISOString())
        .lte('transaction_date', currentWeek.endDate.toISOString());

      const { data: prevTxs } = await supabase
        .from('transactions')
        .select('amount')
        .eq('household_id', householdId)
        .eq('direction', 'out')
        .neq('status', 'ignored')
        .gte('transaction_date', prevWeek.startDate.toISOString())
        .lte('transaction_date', prevWeek.endDate.toISOString());

      const currentWeekTotal = (currTxs || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const previousWeekTotal = (prevTxs || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const comparison = calculateComparison(currentWeekTotal, previousWeekTotal);

      const catSpent = new Map<string, number>();
      (currTxs || []).forEach((tx) => {
        interface TxCat {
          amount: number;
          categories: { name: string } | null;
        }
        const item = tx as unknown as TxCat;
        const name = item.categories?.name || 'Lainnya';
        catSpent.set(name, (catSpent.get(name) || 0) + Number(item.amount || 0));
      });

      let topCategoryName: string | undefined;
      let topCategoryAmount = 0;
      catSpent.forEach((amt, name) => {
        if (amt > topCategoryAmount) {
          topCategoryAmount = amt;
          topCategoryName = name;
        }
      });

      const message = formatWeeklyDigestNudge({
        currentWeekTotal,
        previousWeekTotal,
        comparisonPercent: comparison.percent,
        isIncrease: comparison.isIncrease,
        topCategoryName,
        topCategoryAmount,
        weekLabel: currentWeek.label,
      });

      await broadcastToAllowedChats(message);
      dispatchedNudges.push('weekly_digest');
    }

    // =========================================================================
    // KONDISI 2: Tanggal 18 -> Pengingat Tagihan Rutin H-2 (PLN, WiFi, BPJS)
    // =========================================================================
    if (currentDateOfMonth === 18) {
      const message = formatBillReminderNudge();
      await broadcastToAllowedChats(message);
      dispatchedNudges.push('bill_reminder_h2');
    }

    // =========================================================================
    // KONDISI 3: Tanggal Gajian -> Pay Yourself First (Menabung di Awal)
    // =========================================================================
    if (currentDateOfMonth === monthStartDay) {
      const message = formatPayYourselfFirstNudge(monthStartDay);
      await broadcastToAllowedChats(message);
      dispatchedNudges.push('pay_yourself_first');
    }

    // =========================================================================
    // KONDISI 4: H+15 dari Gajian -> Cek Burn Rate Tengah Bulan
    // =========================================================================
    const dateRange = getMonthlyRange(0, monthStartDay);
    const msSinceStart = nowWib.getTime() - dateRange.startDate.getTime();
    const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));

    if (daysSinceStart === 15) {
      const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

      const { data: txList } = await supabase
        .from('transactions')
        .select('amount')
        .eq('household_id', householdId)
        .eq('direction', 'out')
        .neq('status', 'ignored')
        .gte('transaction_date', dateRange.startDate.toISOString())
        .lte('transaction_date', dateRange.endDate.toISOString());

      const totalSpent = (txList || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const { data: budgetData } = await supabase
        .from('category_budgets')
        .select('limit_amount')
        .eq('household_id', householdId)
        .eq('period_month', periodMonth);

      const totalBudgetLimit = (budgetData || []).reduce((sum, b) => sum + Number(b.limit_amount || 0), 0);
      const monthPercentage = totalBudgetLimit > 0 ? Math.round((totalSpent / totalBudgetLimit) * 100) : 0;

      const msRemaining = Math.max(0, dateRange.endDate.getTime() - nowWib.getTime());
      const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
      const remainingBudget = Math.max(0, totalBudgetLimit - totalSpent);
      const safeDailySpend = totalBudgetLimit > 0 ? Math.round(remainingBudget / daysRemaining) : 0;

      const message = formatMidMonthNudge(monthPercentage, totalSpent, safeDailySpend, daysRemaining);
      await broadcastToAllowedChats(message);
      dispatchedNudges.push('mid_month_burn_rate');
    }

    return NextResponse.json({
      success: true,
      wibDate: nowWib.toISOString().slice(0, 10),
      dayOfWeek: currentDayOfWeek,
      dispatchedNudges,
      message: dispatchedNudges.length > 0
        ? `Berhasil mengirim ${dispatchedNudges.length} pengingat finansial Telegram.`
        : 'Tidak ada jadwal pengingat finansial untuk tanggal hari ini.',
    });
  } catch (err: unknown) {
    console.error('[Cron Financial Nudges Exception]:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

