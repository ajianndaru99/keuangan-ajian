'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/CategoryExpensesChart.tsx
// Grafik Batang Pengeluaran per Kategori (Recharts) & Daftar Top 5 Terboros
// ==============================================================================

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import {
  ShoppingCart,
  Utensils,
  Fuel,
  Zap,
  Baby,
  HeartPulse,
  Film,
  ShoppingBag,
  Send,
  MoreHorizontal,
  Wallet,
  Tag,
  Flame,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

export interface CategoryExpenseItem {
  category_id: string;
  category_name: string;
  category_icon: string;
  total_amount: number;
  percentage: number;
}

interface CategoryExpensesChartProps {
  categories: CategoryExpenseItem[];
}

const iconMap: Record<string, React.ElementType> = {
  'shopping-cart': ShoppingCart,
  utensils: Utensils,
  fuel: Fuel,
  zap: Zap,
  baby: Baby,
  'heart-pulse': HeartPulse,
  film: Film,
  'shopping-bag': ShoppingBag,
  send: Send,
  'more-horizontal': MoreHorizontal,
  wallet: Wallet,
};

// Palet warna soft pastel elegan untuk bar chart
const PASTEL_BAR_COLORS = [
  '#38bdf8', // Sky
  '#f43f5e', // Rose
  '#a78bfa', // Lavender
  '#34d399', // Mint
  '#fb923c', // Peach
  '#818cf8', // Indigo
  '#facc15', // Amber
  '#2dd4bf', // Teal
];

// Custom Tooltip Liquid Glass
function CustomGlassTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="p-3 rounded-2xl liquid-glass border border-white/90 dark:border-white/10 shadow-xl text-xs">
        <p className="font-extrabold text-slate-900 dark:text-white">
          {data.category_name}
        </p>
        <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
          {formatRupiah(data.total_amount)}
        </p>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mt-0.5">
          Porsi: {data.percentage}% dari total belanja
        </span>
      </div>
    );
  }
  return null;
}

export default function CategoryExpensesChart({ categories }: CategoryExpensesChartProps) {
  // Ambil Top 5 Terboros
  const top5 = useMemo(() => {
    return [...categories]
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 5);
  }, [categories]);

  // Siapkan data chart (maksimal 7 kategori teratas untuk keterbacaan mobile)
  const chartData = useMemo(() => {
    return categories.slice(0, 7).map((item) => ({
      ...item,
      // Singkat nama jika terlalu panjang untuk sumbu X
      displayName: item.category_name.length > 10 ? `${item.category_name.slice(0, 8)}...` : item.category_name,
    }));
  }, [categories]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="bg-[var(--surface-1)] rounded-3xl p-5 mb-3.5 border border-[var(--border-color)] shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">
            Pengeluaran per Kategori
          </h3>
          <span className="text-[11px] font-medium text-[var(--text-muted)]">
            Sebaran belanja transaksi yang sudah diverifikasi
          </span>
        </div>
      </div>

      {/* Recharts BarChart Container */}
      <div className="h-56 w-full -ml-3 my-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
            <XAxis
              dataKey="displayName"
              interval={0}
              tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
              angle={-20}
              textAnchor="end"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v / 1000}k`}
              width={35}
            />
            <Tooltip content={<CustomGlassTooltip />} />
            <Bar dataKey="total_amount" radius={[8, 8, 2, 2]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={PASTEL_BAR_COLORS[index % PASTEL_BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daftar Top 5 Kategori Terboros */}
      <div className="mt-5 pt-4 border-t border-[var(--border-color)]/70">
        <div className="flex items-center gap-1.5 mb-3">
          <Flame className="w-4 h-4 text-expense" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main)]">
            Top 5 Kategori Terboros
          </h4>
        </div>

        <div className="space-y-2.5">
          {top5.map((item, index) => {
            const IconComponent = iconMap[item.category_icon] || Tag;
            return (
              <div
                key={item.category_id}
                className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)]/70"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-[var(--surface-1)] text-[var(--accent-color)] text-[10px] font-bold flex items-center justify-center border border-[var(--border-color)]/70">
                      #{index + 1}
                    </span>
                    <IconComponent className="w-4 h-4 text-[var(--accent-color)]" />
                    <span className="text-xs font-bold text-[var(--text-main)]">
                      {item.category_name}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-extrabold text-[var(--text-main)] angka-keuangan">
                      {formatRupiah(item.total_amount)}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text-muted)] ml-1.5">
                      ({item.percentage}%)
                    </span>
                  </div>
                </div>

                {/* Progress Bar Persentase */}
                <div className="w-full bg-[var(--bg-card)] rounded-full h-2 overflow-hidden border border-[var(--border-color)]/50">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(item.percentage, 100)}%`,
                      backgroundColor: PASTEL_BAR_COLORS[index % PASTEL_BAR_COLORS.length],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
