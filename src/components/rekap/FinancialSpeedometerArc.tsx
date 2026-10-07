'use client';

// ==============================================================================
// COMPONENT: src/components/rekap/FinancialSpeedometerArc.tsx
// Speedometer Radial Arc Gauge mengadopsi referensi Foto 2 (Financial Report)
// ==============================================================================

import { useState } from 'react';
import { formatRupiah } from '@/lib/utils';
import { Download } from 'lucide-react';

interface FinancialSpeedometerArcProps {
  monthlyLimit?: number;
  currentSpending?: number;
  totalNetWorth?: number;
  selectedPeriod?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  onPeriodChange?: (period: 'weekly' | 'monthly' | 'quarterly' | 'yearly') => void;
  onExportReport?: () => void;
}

export default function FinancialSpeedometerArc({
  monthlyLimit = 5000000,
  currentSpending = 3420000,
  totalNetWorth = 18500000,
  selectedPeriod = 'monthly',
  onPeriodChange,
  onExportReport,
}: FinancialSpeedometerArcProps) {
  const [viewMode, setViewMode] = useState<'spending' | 'net_worth'>('spending');

  // Rasio pengeluaran terhadap limit (0 sampai 1)
  const ratio = monthlyLimit > 0 ? Math.min(1.0, currentSpending / monthlyLimit) : 0;
  const percentage = Math.round(ratio * 100);

  // Parameter Speedometer Arc
  const totalTicks = 38;
  const activeTicksCount = Math.round(ratio * totalTicks);
  const startAngle = 180; // Sisi kiri (jam 9)
  const endAngle = 360;   // Sisi kanan (jam 3)
  const angleRange = endAngle - startAngle;

  const radiusOuter = 110;
  const radiusInner = 88;
  const centerX = 140;
  const centerY = 135;

  // Generate tick lines
  const ticks = Array.from({ length: totalTicks }).map((_, index) => {
    const fraction = index / (totalTicks - 1);
    const angleDeg = startAngle + fraction * angleRange;
    const angleRad = (angleDeg * Math.PI) / 180;

    const x1 = centerX + radiusInner * Math.cos(angleRad);
    const y1 = centerY + radiusInner * Math.sin(angleRad);
    const x2 = centerX + radiusOuter * Math.cos(angleRad);
    const y2 = centerY + radiusOuter * Math.sin(angleRad);

    const isActive = index <= activeTicksCount;

    return {
      index,
      x1,
      y1,
      x2,
      y2,
      isActive,
      angleDeg,
    };
  });

  // Hitung posisi Jarum / Needle Bubble (Foto 2)
  const needleAngleDeg = startAngle + ratio * angleRange;
  const needleAngleRad = (needleAngleDeg * Math.PI) / 180;
  const needleIndicatorRadius = radiusOuter + 14;
  const needleX = centerX + needleIndicatorRadius * Math.cos(needleAngleRad);
  const needleY = centerY + needleIndicatorRadius * Math.sin(needleAngleRad);

  return (
    <div className="rounded-3xl p-6 liquid-glass border border-white/90 dark:border-white/10 shadow-sm relative overflow-hidden flex flex-col items-center">
      {/* Background Soft Glow */}
      <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-sky-400/10 via-indigo-400/5 to-transparent pointer-events-none" />

      {/* Header Bar dengan Download Action */}
      <div className="w-full flex items-center justify-between mb-2 z-10">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white">
            Laporan Finansial
          </h2>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Monitoring meter pengeluaran keluarga
          </p>
        </div>

        {onExportReport && (
          <button
            onClick={onExportReport}
            title="Download Laporan"
            className="p-2 rounded-2xl bg-white/70 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-sky-600 border border-slate-200/80 dark:border-white/10 shadow-xs transition-all flex items-center gap-1.5 text-xs font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ekspor</span>
          </button>
        )}
      </div>

      {/* Radial Tick Arc Speedometer (Foto 2) */}
      <div className="relative w-72 h-44 flex items-center justify-center -mb-2 mt-2">
        <svg className="w-full h-full" viewBox="0 0 280 160">
          <defs>
            <linearGradient id="activeTickGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>

          {/* Gambar seluruh garis radial ticks */}
          {ticks.map((t) => (
            <line
              key={t.index}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isActive ? 'url(#activeTickGradient)' : 'currentColor'}
              strokeWidth={t.isActive ? 3.5 : 2.5}
              strokeLinecap="round"
              className={
                t.isActive
                  ? 'transition-all duration-500 drop-shadow-sm'
                  : 'text-slate-200 dark:text-slate-800'
              }
            />
          ))}

          {/* Needle Line dari Pusat */}
          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke="#1e293b"
            strokeWidth="2.5"
            strokeDasharray="3 3"
            className="dark:stroke-slate-300"
          />

          {/* Titik Poros Pusat */}
          <circle cx={centerX} cy={centerY} r="5" fill="#6366f1" />
        </svg>

        {/* Floating Needle Pill Indicator (Foto 2) */}
        <div
          className="absolute z-20 transition-all duration-700 pointer-events-none"
          style={{
            left: `${(needleX / 280) * 100}%`,
            top: `${(needleY / 160) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="px-2.5 py-1 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-black shadow-lg flex items-center gap-1 border border-white/20 whitespace-nowrap">
            <span>{formatRupiah(currentSpending)}</span>
          </div>
        </div>

        {/* Nilai Limit di Tengah Busur (Foto 2) */}
        <div className="absolute bottom-3 inset-x-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {viewMode === 'spending' ? 'Batas Limit Bulanan' : 'Estimasi Saldo / Net Worth'}
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none mt-1">
            {viewMode === 'spending' ? formatRupiah(monthlyLimit) : formatRupiah(totalNetWorth)}
          </span>
          <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mt-1">
            {percentage}% terpakai
          </span>
        </div>
      </div>

      {/* Switcher Toggle: [Net Worth] vs [Spending] (Foto 2) */}
      <div className="mt-3 p-1 rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-white/10 flex items-center gap-1 shadow-inner">
        <button
          onClick={() => setViewMode('net_worth')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
            viewMode === 'net_worth'
              ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Kekayaan Bersih
        </button>
        <button
          onClick={() => setViewMode('spending')}
          className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
            viewMode === 'spending'
              ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Pengeluaran
        </button>
      </div>

      {/* Period Filter Pills: [Weekly] [Monthly] [Quarterly] [Yearly] (Foto 2) */}
      <div className="mt-4 w-full flex items-center justify-center gap-1.5 pt-3 border-t border-slate-100 dark:border-white/5">
        {(['weekly', 'monthly', 'quarterly', 'yearly'] as const).map((period) => {
          const isActive = selectedPeriod === period;
          const labels: Record<string, string> = {
            weekly: 'Mingguan',
            monthly: 'Bulanan',
            quarterly: 'Kuartal',
            yearly: 'Tahunan',
          };

          return (
            <button
              key={period}
              onClick={() => onPeriodChange?.(period)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                isActive
                  ? 'bg-sky-500 text-white shadow-xs shadow-sky-500/25'
                  : 'bg-white/60 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200/60 dark:border-white/5'
              }`}
            >
              {labels[period]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
