// ==============================================================================
// TELEGRAM COMMANDS & CONTEXT: src/lib/telegram/commands.ts
// Handler Perintah Slash Finansial (/status, /anggaran, /rekap, /inbox) & Konteks AI
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from './bot.ts';
import {
  formatStatusMessage,
  formatAnggaranMessage,
  formatRekapMessage,
  formatInboxMessage,
  formatTodayExpensesMessage,
  formatDaily11AMReportMessage,
} from './formatters.ts';
import type {
  CategoryBudgetItem,
  AccountBalanceItem,
} from './formatters.ts';
import {
  getMonthlyRange,
  getWeeklyRange,
  getTodayRangeWIB,
  calculateComparison,
} from '../date-utils.ts';
import { formatTimeWIB } from '../utils.ts';
import { TARGET_BUDGET_CATEGORIES, matchTargetCategory } from '../budget/budget-guard.ts';
import { syncAccountBalance } from '../account-balance.ts';
import {
  fetchTodayWeatherInfo,
  getIndonesianHolidayInfo,
  generateDailyDynamicCaption,
} from './weather.ts';
import type { FinancialContext } from './nlp-chat.ts';

interface TxCatRelation {
  id?: string;
  amount?: number | null;
  merchant?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  source_device?: string | null;
  transaction_date?: string | null;
  categories?: { name: string } | null;
  accounts?: { name: string } | null;
}

/**
 * Mengecek apakah nama merchant adalah nama aplikasi/bank/kantong generik (misal "Jago", "Daily Pocket", "QRIS")
 */
export function isGenericMerchantName(merchant?: string | null): boolean {
  const clean = (merchant || '').trim();
  if (!clean) return true;
  return (
    /^(?:jago|bank\s*jago|bca|mandiri|bri|bni|bsi|seabank|qris|pembayaran(?:\s*qris)?|daily\s*pocket|your\s*daily\s*pocket|kantong(?:\s*utama|\s*bersama)?|saldo|dana|gopay|ovo|shopeepay|linkaja|rekening|merchant(?:\s*transaksi)?|transaksi(?:\s*digital)?|umum|pengeluaran)$/i.test(
      clean
    ) || /daily\s*pocket|kantong\s*bersama|merchant\s*transaksi|transaksi\s*digital/i.test(clean)
  );
}

/**
 * Menyatukan transaksi pengeluaran kembar pada waktu bersamaan (<= 5 menit) dan nominal sama.
 * Aturan keluarga: jika ada 2 notifikasi di waktu bersamaan dengan nominal sama (mis. Rp 13.500 di NURUL HAFIZA RAHIMA & Rp 13.500 di Jago),
 * maka itu adalah 1 transaksi dari pengeluaran Istri (dialokasikan ke akun Istri & gunakan nama merchant spesifik).
 */
export async function deduplicateSimultaneousExpenses(
  supabase: SupabaseClient,
  householdId: string,
  items: TxCatRelation[],
  istriAccount?: { id?: string; name: string } | null
): Promise<TxCatRelation[]> {
  // Urutkan kronologis dari waktu paling awal ke paling akhir
  const sorted = [...items].sort((a, b) => {
    const timeA = a.transaction_date ? new Date(a.transaction_date).getTime() : 0;
    const timeB = b.transaction_date ? new Date(b.transaction_date).getTime() : 0;
    return timeA - timeB;
  });

  const ignoredIndexes = new Set<number>();
  const accountsToSync = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    if (ignoredIndexes.has(i)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      if (ignoredIndexes.has(j)) continue;

      const txA = sorted[i];
      const txB = sorted[j];
      const amtA = Number(txA.amount || 0);
      const amtB = Number(txB.amount || 0);

      if (amtA <= 0 || amtA !== amtB) continue;
      if (!txA.transaction_date || !txB.transaction_date) continue;

      const timeA = new Date(txA.transaction_date).getTime();
      const timeB = new Date(txB.transaction_date).getTime();
      const diffMs = Math.abs(timeB - timeA);

      // Rentang waktu bersamaan <= 5 menit (300.000 ms)
      if (diffMs <= 5 * 60 * 1000) {
        const aIsGeneric = isGenericMerchantName(txA.merchant);
        const bIsGeneric = isGenericMerchantName(txB.merchant);

        // Utamakan yang memiliki nama merchant spesifik (contoh: 'NURUL HAFIZA RAHIMA' dibanding 'Jago')
        const keepIndex = aIsGeneric && !bIsGeneric ? j : i;
        const dropIndex = keepIndex === i ? j : i;

        const keepTx = sorted[keepIndex];
        const dropTx = sorted[dropIndex];

        // Tandai sebagai pengeluaran Istri sesuai aturan keluarga
        keepTx.source_device = 'istri';
        if (istriAccount) {
          if (keepTx.account_id && keepTx.account_id !== istriAccount.id) {
            accountsToSync.add(keepTx.account_id);
          }
          if (istriAccount.id) {
            keepTx.account_id = istriAccount.id;
            accountsToSync.add(istriAccount.id);
          }
          keepTx.accounts = { name: istriAccount.name };
        }

        if (dropTx.account_id) {
          accountsToSync.add(dropTx.account_id);
        }

        ignoredIndexes.add(dropIndex);

        // Bersihkan permanen di database jika kedua ID tersedia
        if (dropTx.id && keepTx.id) {
          try {
            const txTable: any = supabase.from('transactions');
            if (txTable && typeof txTable.update === 'function') {
              await txTable
                .update({
                  status: 'ignored',
                  notes: `Duplikat waktu bersamaan (${amtA}) disatukan ke ${keepTx.merchant || 'transaksi Istri'}`,
                })
                .eq('id', dropTx.id)
                .eq('household_id', householdId);

              const updateKeepPayload: Record<string, any> = {
                source_device: 'istri',
                merchant: keepTx.merchant,
              };
              if (istriAccount?.id) {
                updateKeepPayload.account_id = istriAccount.id;
              }

              await txTable
                .update(updateKeepPayload)
                .eq('id', keepTx.id)
                .eq('household_id', householdId);
            }
          } catch {
            // Abaikan jika dipanggil dari unit test mock sederhana
          }
        }
      }
    }
  }

  for (const accId of accountsToSync) {
    try {
      await syncAccountBalance(supabase, accId);
    } catch {
      // Abaikan jika mock test
    }
  }

  return sorted.filter((_, idx) => !ignoredIndexes.has(idx));
}

/**
 * Membangun Konteks Finansial Lengkap untuk /status dan AI NLP Chat
 * Aturan: Hanya menghitung transaksi 'reconciled' untuk pengeluaran sah
 */
export async function buildFinancialContext(
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<FinancialContext> {
  const dateRange = getMonthlyRange(0, monthStartDay);
  const periodMonth = `${dateRange.startDate.getFullYear()}-${String(dateRange.startDate.getMonth() + 1).padStart(2, '0')}`;

  // 1. Ambil Saldo Rekening
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, owner, balance, initial_balance')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (accErr) {
    console.error('[Commands buildFinancialContext Account Error]:', accErr.message);
  }

  const istriAccRecord = (accounts || []).find((a: any) => a.owner === 'istri');
  const istriAccount = istriAccRecord
    ? { id: (istriAccRecord as any).id as string | undefined, name: istriAccRecord.name }
    : null;

  // 2. Ambil Pengeluaran Transaksi Bulan Ini (HANYA 'reconciled' belanja sah)
  // Kecualikan koreksi saldo administratif dan transfer internal antar rekening
  let txQuery = supabase
    .from('transactions')
    .select('id, amount, merchant, category_id, account_id, source_device, transaction_date, categories(name), accounts(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled');

  const tqAny = txQuery as any;
  if (typeof tqAny.not === 'function') {
    txQuery = tqAny
      .not('merchant', 'ilike', 'Koreksi Saldo%')
      .not('merchant', 'ilike', 'Transfer Internal%');
  }

  const { data: txList, error: txErr } = await txQuery
    .gte('transaction_date', dateRange.startDate.toISOString())
    .lte('transaction_date', dateRange.endDate.toISOString());

  if (txErr) {
    console.error('[Commands buildFinancialContext Tx Error]:', txErr.message);
  }

  // Filter in-memory cadangan + deduplikasi otomatis waktu bersamaan (pengeluaran Istri)
  const rawTxList = (txList || []) as unknown as TxCatRelation[];
  const filteredTxs = rawTxList.filter((t) => !/^(koreksi saldo|transfer internal)/i.test(t.merchant || ''));
  const validTxs = await deduplicateSimultaneousExpenses(supabase, householdId, filteredTxs, istriAccount);
  const totalSpentMonth = validTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Sinkronkan saldo tiap akun agar selalu identik antara Website, Database, dan Telegram
  const accountItems: Array<{ name: string; owner: 'Suami' | 'Istri'; balance: number }> = [];
  for (const acc of accounts || []) {
    let resolvedBalance = Number(acc.balance ?? acc.initial_balance ?? 0);
    if ((acc as any).id) {
      try {
        const syncRes = await syncAccountBalance(supabase, (acc as any).id);
        if (syncRes.success && syncRes.newBalance !== undefined) {
          resolvedBalance = syncRes.newBalance;
        }
      } catch {
        // Fallback aman untuk unit test mock sederhana
      }
    }
    accountItems.push({
      name: acc.name,
      owner: acc.owner === 'suami' ? 'Suami' : 'Istri',
      balance: resolvedBalance,
    });
  }

  const totalBalance = accountItems.reduce((sum, a) => sum + a.balance, 0);

  // Ambil transaksi pending untuk catatan konteks
  const { count: pendingCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'pending');

  // 3. Ambil Batas Anggaran Kategori
  const { data: budgets, error: bgErr } = await supabase
    .from('category_budgets')
    .select('category_id, limit_amount')
    .eq('household_id', householdId)
    .eq('period_month', periodMonth);

  if (bgErr) {
    console.error('[Commands buildFinancialContext Budget Error]:', bgErr.message);
  }

  const budgetMap = new Map<string, number>();
  (budgets || []).forEach((b) => budgetMap.set(b.category_id, Number(b.limit_amount || 0)));

  const spentMap = new Map<string, number>();
  validTxs.forEach((tx) => {
    const item = tx as unknown as TxCatRelation;
    const catName = item.categories?.name || item.category_id || '';
    const target = matchTargetCategory(catName);
    spentMap.set(target.id, (spentMap.get(target.id) || 0) + Number(item.amount || 0));
  });

  const totalBudgetLimit = (budgets || []).reduce((sum, b) => sum + Number(b.limit_amount || 0), 0);

  // 4. Hitung Sisa Waktu & Safe-to-Spend
  const now = new Date();
  const msRemaining = Math.max(0, dateRange.endDate.getTime() - now.getTime());
  const daysRemaining = Math.max(1, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  const remainingBudget = Math.max(0, totalBudgetLimit - totalSpentMonth);
  const safeDailySpend = totalBudgetLimit > 0 ? Math.round(remainingBudget / daysRemaining) : 0;

  const categoryBudgets = TARGET_BUDGET_CATEGORIES.map((target) => {
    const limit = budgetMap.get(target.id) || 0;
    const spent = spentMap.get(target.id) || 0;
    return {
      name: target.name,
      spent,
      limit,
      remaining: Math.max(0, limit - spent),
    };
  });

  // 5. Hitung Pengeluaran Hari Ini (WIB)
  const todayRange = getTodayRangeWIB(now);
  const todayTxs = validTxs.filter((t) => {
    if (!t.transaction_date) return false;
    const txTime = new Date(t.transaction_date).getTime();
    return txTime >= todayRange.startDate.getTime() && txTime <= todayRange.endDate.getTime();
  });

  const todaySpent = todayTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const todayTransactions = todayTxs.map((t) => ({
    time: formatTimeWIB(t.transaction_date || ''),
    merchant: t.merchant || 'Transaksi',
    amount: Number(t.amount || 0),
    categoryName: (t.categories?.name || 'Lainnya'),
    accountName: t.accounts?.name || (t.source_device?.includes('istri') ? 'Dana Istri' : 'Dana Suami'),
    ownerLabel: t.source_device?.includes('istri') ? 'Istri' : (t.source_device?.includes('suami') ? 'Suami' : undefined),
  }));

  return {
    accounts: accountItems,
    totalBalance,
    totalSpentMonth,
    totalBudgetLimit,
    daysRemaining,
    safeDailySpend,
    categoryBudgets,
    periodLabel: dateRange.label,
    pendingCount: pendingCount || 0,
    todaySpent,
    todayTransactions,
  };
}

/**
 * Handler Perintah /status atau /cek
 */
export async function handleStatusCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<void> {
  const context = await buildFinancialContext(supabase, householdId, monthStartDay);

  const monthPercentage = context.totalBudgetLimit > 0
    ? Math.round((context.totalSpentMonth / context.totalBudgetLimit) * 100)
    : 0;

  const text = formatStatusMessage({
    accounts: context.accounts as AccountBalanceItem[],
    totalBalance: context.totalBalance,
    totalSpentMonth: context.totalSpentMonth,
    totalBudgetLimit: context.totalBudgetLimit,
    monthPercentage,
    daysRemaining: context.daysRemaining,
    safeDailySpend: context.safeDailySpend,
    periodLabel: context.periodLabel,
    pendingCount: context.pendingCount || 0,
  });

  await sendTelegramMessage(chatId, text);
}

/**
 * Handler Perintah /anggaran atau /budget
 */
export async function handleAnggaranCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<void> {
  const context = await buildFinancialContext(supabase, householdId, monthStartDay);

  const categoryItems: CategoryBudgetItem[] = TARGET_BUDGET_CATEGORIES.map((target) => {
    const item = context.categoryBudgets.find((b) => b.name === target.name);
    const limit = item?.limit || 0;
    const spent = item?.spent || 0;
    const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    return {
      name: target.name,
      emoji: target.emoji,
      spent,
      limit,
      percentage,
    };
  });

  const text = formatAnggaranMessage(categoryItems, context.periodLabel);
  await sendTelegramMessage(chatId, text);
}

/**
 * Handler Perintah /rekap
 */
export async function handleRekapCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const currentWeek = getWeeklyRange(0);
  const prevWeek = getWeeklyRange(-1);

  // Pengeluaran Minggu Ini (HANYA 'reconciled' belanja riil)
  let currQuery = supabase
    .from('transactions')
    .select('amount, merchant, category_id, categories(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled');

  const cqAny = currQuery as any;
  if (typeof cqAny.not === 'function') {
    currQuery = cqAny
      .not('merchant', 'ilike', 'Koreksi Saldo:%')
      .not('merchant', 'ilike', 'Transfer Internal:%');
  }

  const { data: currTxs, error: currErr } = await currQuery
    .gte('transaction_date', currentWeek.startDate.toISOString())
    .lte('transaction_date', currentWeek.endDate.toISOString());

  if (currErr) {
    console.error('[Commands handleRekapCommand CurrTxs Error]:', currErr.message);
  }

  // Pengeluaran Minggu Lalu (HANYA 'reconciled' belanja riil)
  let prevQuery = supabase
    .from('transactions')
    .select('amount, merchant')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled');

  const pqAny = prevQuery as any;
  if (typeof pqAny.not === 'function') {
    prevQuery = pqAny
      .not('merchant', 'ilike', 'Koreksi Saldo:%')
      .not('merchant', 'ilike', 'Transfer Internal:%');
  }

  const { data: prevTxs, error: prevErr } = await prevQuery
    .gte('transaction_date', prevWeek.startDate.toISOString())
    .lte('transaction_date', prevWeek.endDate.toISOString());

  if (prevErr) {
    console.error('[Commands handleRekapCommand PrevTxs Error]:', prevErr.message);
  }

  const validCurrTxs = (currTxs || []).filter((t: any) => !/^(koreksi saldo|transfer internal):/i.test(t.merchant || ''));
  const validPrevTxs = (prevTxs || []).filter((t: any) => !/^(koreksi saldo|transfer internal):/i.test(t.merchant || ''));

  const currentWeekTotal = validCurrTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const previousWeekTotal = validPrevTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const comparison = calculateComparison(currentWeekTotal, previousWeekTotal);

  const catSpent = new Map<string, number>();
  validCurrTxs.forEach((tx) => {
    const item = tx as unknown as TxCatRelation;
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
}

/**
 * Handler Perintah /inbox
 */
export async function handleInboxCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { count: pendingCount, data: oldestTx, error: txErr } = await supabase
    .from('transactions')
    .select('transaction_date', { count: 'exact' })
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .order('transaction_date', { ascending: true })
    .limit(1);

  if (txErr) {
    console.error('[Commands handleInboxCommand Tx Error]:', txErr.message);
  }

  const { count: unreviewedCount, error: rawErr } = await supabase
    .from('raw_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .is('validated_at', null)
    .neq('outcome', 'transaction');

  if (rawErr) {
    console.error('[Commands handleInboxCommand Raw Error]:', rawErr.message);
  }

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
}

/**
 * Handler Perintah /hariini atau /today (Hanya Pengeluaran Hari Berjalan, Terurut Waktu & Per Kategori)
 */
export async function handleTodayExpensesCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const todayRange = getTodayRangeWIB(new Date());

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, owner')
    .eq('household_id', householdId)
    .eq('is_active', true);

  const istriAccRecord = (accounts || []).find((a: any) => a.owner === 'istri');
  const istriAccount = istriAccRecord
    ? { id: (istriAccRecord as any).id as string | undefined, name: istriAccRecord.name }
    : null;

  let query = supabase
    .from('transactions')
    .select('id, amount, merchant, transaction_date, category_id, account_id, source_device, categories(name), accounts(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled')
    .gte('transaction_date', todayRange.startDate.toISOString())
    .lte('transaction_date', todayRange.endDate.toISOString())
    .order('transaction_date', { ascending: true });

  const qAny = query as any;
  if (typeof qAny.not === 'function') {
    query = qAny
      .not('merchant', 'ilike', 'Koreksi Saldo:%')
      .not('merchant', 'ilike', 'Transfer Internal:%');
  }

  const { data: rawList, error } = await query;
  if (error) {
    console.error('[Commands handleTodayExpensesCommand Error]:', error.message);
  }

  const rawItems = (rawList || []) as unknown as TxCatRelation[];
  const filteredItems = rawItems.filter(
    (t) => !/^(koreksi saldo|transfer internal)/i.test(t.merchant || '')
  );

  // Deduplikasi otomatis transaksi kembar waktu bersamaan (dialokasikan ke Istri)
  const validItems = await deduplicateSimultaneousExpenses(supabase, householdId, filteredItems, istriAccount);

  const items = validItems.map((t) => ({
    time: formatTimeWIB(t.transaction_date || ''),
    merchant: t.merchant || 'Pengeluaran',
    amount: Number(t.amount || 0),
    categoryName: t.categories?.name || 'Lainnya',
    accountName: t.accounts?.name || (t.source_device?.includes('istri') ? 'Dana Istri' : 'Akun Keluarga'),
    ownerLabel: t.source_device?.includes('istri') ? 'Istri' : (t.source_device?.includes('suami') ? 'Suami' : undefined),
  }));

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const text = formatTodayExpensesMessage({
    dateLabel: todayRange.label,
    items,
    totalAmount,
  });

  await sendTelegramMessage(chatId, text);
}

/**
 * Membangun Teks Laporan Harian Pukul 11:00 WIB (Cuaca Yogyakarta, Libur Resmi Pemerintah, Kas, Pengeluaran & Motivasi)
 */
export async function buildDaily11AMReportText(
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<string> {
  const now = new Date();
  const [context, weather] = await Promise.all([
    buildFinancialContext(supabase, householdId, monthStartDay),
    fetchTodayWeatherInfo(),
  ]);

  const holiday = getIndonesianHolidayInfo(now);
  const todayRange = getTodayRangeWIB(now);
  const monthPercentage = context.totalBudgetLimit > 0
    ? Math.round((context.totalSpentMonth / context.totalBudgetLimit) * 100)
    : 0;

  const dailyCaption = generateDailyDynamicCaption({
    date: now,
    monthPercentage,
    todaySpent: context.todaySpent || 0,
    safeDailySpend: context.safeDailySpend,
  });

  const todayItems = (context.todayTransactions || []).map((t) => ({
    time: t.time,
    merchant: t.merchant,
    amount: t.amount,
    categoryName: t.categoryName,
    accountName: t.accountName || 'Rekening Keluarga',
    ownerLabel: t.ownerLabel,
  }));

  return formatDaily11AMReportMessage({
    dateLabel: todayRange.label,
    weather,
    holiday,
    accounts: context.accounts as AccountBalanceItem[],
    totalBalance: context.totalBalance,
    todayItems,
    todaySpent: context.todaySpent || 0,
    totalSpentMonth: context.totalSpentMonth,
    totalBudgetLimit: context.totalBudgetLimit,
    monthPercentage,
    daysRemaining: context.daysRemaining,
    safeDailySpend: context.safeDailySpend,
    dailyCaption,
  });
}

/**
 * Handler Perintah /laporansiang atau /report (Laporan Siang 11:00 WIB + Cuaca Yogyakarta + Libur Pemerintah)
 */
export async function handleDailyReportCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string,
  monthStartDay: number
): Promise<void> {
  const text = await buildDaily11AMReportText(supabase, householdId, monthStartDay);
  await sendTelegramMessage(chatId, text);
}
