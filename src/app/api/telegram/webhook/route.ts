// ==============================================================================
// TELEGRAM WEBHOOK ROUTE: src/app/api/telegram/webhook/route.ts
// Menerima update pesan interaktif dari Telegram Bot API & merespons secara aman
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isChatIdAllowed, sendTelegramMessage } from '@/lib/telegram/bot';
import {
  formatStatusMessage,
  formatAnggaranMessage,
  formatRekapMessage,
  formatInboxMessage,
  formatHelpMessage,
  CategoryBudgetItem,
  AccountBalanceItem,
} from '@/lib/telegram/formatters';
import { getMonthlyRange, getWeeklyRange, calculateComparison } from '@/lib/date-utils';
import { TARGET_BUDGET_CATEGORIES, matchTargetCategory } from '@/lib/budget/budget-guard';

export const dynamic = 'force-dynamic';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createServiceClient(url, serviceKey);
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      username?: string;
    };
    chat: {
      id: number | string;
      title?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verifikasi Secret Token Webhook (jika dikonfigurasikan)
    const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret && secretHeader !== configuredSecret) {
      console.warn('[Telegram Webhook Rejected] Token rahasia webhook tidak valid.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TelegramUpdate = await req.json().catch(() => ({ update_id: 0 }));
    const message = body.message;

    // Abaikan update non-pesan teks (misal: reaksi emoji, member join, dll)
    if (!message || !message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;

    // 2. Keamanan: Whitelist Chat ID (Fail-Closed)
    if (!isChatIdAllowed(chatId)) {
      console.warn(`[Telegram Webhook Access Denied] Chat ID ${chatId} tidak terdaftar di TELEGRAM_ALLOWED_CHAT_IDS.`);
      // Kirim penolakan sopan ke chat yang tidak dikenal
      await sendTelegramMessage(
        chatId,
        '⛔ *Akses Ditolak*\n\nAkun atau grup Anda belum terdaftar dalam daftar izin keluarga. Hubungi pengelola dasbor untuk mendaftarkan Chat ID ini.'
      );
      return NextResponse.json({ ok: true });
    }

    // 3. Parser Perintah (Dukungan format /command dan /command@BotUsername)
    const rawText = message.text.trim();
    const commandPart = rawText.split(/\s+/)[0].toLowerCase();
    const command = commandPart.split('@')[0];

    // Dapatkan instance Supabase Service Client
    const supabase = getServiceSupabase();
    if (!supabase) {
      await sendTelegramMessage(chatId, '⚠️ *Sistem Sedang Gangguan*\nKoneksi database backend belum siap.');
      return NextResponse.json({ ok: true });
    }

    // Ambil default household
    const { data: household } = await supabase
      .from('households')
      .select('id')
      .limit(1)
      .maybeSingle();

    const householdId = household?.id;
    if (!householdId) {
      await sendTelegramMessage(chatId, '⚠️ *Data Rumah Tangga Belum Ditemukan*\nSilakan buka aplikasi dasbor terlebih dahulu.');
      return NextResponse.json({ ok: true });
    }

    // Ambil konfigurasi tanggal gajian dari settings
    const { data: settingData } = await supabase
      .from('settings')
      .select('month_start_day')
      .eq('household_id', householdId)
      .maybeSingle();
    const monthStartDay = settingData?.month_start_day || 1;

    // 4. Router Perintah
    switch (command) {
      case '/start':
      case '/help':
      case '/guide':
      case '/panduan': {
        const text = formatHelpMessage();
        await sendTelegramMessage(chatId, text);
        break;
      }

      case '/status':
      case '/cek': {
        const dateRange = getMonthlyRange(0, monthStartDay);
        const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

        // Ambil Saldo Rekening
        const { data: accounts } = await supabase
          .from('accounts')
          .select('name, owner, balance, initial_balance')
          .eq('household_id', householdId)
          .eq('is_active', true);

        const accountItems: AccountBalanceItem[] = (accounts || []).map((acc) => ({
          name: acc.name,
          owner: acc.owner === 'suami' ? 'Suami' : 'Istri',
          balance: Number(acc.balance ?? acc.initial_balance ?? 0),
        }));

        const totalBalance = accountItems.reduce((sum, a) => sum + a.balance, 0);

        // Ambil Pengeluaran Bulan Ini
        const { data: txList } = await supabase
          .from('transactions')
          .select('amount')
          .eq('household_id', householdId)
          .eq('direction', 'out')
          .neq('status', 'ignored')
          .gte('transaction_date', dateRange.startDate.toISOString())
          .lte('transaction_date', dateRange.endDate.toISOString());

        const totalSpentMonth = (txList || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

        // Ambil Total Batas Anggaran Kategori Bulan Ini
        const { data: budgetData } = await supabase
          .from('category_budgets')
          .select('limit_amount')
          .eq('household_id', householdId)
          .eq('period_month', periodMonth);

        const totalBudgetLimit = (budgetData || []).reduce((sum, b) => sum + Number(b.limit_amount || 0), 0);
        const monthPercentage = totalBudgetLimit > 0 ? Math.round((totalSpentMonth / totalBudgetLimit) * 100) : 0;

        // Ambil Jumlah Transaksi Pending
        const { count: pendingCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', householdId)
          .eq('status', 'pending');

        // Hitung Safe-to-Spend Harian
        const now = new Date();
        const msRemaining = Math.max(0, dateRange.endDate.getTime() - now.getTime());
        const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
        const remainingBudget = Math.max(0, totalBudgetLimit - totalSpentMonth);
        const safeDailySpend = totalBudgetLimit > 0 ? Math.round(remainingBudget / daysRemaining) : 0;

        const text = formatStatusMessage({
          accounts: accountItems,
          totalBalance,
          totalSpentMonth,
          totalBudgetLimit,
          monthPercentage,
          daysRemaining,
          safeDailySpend,
          periodLabel: dateRange.label,
          pendingCount: pendingCount || 0,
        });

        await sendTelegramMessage(chatId, text);
        break;
      }

      case '/anggaran':
      case '/budget': {
        const dateRange = getMonthlyRange(0, monthStartDay);
        const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

        // Ambil batas anggaran per kategori
        const { data: budgets } = await supabase
          .from('category_budgets')
          .select('category_id, limit_amount')
          .eq('household_id', householdId)
          .eq('period_month', periodMonth);

        const budgetMap = new Map<string, number>();
        (budgets || []).forEach((b) => budgetMap.set(b.category_id, Number(b.limit_amount || 0)));

        // Ambil pengeluaran transaksi bulan ini
        const { data: txList } = await supabase
          .from('transactions')
          .select('amount, category_id, categories(name)')
          .eq('household_id', householdId)
          .eq('direction', 'out')
          .neq('status', 'ignored')
          .gte('transaction_date', dateRange.startDate.toISOString())
          .lte('transaction_date', dateRange.endDate.toISOString());

        const spentMap = new Map<string, number>();
        (txList || []).forEach((tx) => {
          interface TxWithCategory {
            amount: number;
            category_id: string | null;
            categories: { name: string } | null;
          }
          const item = tx as unknown as TxWithCategory;
          const catName = item.categories?.name || item.category_id || '';
          const target = matchTargetCategory(catName);
          spentMap.set(target.id, (spentMap.get(target.id) || 0) + Number(item.amount || 0));
        });

        const categoryItems: CategoryBudgetItem[] = TARGET_BUDGET_CATEGORIES.map((target) => {
          const limit = budgetMap.get(target.id) || 0;
          const spent = spentMap.get(target.id) || 0;
          const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
          return {
            name: target.name,
            emoji: target.emoji,
            spent,
            limit,
            percentage,
          };
        });

        const text = formatAnggaranMessage(categoryItems, dateRange.label);
        await sendTelegramMessage(chatId, text);
        break;
      }

      case '/rekap': {
        const currentWeek = getWeeklyRange(0);
        const prevWeek = getWeeklyRange(-1);

        // Pengeluaran Minggu Ini
        const { data: currTxs } = await supabase
          .from('transactions')
          .select('amount, category_id, categories(name)')
          .eq('household_id', householdId)
          .eq('direction', 'out')
          .neq('status', 'ignored')
          .gte('transaction_date', currentWeek.startDate.toISOString())
          .lte('transaction_date', currentWeek.endDate.toISOString());

        // Pengeluaran Minggu Lalu
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

        // Cari Kategori Terbesar Minggu Ini
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

        const text = formatRekapMessage({
          currentWeekTotal,
          previousWeekTotal,
          comparisonPercent: comparison.percent,
          isIncrease: comparison.isIncrease,
          topCategoryName,
          topCategoryAmount,
          weekLabel: currentWeek.label,
        });

        await sendTelegramMessage(chatId, text);
        break;
      }

      case '/inbox': {
        // Transaksi Pending
        const { count: pendingCount, data: oldestTx } = await supabase
          .from('transactions')
          .select('transaction_date', { count: 'exact' })
          .eq('household_id', householdId)
          .eq('status', 'pending')
          .order('transaction_date', { ascending: true })
          .limit(1);

        // Notifikasi Mentah Belum Divalidasi
        const { count: unreviewedCount } = await supabase
          .from('raw_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('household_id', householdId)
          .is('validated_at', null)
          .neq('outcome', 'transaction');

        let oldestDateStr: string | undefined;
        if (oldestTx && oldestTx.length > 0 && oldestTx[0].transaction_date) {
          oldestDateStr = new Date(oldestTx[0].transaction_date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
        }

        const text = formatInboxMessage({
          pendingCount: pendingCount || 0,
          unreviewedRawCount: unreviewedCount || 0,
          oldestPendingDate: oldestDateStr,
        });

        await sendTelegramMessage(chatId, text);
        break;
      }

      default: {
        await sendTelegramMessage(
          chatId,
          `❓ Perintah \`${command}\` tidak dikenali.\n\nKetik \`/help\` untuk melihat daftar perintah finansial yang tersedia.`
        );
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error('[Telegram Webhook Exception]:', err);
    // Selalu kembalikan 200 ke Telegram agar webhook tidak di-retry terus menerus
    return NextResponse.json({ ok: true });
  }
}

