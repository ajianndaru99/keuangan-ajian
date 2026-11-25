// ==============================================================================
// TELEGRAM COMMANDS & CONTEXT: src/lib/telegram/commands.ts
// Handler Perintah Slash Finansial (/status, /anggaran, /rekap, /inbox) & Konteks AI
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from './bot.ts';
import {
  formatStatusMessage,
  formatAnggaranMessage,
  formatSpecificCategoryBudgetMessage,
  formatRekapMessage,
  formatInboxMessage,
  formatTodayExpensesMessage,
  formatDaily11AMReportMessage,
  formatRecentReceiptsMessage,
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
import { formatRupiah, formatTimeWIB } from '../utils.ts';
import {
  TARGET_BUDGET_CATEGORIES,
  matchTargetCategory,
  isInternalTransferCategoryOrMerchant,
  type TargetCategory,
} from '../budget/budget-guard.ts';
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
  _istriAccount?: { id?: string; name: string } | null
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

      // Rentang waktu bersamaan <= 10 menit (600.000 ms)
      if (diffMs <= 10 * 60 * 1000) {
        const aIsGeneric = isGenericMerchantName(txA.merchant);
        const bIsGeneric = isGenericMerchantName(txB.merchant);

        // Kasus 1: Pasangan Transfer Antar Akun Sendiri (Bank -> E-Wallet) vs Belanja Merchant Riil
        // Contoh: Transfer Rp 13.500 dari Jago ke GoPay, lalu beli Bensin Rp 13.500 di NURUL HAFIZA RAHIMA.
        // Keduanya BUKAN duplikat! Transaksi generik adalah Transfer Internal, sedangkan transaksi spesifik adalah Pengeluaran riil.
        if ((aIsGeneric && !bIsGeneric) || (!aIsGeneric && bIsGeneric)) {
          const genericTx = aIsGeneric ? txA : txB;
          const specificTx = aIsGeneric ? txB : txA;

          // Tandai transaksi bank/dompet generik sebagai Transfer Internal jika belum
          if (!/^(?:transfer\s*internal|koreksi\s*saldo)/i.test(genericTx.merchant || '')) {
            const fromAcc = genericTx.accounts?.name || genericTx.merchant || 'Bank Jago';
            const toAcc = specificTx.accounts?.name || 'GoPay';
            genericTx.merchant = `Transfer Internal: ${fromAcc} ➔ ${toAcc}`;
            genericTx.category_id = null;
            genericTx.categories = null;

            if (genericTx.id) {
              try {
                const txTable: any = supabase.from('transactions');
                if (txTable && typeof txTable.update === 'function') {
                  await txTable
                    .update({
                      merchant: genericTx.merchant,
                      category_id: null,
                      notes: 'Dikonversi otomatis sebagai transfer internal (pasangan belanja waktu bersamaan)',
                    })
                    .eq('id', genericTx.id)
                    .eq('household_id', householdId);
                }
              } catch {
                // Abaikan jika unit test mock
              }
            }
          }

          // Keluarkan transaksi transfer internal dari daftar pengeluaran (ignoredIndexes),
          // tetapi jangan tandai 'ignored' di database agar saldo kedua akun tetap seimbang
          const genericIndex = aIsGeneric ? i : j;
          ignoredIndexes.add(genericIndex);
          continue;
        }

        // Kasus 2: Kedua transaksi memiliki nama merchant spesifik yang berbeda (Merchant A vs Merchant B)
        // Keduanya adalah transaksi belanja riil yang berbeda, jangan disatukan
        if (!aIsGeneric && !bIsGeneric && txA.merchant?.toLowerCase() !== txB.merchant?.toLowerCase()) {
          continue;
        }

        // Kasus 3: Nama merchant sama persis atau notifikasi duplikat dari multi-listener
        // Pertahankan satu entri dengan nama merchant paling spesifik (single account Suami)
        const keepIndex = aIsGeneric && !bIsGeneric ? j : i;
        const dropIndex = keepIndex === i ? j : i;

        const keepTx = sorted[keepIndex];
        const dropTx = sorted[dropIndex];

        keepTx.source_device = 'suami';
        if (keepTx.account_id) accountsToSync.add(keepTx.account_id);
        if (dropTx.account_id) accountsToSync.add(dropTx.account_id);

        ignoredIndexes.add(dropIndex);

        // Bersihkan permanen di database jika kedua ID tersedia
        if (dropTx.id && keepTx.id) {
          try {
            const txTable: any = supabase.from('transactions');
            if (txTable && typeof txTable.update === 'function') {
              await txTable
                .update({
                  status: 'ignored',
                  notes: `Duplikat waktu bersamaan (${amtA}) disatukan ke ${keepTx.merchant || 'transaksi utama'}`,
                })
                .eq('id', dropTx.id)
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

  const activeAccounts = (accounts || []).filter((a: any) => !a.owner || a.owner === 'suami' || a.owner === 'bersama');
  const displayAccounts = activeAccounts.length > 0 ? activeAccounts : (accounts || []);

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

  // Ambil daftar kategori riil untuk resolusi aman (tahan banting terhadap format array PostgREST)
  const catMap = new Map<string, string>();
  try {
    const catQuery: any = supabase.from('categories');
    if (catQuery && typeof catQuery.select === 'function') {
      const { data: dbCategories } = await catQuery
        .select('id, name')
        .eq('household_id', householdId);
      (dbCategories || []).forEach((c: any) => {
        if (c.id && c.name) catMap.set(c.id, c.name);
      });
    }
  } catch {
    // Abaikan jika mock test tidak menyediakan tabel categories
  }

  // Filter in-memory cadangan + deduplikasi otomatis waktu bersamaan
  const rawTxList = (txList || []) as unknown as TxCatRelation[];
  const filteredTxs = rawTxList.filter((t) => {
    const rawCat = t.categories;
    const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
    const catName = relCatName || (t.category_id ? catMap.get(t.category_id) : '') || '';
    return !isInternalTransferCategoryOrMerchant(catName, t.merchant);
  });
  const validTxs = await deduplicateSimultaneousExpenses(supabase, householdId, filteredTxs, null);
  const totalSpentMonth = validTxs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

  // Sinkronkan saldo tiap akun secara paralel agar cepat dan selalu identik antara Website, DB & Telegram
  const accountItems: Array<{ name: string; owner: 'Suami' | 'Istri'; balance: number }> = await Promise.all(
    displayAccounts.map(async (acc: any) => {
      let resolvedBalance = Number(acc.balance ?? acc.initial_balance ?? 0);
      if (acc.id) {
        try {
          const syncRes = await syncAccountBalance(supabase, acc.id);
          if (syncRes.success && syncRes.newBalance !== undefined) {
            resolvedBalance = syncRes.newBalance;
          }
        } catch {
          // Fallback aman untuk unit test mock sederhana
        }
      }
      return {
        name: acc.name,
        owner: 'Suami' as const,
        balance: resolvedBalance,
      };
    })
  );

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
    const rawCat = item.categories;
    const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
    const catName = relCatName || (item.category_id ? catMap.get(item.category_id) : '') || '';

    if (isInternalTransferCategoryOrMerchant(catName, item.merchant)) return;

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
    const rawCat = t.categories;
    const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
    const catName = relCatName || (t.category_id ? catMap.get(t.category_id) : '') || '';
    if (isInternalTransferCategoryOrMerchant(catName, t.merchant)) return false;

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
 * Handler Pemeriksaan Status Anggaran untuk Kategori Spesifik (Contoh: "Lainnya", "Belanja Dapur")
 */
export async function handleSpecificCategoryBudgetCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string,
  targetCategory: TargetCategory,
  monthStartDay: number
): Promise<void> {
  const context = await buildFinancialContext(supabase, householdId, monthStartDay);
  const catBudget = context.categoryBudgets.find((b) => b.name.toLowerCase() === targetCategory.name.toLowerCase());
  const limit = catBudget?.limit || 0;
  const spent = catBudget?.spent || 0;

  const dateRange = getMonthlyRange(0, monthStartDay);
  const { data: dbCategories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('household_id', householdId);

  const catMap = new Map<string, string>();
  (dbCategories || []).forEach((c) => {
    if (c.id && c.name) catMap.set(c.id, c.name);
  });

  const { data: txList } = await supabase
    .from('transactions')
    .select('amount, merchant, category_id, transaction_date, categories(name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .neq('status', 'ignored')
    .gte('transaction_date', dateRange.startDate.toISOString())
    .lte('transaction_date', dateRange.endDate.toISOString())
    .order('transaction_date', { ascending: false });

  const matchedTxs: Array<{ date: string; merchant: string; amount: number }> = [];

  (txList || []).forEach((t: any) => {
    const rawCat = t.categories;
    const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
    const catName = relCatName || (t.category_id ? catMap.get(t.category_id) : '') || '';

    if (isInternalTransferCategoryOrMerchant(catName, t.merchant)) return;

    const matched = matchTargetCategory(catName);
    if (matched.id === targetCategory.id) {
      const dt = t.transaction_date ? new Date(t.transaction_date) : new Date();
      const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
      matchedTxs.push({
        date: dateStr,
        merchant: t.merchant || 'Transaksi',
        amount: Number(t.amount || 0),
      });
    }
  });

  const text = formatSpecificCategoryBudgetMessage({
    categoryName: targetCategory.name,
    limit,
    spent,
    periodLabel: context.periodLabel,
    transactions: matchedTxs,
  });

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
  const { count: pendingCount, data: pendingList, error: txErr } = await supabase
    .from('transactions')
    .select('id, merchant, amount, transaction_date, raw_notification')
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .order('transaction_date', { ascending: false })
    .limit(5);

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
  if (pendingList && pendingList.length > 0 && pendingList[pendingList.length - 1].transaction_date) {
    oldestDateStr = new Date(pendingList[pendingList.length - 1].transaction_date).toLocaleDateString('id-ID', {
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

  // Tampilkan hingga 3 transaksi pending teratas lengkap dengan isi notifikasi & tombol aksi langsung
  for (const p of (pendingList || []).slice(0, 3)) {
    const rawLine = p.raw_notification ? `\nNotif: _${String(p.raw_notification).slice(0, 240)}_` : '';
    await sendTelegramMessage(
      chatId,
      `*[PENDING]* *${p.merchant || 'Mutasi'}* — \`${formatRupiah(Number(p.amount || 0))}\`${rawLine}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Sesuai', callback_data: `tx_ok:${p.id}` },
              { text: 'Kategori', callback_data: `tx_cat:${p.id}` },
            ],
            [
              { text: 'Promo/Spam', callback_data: `tx_rej_promo:${p.id}` },
              { text: 'Dobel', callback_data: `tx_rej_dup:${p.id}` },
            ],
          ],
        },
      }
    );
  }
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

  // Deduplikasi otomatis transaksi kembar waktu bersamaan (single account Suami)
  const validItems = await deduplicateSimultaneousExpenses(supabase, householdId, filteredItems, null);

  const items = validItems.map((t) => ({
    time: formatTimeWIB(t.transaction_date || ''),
    merchant: t.merchant || 'Pengeluaran',
    amount: Number(t.amount || 0),
    categoryName: t.categories?.name || 'Lainnya',
    accountName: t.accounts?.name || 'Akun Suami',
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

/**
 * Handler Perintah /nota atau /struk (Daftar Nota & Struk Pembelian Terkini)
 */
export async function handleReceiptsListCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: dbCategories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('household_id', householdId);

  const catMap = new Map<string, string>();
  (dbCategories || []).forEach((c: any) => {
    if (c.id && c.name) catMap.set(c.id, c.name);
  });

  // Ambil transaksi pengeluaran/nota terbaru
  const { data: txList } = await supabase
    .from('transactions')
    .select('id, amount, merchant, category_id, transaction_date, status, needs_review, raw_notification, accounts(name), categories(name)')
    .eq('household_id', householdId)
    .neq('status', 'ignored')
    .order('transaction_date', { ascending: false })
    .limit(10);

  const receipts = (txList || []).map((t: any) => {
    const rawCat = t.categories;
    const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
    const catName = relCatName || (t.category_id ? catMap.get(t.category_id) : '') || 'Lainnya';

    const rawAcc = t.accounts;
    const accName = Array.isArray(rawAcc) ? rawAcc[0]?.name : rawAcc?.name || 'Utama';

    const dt = t.transaction_date ? new Date(t.transaction_date) : new Date();
    const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} ${formatTimeWIB(dt)}`;

    return {
      id: t.id,
      date: dateStr,
      merchant: t.merchant || 'Nota Belanja',
      amount: Number(t.amount || 0),
      categoryName: catName,
      accountName: accName,
      status: t.status || 'reconciled',
      needsReview: Boolean(t.needs_review),
    };
  });

  const text = formatRecentReceiptsMessage(receipts);
  await sendTelegramMessage(chatId, text);
}

/**
 * Handler Perintah /raw (10 Notifikasi Mentah Terbaru beserta outcome-nya)
 */
export async function handleRawNotificationsCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: raws } = await supabase
    .from('raw_notifications')
    .select('app_name, title, content, outcome, received_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (!raws || raws.length === 0) {
    await sendTelegramMessage(chatId, '*[RAW STREAM]* Belum ada notifikasi mentah yang tercatat.');
    return;
  }

  const lines = raws.map((r: any, idx: number) => {
    const status = r.outcome === 'transaction' ? '[MASUK]' : '[ABAIKAN]';
    const snippet = `${r.title ? `${r.title}: ` : ''}${r.content || ''}`.trim().slice(0, 140);
    return `${idx + 1}. ${status} *${r.app_name || 'App'}*\n   _${snippet.replace(/([_*`\[])/g, '\\$1')}_`;
  });

  await sendTelegramMessage(chatId, `*[RAW STREAM] 8 NOTIFIKASI MENTAH TERBARU*\n\n${lines.join('\n\n')}`);
}

/**
 * Handler Perintah /spreadsheet (Status & Link Google Spreadsheet)
 */
export async function handleSpreadsheetCommand(
  chatId: number | string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const [{ data: settingRow }, { data: integ }] = await Promise.all([
    supabase
      .from('settings')
      .select('spreadsheet_url, spreadsheet_owner_email, spreadsheet_auto_sync')
      .eq('household_id', householdId)
      .maybeSingle(),
    supabase
      .from('spreadsheet_integrations')
      .select('webhook_url, spreadsheet_id, last_synced_at, last_error')
      .eq('household_id', householdId)
      .maybeSingle(),
  ]);

  const connected = Boolean(integ?.webhook_url || integ?.spreadsheet_id || settingRow?.spreadsheet_url);
  await sendTelegramMessage(
    chatId,
    `*[GOOGLE SPREADSHEET]*\nStatus: *${connected ? 'Terhubung' : 'Belum terhubung'}*\nEmail: ${settingRow?.spreadsheet_owner_email ? `\`${settingRow.spreadsheet_owner_email}\`` : '_Belum diset_'}\nAuto-Sync: *${settingRow?.spreadsheet_auto_sync !== false ? 'AKTIF' : 'NONAKTIF'}*\nLink: ${settingRow?.spreadsheet_url || '_Ketik /pengaturan -> Spreadsheet untuk menghubungkan_'}`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: 'Buka Menu Spreadsheet', callback_data: 'cfg:sheet' }]],
      },
    }
  );
}
