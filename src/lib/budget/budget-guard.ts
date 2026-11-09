// ==============================================================================
// BUDGET GUARD: src/lib/budget/budget-guard.ts
// Modul evaluasi ambang batas anggaran & pembentukan payload peringatan
// Dilengkapi peredam duplikasi (anti-spam) per level ambang batas per bulan
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRupiah } from '../utils.ts';
import { getMonthlyRange, getBudgetPeriodKey } from '../date-utils.ts';

export interface TargetCategory {
  id: string;
  name: string;
  emoji: string;
}

export const TARGET_BUDGET_CATEGORIES: TargetCategory[] = [
  { id: 'b-dapur', name: 'Belanja Dapur', emoji: '🛒' },
  { id: 'b-makan', name: 'Makan & Jajan', emoji: '🍔' },
  { id: 'b-trans', name: 'Transportasi/Bensin', emoji: '🚗' },
  { id: 'b-tagih', name: 'Tagihan & Utilitas', emoji: '⚡' },
  { id: 'b-rumah', name: 'Kebutuhan Rumah', emoji: '🏠' },
  { id: 'b-jalan', name: 'Jalan-jalan', emoji: '🏖️' },
  { id: 'b-darurat', name: 'Keperluan Mendadak', emoji: '🚨' },
  { id: 'b-lain', name: 'Lainnya', emoji: '📝' },
];

export interface BudgetAlert {
  categoryId: string;
  categoryName: string;
  level: '80' | '100';
  limitAmount: number;
  totalSpent: number;
  percentage: number;
  remainingAmount: number;
  title: string;
  message: string;
}

export interface ReviewAlert {
  transactionId?: string;
  amount: number;
  merchant: string;
  accountName: string;
  title: string;
  message: string;
  reason: string;
}

/**
 * Memeriksa apakah suatu transaksi atau kategori merupakan transfer internal atau perpindahan kas sesama rekening
 */
export function isInternalTransferCategoryOrMerchant(
  categoryName?: string | null,
  merchant?: string | null
): boolean {
  const m = (merchant || '').trim();
  const c = (categoryName || '').trim().toLowerCase();

  if (/^(?:transfer\s*internal|koreksi\s*saldo):/i.test(m)) return true;
  if (/^transfer\s+(?:ke|to)\s+(?:gopay|dana|ovo|shopeepay|linkaja|jago|bca|mandiri|bri|bni|seabank)/i.test(m)) return true;
  if (c === 'transfer keluarga' || c === 'transfer internal' || c.includes('transfer internal')) return true;

  return false;
}

/**
 * Mencocokkan nama atau kata kunci kategori ke 8 kategori anggaran keluarga
 */
export function matchTargetCategory(categoryNameOrId: string): TargetCategory {
  const lower = (categoryNameOrId || '').toLowerCase().trim();
  if (!lower) {
    return TARGET_BUDGET_CATEGORIES[7]; // Lainnya (default untuk input kosong, jangan cocokkan loop includes(""))
  }

  // 1. Pencocokan ID atau nama persis
  for (const tc of TARGET_BUDGET_CATEGORIES) {
    if (tc.id === lower || tc.name.toLowerCase() === lower) {
      return tc;
    }
  }

  // 2. Pemetaan eksplisit untuk kategori default sistem/database Supabase
  if (lower === 'transfer keluarga' || lower === 'transfer internal') {
    return TARGET_BUDGET_CATEGORIES[7]; // Di tingkat kalkulasi dibebaskan oleh isInternalTransferCategoryOrMerchant
  }
  if (lower === 'belanja online' || lower === 'anak' || lower === 'pendidikan/anak') {
    return TARGET_BUDGET_CATEGORIES[4]; // Kebutuhan Rumah
  }
  if (lower === 'kesehatan') {
    return TARGET_BUDGET_CATEGORIES[6]; // Keperluan Mendadak
  }

  // 3. Pencocokan substring kategori spesifik (0 s/d 6, lewati 'Lainnya' terlebih dahulu agar tidak mendominasi)
  for (let i = 0; i < 7; i++) {
    const tc = TARGET_BUDGET_CATEGORIES[i];
    const tcLower = tc.name.toLowerCase();
    if (lower.includes(tcLower) || (lower.length >= 3 && tcLower.includes(lower))) {
      return tc;
    }
  }

  // 4. Pencocokan kata kunci kontekstual spesifik
  if (/\b(?:dapur|sembako|sayur|pasar|bumbu|beras|minyak|daging|ayam|telur)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[0];
  if (/\b(?:makan|jajan|resto|kopi|kafe|cafe|warung|mie|bakso|snack|gofood|grabfood|shopeefood)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[1];
  if (/\b(?:bensin|bbm|pertamax|pertalite|spbu|transpor|ojek|gojek|grab|maxim|parkir|toll|tol|kereta|krl|mrt|bus)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[2];
  if (/\b(?:tagih|listrik|pln|wifi|indihome|pulsa|paket\s*data|air|pdam|bpjs|iuran)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[3];
  if (/\b(?:rumah|perabot|online|tokopedia|shopee|lazada|elektronik|alat|anak|popok|susu)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[4];
  if (/\b(?:liburan|jalan|hiburan|wisata|nonton|bioskop|hotel|tiket)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[5];
  if (/\b(?:darurat|sakit|obat|dokter|klinik|apotek|kesehatan|rs|rumah\s*sakit)\b/i.test(lower)) return TARGET_BUDGET_CATEGORIES[6];

  // 5. Cek apakah pengguna secara eksplisit menyebut kata 'lainnya'
  if (lower.includes('lainnya') || lower.includes('lain-lain') || lower.includes('fleksibel')) {
    return TARGET_BUDGET_CATEGORIES[7];
  }

  return TARGET_BUDGET_CATEGORIES[7]; // Lainnya
}

/**
 * Evaluasi apakah transaksi pengeluaran baru memicu batas anggaran kategori (80% atau 100%)
 */
export async function evaluateBudgetAlert(
  supabase: SupabaseClient,
  householdId: string,
  categoryIdentifier: string,
  txDateIso: string,
  monthStartDay: number = 1
): Promise<BudgetAlert | null> {
  const targetCategory = matchTargetCategory(categoryIdentifier);
  const txDate = new Date(txDateIso);
  const dateRange = getMonthlyRange(0, monthStartDay);
  const periodMonth = getBudgetPeriodKey(txDate, monthStartDay);

  // 1. Ambil batas anggaran kategori bulan ini dari tabel category_budgets
  const { data: budgetData } = await supabase
    .from('category_budgets')
    .select('limit_amount')
    .eq('household_id', householdId)
    .eq('category_id', targetCategory.id)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const limitAmount = Number(budgetData?.limit_amount || 0);
  if (limitAmount <= 0) {
    // Pengguna belum menyetel batas anggaran untuk kategori ini
    return null;
  }

  // Ambil daftar kategori riil untuk pemetaan id -> nama yang tahan banting terhadap bentuk relasi array
  let allCategories: Array<{ id: string; name: string }> | null = null;
  try {
    const catQuery: any = supabase.from('categories');
    if (catQuery && typeof catQuery.select === 'function') {
      const res = await catQuery.select('id, name').eq('household_id', householdId);
      allCategories = res?.data || null;
    }
  } catch {
    // Abaikan jika mock test tidak menyediakan tabel categories
  }

  const categoryMap = new Map<string, string>();
  (allCategories || []).forEach((c) => {
    if (c.id && c.name) categoryMap.set(c.id, c.name);
  });

  // 2. Hitung total pengeluaran kategori bulan ini (hanya belanja riil)
  const startOfPeriod = dateRange.startDate.toISOString();
  const endOfPeriod = dateRange.endDate.toISOString();

  let query = supabase
    .from('transactions')
    .select('amount, merchant, category_id, categories (name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .neq('status', 'ignored');

  // Filter query database jika metode not() didukung client
  const qAny = query as any;
  if (typeof qAny.not === 'function') {
    query = qAny
      .not('merchant', 'ilike', 'Koreksi Saldo:%')
      .not('merchant', 'ilike', 'Transfer Internal:%');
  }

  const { data: txList } = await query
    .gte('transaction_date', startOfPeriod)
    .lte('transaction_date', endOfPeriod);

  let totalSpent = 0;
  if (txList) {
    interface TxRow {
      amount: number;
      merchant?: string;
      category_id: string | null;
      categories: { name: string } | Array<{ name: string }> | null;
    }
    (txList as unknown as TxRow[]).forEach((tx) => {
      const rawCat = tx.categories;
      const relCatName = Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name;
      const catName = relCatName || (tx.category_id ? categoryMap.get(tx.category_id) : '') || '';

      if (isInternalTransferCategoryOrMerchant(catName, tx.merchant)) return;

      const matched = matchTargetCategory(catName);
      if (matched.id === targetCategory.id) {
        totalSpent += Number(tx.amount || 0);
      }
    });
  }

  // 3. Evaluasi ambang batas
  const percentage = Math.round((totalSpent / limitAmount) * 100);
  let level: '80' | '100' | null = null;
  if (percentage >= 100) {
    level = '100';
  } else if (percentage >= 80) {
    level = '80';
  }

  if (!level) {
    return null;
  }

  // 4. Periksa Log Anti-Spam agar tidak mengirim notifikasi berulang di level yang sama
  const alertType = level === '100' ? 'budget_exceeded' : 'budget_warning';
  const { data: existingLog } = await supabase
    .from('notification_alert_logs')
    .select('id')
    .eq('household_id', householdId)
    .eq('alert_type', alertType)
    .eq('category_id', targetCategory.id)
    .eq('period_month', periodMonth)
    .eq('level', level)
    .maybeSingle();

  if (existingLog) {
    return null;
  }

  // 5. Susun Pesan Peringatan (Full Text dengan Penanda Status)
  const remaining = Math.max(0, limitAmount - totalSpent);
  const overspent = Math.max(0, totalSpent - limitAmount);
  const title = level === '100'
    ? `[DARURAT] Anggaran ${targetCategory.name} Melebihi Batas`
    : `[PERINGATAN] Anggaran ${targetCategory.name} Menipis`;

  const message = level === '100'
    ? `Total belanja ${formatRupiah(totalSpent)} telah melebihi batas ${formatRupiah(limitAmount)} sebesar ${formatRupiah(overspent)}.`
    : `Pengeluaran sudah mencapai ${percentage}% (${formatRupiah(totalSpent)} dari ${formatRupiah(limitAmount)}). Sisa ${formatRupiah(remaining)}.`;

  // 6. Catat log pemicu untuk meredam duplikasi alert berikutnya
  try {
    await supabase.from('notification_alert_logs').insert({
      household_id: householdId,
      alert_type: alertType,
      category_id: targetCategory.id,
      period_month: periodMonth,
      level,
      message,
    });
  } catch (logErr) {
    console.warn('Gagal mencatat notification_alert_logs:', logErr);
  }

  return {
    categoryId: targetCategory.id,
    categoryName: targetCategory.name,
    level,
    limitAmount,
    totalSpent,
    percentage,
    remainingAmount: remaining,
    title,
    message,
  };
}
