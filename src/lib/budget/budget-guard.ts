// ==============================================================================
// BUDGET GUARD: src/lib/budget/budget-guard.ts
// Modul evaluasi ambang batas anggaran & pembentukan payload peringatan
// Dilengkapi peredam duplikasi (anti-spam) per level ambang batas per bulan
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRupiah } from '../utils.ts';

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
 * Mencocokkan nama atau kata kunci kategori ke 8 kategori anggaran keluarga
 */
export function matchTargetCategory(categoryNameOrId: string): TargetCategory {
  const lower = (categoryNameOrId || '').toLowerCase().trim();
  for (const tc of TARGET_BUDGET_CATEGORIES) {
    if (tc.id === lower || tc.name.toLowerCase() === lower) {
      return tc;
    }
    if (lower.includes(tc.name.toLowerCase()) || tc.name.toLowerCase().includes(lower)) {
      return tc;
    }
  }

  // Pencocokan kata kunci kontekstual
  if (lower.includes('dapur') || lower.includes('sembako') || lower.includes('sayur')) return TARGET_BUDGET_CATEGORIES[0];
  if (lower.includes('makan') || lower.includes('jajan') || lower.includes('resto') || lower.includes('kopi')) return TARGET_BUDGET_CATEGORIES[1];
  if (lower.includes('bensin') || lower.includes('transpor') || lower.includes('ojek') || lower.includes('parkir')) return TARGET_BUDGET_CATEGORIES[2];
  if (lower.includes('tagih') || lower.includes('listrik') || lower.includes('pln') || lower.includes('wifi') || lower.includes('pulsa')) return TARGET_BUDGET_CATEGORIES[3];
  if (lower.includes('rumah') || lower.includes('perabot')) return TARGET_BUDGET_CATEGORIES[4];
  if (lower.includes('liburan') || lower.includes('jalan') || lower.includes('hiburan')) return TARGET_BUDGET_CATEGORIES[5];
  if (lower.includes('darurat') || lower.includes('sakit') || lower.includes('obat') || lower.includes('dokter')) return TARGET_BUDGET_CATEGORIES[6];

  return TARGET_BUDGET_CATEGORIES[7]; // Lainnya
}

/**
 * Evaluasi apakah transaksi pengeluaran baru memicu batas anggaran kategori (80% atau 100%)
 */
export async function evaluateBudgetAlert(
  supabase: SupabaseClient,
  householdId: string,
  categoryIdentifier: string,
  txDateIso: string
): Promise<BudgetAlert | null> {
  const targetCategory = matchTargetCategory(categoryIdentifier);
  const txDate = new Date(txDateIso);
  const year = txDate.getFullYear();
  const month = String(txDate.getMonth() + 1).padStart(2, '0');
  const periodMonth = `${year}-${month}`;

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

  // 2. Hitung total pengeluaran kategori bulan ini
  const startOfMonth = new Date(year, txDate.getMonth(), 1).toISOString();
  const endOfMonth = new Date(year, txDate.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

  const { data: txList } = await supabase
    .from('transactions')
    .select('amount, category_id, categories (name)')
    .eq('household_id', householdId)
    .eq('direction', 'out')
    .neq('status', 'ignored')
    .gte('transaction_date', startOfMonth)
    .lte('transaction_date', endOfMonth);

  let totalSpent = 0;
  if (txList) {
    interface TxRow {
      amount: number;
      category_id: string | null;
      categories: { name: string } | null;
    }
    (txList as unknown as TxRow[]).forEach((tx) => {
      const catName = tx.categories?.name || tx.category_id || '';
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

  // 5. Susun Pesan Peringatan
  const remaining = Math.max(0, limitAmount - totalSpent);
  const overspent = Math.max(0, totalSpent - limitAmount);
  const title = level === '100'
    ? `🚨 Anggaran ${targetCategory.name} Melebihi Batas`
    : `⚠️ Anggaran ${targetCategory.name} Menipis`;

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
