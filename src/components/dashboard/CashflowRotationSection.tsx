'use client';

// ==============================================================================
// COMPONENT: src/components/dashboard/CashflowRotationSection.tsx
// Penjabaran Visual Grafik & Perputaran Keuangan Keluarga (Read-Only Monitor)
// ==============================================================================

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';
import {
  TARGET_BUDGET_CATEGORIES,
  isInternalTransferCategoryOrMerchant,
  matchTargetCategory,
} from '@/lib/budget/budget-guard';
import type { TransactionItem } from '@/types/transaction';

interface CashflowRotationSectionProps {
  transactions: TransactionItem[];
  totalBalance: number;
  periodLabel: string;
}

export default function CashflowRotationSection({
  transactions,
  totalBalance,
  periodLabel,
}: CashflowRotationSectionProps) {
  const analytics = useMemo(() => {
    const reconciled = transactions.filter((t) => t.status === 'reconciled');

    let totalIncome = 0;
    let totalExpense = 0;
    let totalInternalTransfer = 0;

    const dailyMap = new Map<string, { label: string; sortKey: string; masuk: number; keluar: number }>();
    const categoryTotals = new Map<string, number>();

    TARGET_BUDGET_CATEGORIES.forEach((c) => categoryTotals.set(c.name, 0));

    for (const tx of reconciled) {
      const amt = Number(tx.amount || 0);
      const catName = tx.categories?.name || '';
      const isInternal = isInternalTransferCategoryOrMerchant(catName, tx.merchant);

      if (isInternal) {
        if (tx.direction === 'out' && /^transfer\s*internal/i.test(tx.merchant || '')) {
          totalInternalTransfer += amt;
        }
        continue;
      }

      const d = new Date(tx.transaction_date);
      const sortKey = !Number.isNaN(d.getTime())
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        : '0000-00-00';
      const label = !Number.isNaN(d.getTime())
        ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
        : '-';

      const dayBucket = dailyMap.get(sortKey) || { label, sortKey, masuk: 0, keluar: 0 };

      if (tx.direction === 'in') {
        totalIncome += amt;
        dayBucket.masuk += amt;
      } else {
        totalExpense += amt;
        dayBucket.keluar += amt;
        const matched = matchTargetCategory(catName || tx.merchant || '');
        categoryTotals.set(matched.name, (categoryTotals.get(matched.name) || 0) + amt);
      }

      dailyMap.set(sortKey, dayBucket);
    }

    const dailySeries = Array.from(dailyMap.values())
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(-14);

    const categorySeries = TARGET_BUDGET_CATEGORIES.map((c) => ({
      name: c.name.replace('Transportasi/Bensin', 'Transport').replace('Keperluan Mendadak', 'Darurat'),
      fullName: c.name,
      total: categoryTotals.get(c.name) || 0,
    })).filter((c) => c.total > 0);

    const netCashflow = totalIncome - totalExpense;
    const retentionPct = totalIncome > 0 ? Math.round((netCashflow / totalIncome) * 100) : 0;

    return {
      totalIncome,
      totalExpense,
      totalInternalTransfer,
      netCashflow,
      retentionPct,
      dailySeries,
      categorySeries,
    };
  }, [transactions]);

  return (
    <section className="space-y-4">
      {/* Header & Ringkasan Perputaran Kas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-heading font-bold text-[var(--text-main)]">
            Perputaran Keuangan Keluarga
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Aliran kas masuk, belanja riil &amp; mutasi antar kantong ({periodLabel})
          </p>
        </div>
        <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border-color)] text-[var(--text-muted)] self-start sm:self-auto">
          Saldo Kas Aktif: <strong className="text-[var(--text-main)] angka-keuangan">{formatRupiah(totalBalance)}</strong>
        </span>
      </div>

      {/* 4 Kartu Alur Perputaran Kas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Arus Masuk</span>
            <ArrowDownLeft className="w-4 h-4 text-[var(--color-income)]" />
          </div>
          <p className="text-sm sm:text-base font-bold text-[var(--color-income)] angka-keuangan">
            {formatRupiah(analytics.totalIncome)}
          </p>
        </div>

        <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Belanja Keluar</span>
            <ArrowUpRight className="w-4 h-4 text-[var(--color-expense)]" />
          </div>
          <p className="text-sm sm:text-base font-bold text-[var(--color-expense)] angka-keuangan">
            {formatRupiah(analytics.totalExpense)}
          </p>
        </div>

        <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Selisih Bersih</span>
            <TrendingUp className="w-4 h-4 text-[var(--accent-color)]" />
          </div>
          <p
            className={`text-sm sm:text-base font-bold angka-keuangan ${
              analytics.netCashflow >= 0 ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]'
            }`}
          >
            {analytics.netCashflow >= 0 ? '+' : ''}
            {formatRupiah(analytics.netCashflow)}
          </p>
          {analytics.totalIncome > 0 && (
            <span className="text-[10px] text-[var(--text-muted)]">
              Rasio simpan: {analytics.retentionPct}%
            </span>
          )}
        </div>

        <div className="rounded-2xl p-4 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>Pindah Kantong</span>
            <ArrowLeftRight className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm sm:text-base font-bold text-[var(--text-main)] angka-keuangan">
            {formatRupiah(analytics.totalInternalTransfer)}
          </p>
          <span className="text-[10px] text-[var(--text-muted)]">Bebas potongan pagu</span>
        </div>
      </div>

      {/* 2 Grafik Visual: Arus Harian & Distribusi 9 Kategori */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-3xl p-4 sm:p-5 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <h3 className="text-xs sm:text-sm font-bold text-[var(--text-main)] mb-3">
            Grafik Perputaran Harian (14 Hari Terakhir)
          </h3>
          {analytics.dailySeries.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-[var(--text-muted)]">
              Belum ada mutasi reconciled pada periode ini.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.dailySeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis
                    tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`)}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <Tooltip
                    formatter={(value) => formatRupiah(Number(value || 0))}
                    contentStyle={{
                      backgroundColor: 'var(--surface-2)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="masuk" name="Pemasukan" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="keluar" name="Pengeluaran" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-3xl p-4 sm:p-5 bg-[var(--surface-1)] border border-[var(--border-color)]">
          <h3 className="text-xs sm:text-sm font-bold text-[var(--text-main)] mb-3">
            Distribusi 9 Kategori Pengeluaran
          </h3>
          {analytics.categorySeries.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-[var(--text-muted)]">
              Belum ada pengeluaran terkategori pada periode ini.
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.categorySeries}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`)}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 10, fill: 'var(--text-main)' }}
                  />
                  <Tooltip
                    formatter={(value) => formatRupiah(Number(value || 0))}
                    contentStyle={{
                      backgroundColor: 'var(--surface-2)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="total" name="Terpakai" fill="var(--accent-color)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
