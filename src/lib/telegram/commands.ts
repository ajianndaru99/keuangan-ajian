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
  CategoryBudgetItem,
  AccountBalanceItem,
} from './formatters.ts';
import { getMonthlyRange, getWeeklyRange, calculateComparison } from '../date-utils.ts';
import { TARGET_BUDGET_CATEGORIES, matchTargetCategory } from '../budget/budget-guard.ts';
import type { FinancialContext } from './nlp-chat.ts';

interface TxCatRelation {
  amount: number;
  category_id?: string | null;
  categories: { name: string } | null;
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
    .select('name, owner, balance, initial_balance')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (accErr) {
    console.error('[Commands buildFinancialContext Account Error]:', accErr.message);
  }

  const accountItems = (accounts || []).map((acc) => ({
    name: acc.name,
    owner: acc.owner === 'suami' ? 'Suami' : 'Istri',
    balance: Number(acc.balance ?? acc.initial_balance ?? 0),
  }));

  const totalBalance = accountItems.reduce((sum, a) => sum + a.balance, 0);

  // 2. Ambil Pengeluaran Transaksi Bulan Ini (HANYA 'reconciled' sesuai standar AGENTS.md)
  const { data: txList, error: txErr } = await supabase
    .from('transactions')
    .select('amount, category_id, categories(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled')
    .gte('transaction_date', dateRange.startDate.toISOString())
    .lte('transaction_date', dateRange.endDate.toISOString());

  if (txErr) {
    console.error('[Commands buildFinancialContext Tx Error]:', txErr.message);
  }

  const totalSpentMonth = (txList || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);

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
  (txList || []).forEach((tx) => {
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

  // Pengeluaran Minggu Ini (HANYA 'reconciled')
  const { data: currTxs, error: currErr } = await supabase
    .from('transactions')
    .select('amount, category_id, categories(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled')
    .gte('transaction_date', currentWeek.startDate.toISOString())
    .lte('transaction_date', currentWeek.endDate.toISOString());

  if (currErr) {
    console.error('[Commands handleRekapCommand CurrTxs Error]:', currErr.message);
  }

  // Pengeluaran Minggu Lalu (HANYA 'reconciled')
  const { data: prevTxs, error: prevErr } = await supabase
    .from('transactions')
    .select('amount')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .eq('status', 'reconciled')
    .gte('transaction_date', prevWeek.startDate.toISOString())
    .lte('transaction_date', prevWeek.endDate.toISOString());

  if (prevErr) {
    console.error('[Commands handleRekapCommand PrevTxs Error]:', prevErr.message);
  }

  const currentWeekTotal = (currTxs || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const previousWeekTotal = (prevTxs || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const comparison = calculateComparison(currentWeekTotal, previousWeekTotal);

  const catSpent = new Map<string, number>();
  (currTxs || []).forEach((tx) => {
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
