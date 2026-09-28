'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/DailyTrendChart.tsx
// Grafik Tren Harian Pengeluaran vs Pemasukan dalam Periode (Recharts AreaChart)
// ==============================================================================

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { formatRupiah } from '@/lib/utils';
import { TrendingUp } from 'lucide-react';

export interface DailyTrendItem {
  period_date: string; // 'YYYY-MM-DD'
  expense_amount: number;
  income_amount: number;
}

interface DailyTrendChartProps {
  data: DailyTrendItem[];
}

function CustomDailyTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const expense = payload.find((p: any) => p.dataKey === 'expense_amount')?.value || 0;
    const income = payload.find((p: any) => p.dataKey === 'income_amount')?.value || 0;

    return (
      <div className="p-3 rounded-2xl liquid-glass border border-white/90 dark:border-white/10 shadow-xl text-xs min-w-[150px]">
        <p className="font-extrabold text-slate-900 dark:text-white mb-1.5 border-b border-slate-200/60 pb-1">
          {label}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 font-bold">
            <span>Keluar:</span>
            <span>{formatRupiah(expense)}</span>
          </div>
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
            <span>Masuk:</span>
            <span>{formatRupiah(income)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

export default function DailyTrendChart({ data }: DailyTrendChartProps) {
  const formattedData = useMemo(() => {
    return data.map((item) => {
      // Ambil tanggal pendek (misal: '28 Sep')
      const parts = item.period_date.split('-');
      const day = parts[2] || '';
      return {
        ...item,
        shortDate: `${day}`,
      };
    });
  }, [data]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="rounded-3xl p-5 mb-3.5 liquid-glass transition-all border border-white/80 dark:border-white/10 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Tren Arus Kas Harian
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Pergerakan harian pengeluaran dan pemasukan
          </span>
        </div>
      </div>

      {/* Recharts AreaChart */}
      <div className="h-48 w-full -ml-3 my-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="shortDate"
              tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v / 1000}k`}
              width={35}
            />
            <Tooltip content={<CustomDailyTooltip />} />

            <Area
              type="monotone"
              dataKey="income_amount"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#incomeGradient)"
            />
            <Area
              type="monotone"
              dataKey="expense_amount"
              stroke="#f43f5e"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#expenseGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend Chart */}
      <div className="flex items-center justify-center gap-5 pt-3 border-t border-slate-200/80 dark:border-white/10 text-xs font-bold">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500/30" />
          <span className="text-slate-700 dark:text-slate-300">Pengeluaran</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30" />
          <span className="text-slate-700 dark:text-slate-300">Pemasukan</span>
        </div>
      </div>
    </div>
  );
}
