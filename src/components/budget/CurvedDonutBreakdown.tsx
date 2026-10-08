'use client';

// ==============================================================================
// COMPONENT: src/components/budget/CurvedDonutBreakdown.tsx
// Donut Chart Kapsul Melengkung (Curved Pill Segments) mengadopsi Foto 3
// ==============================================================================

import { useState } from 'react';
import { formatRupiah } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

export interface BudgetSegment {
  id: string;
  name: string;
  amount: number;
  color: string;
  icon?: string;
}

interface CurvedDonutBreakdownProps {
  totalBudget?: number;
  segments?: BudgetSegment[];
  onViewAnalytics?: () => void;
}

const defaultSegments: BudgetSegment[] = [
  { id: '1', name: 'Belanja Dapur', amount: 3320000, color: '#581c87', icon: '🛒' }, // Deep Purple
  { id: '2', name: 'Kesehatan & Obat', amount: 2300000, color: '#7e22ce', icon: '💊' }, // Purple
  { id: '3', name: 'Investasi & Tabungan', amount: 2000000, color: '#a855f7', icon: '📈' }, // Light Violet
  { id: '4', name: 'Pajak & Tagihan', amount: 1600000, color: '#c084fc', icon: '⚡' }, // Soft Lavender
  { id: '5', name: 'Sedekah & Donasi', amount: 1400000, color: '#e9d5ff', icon: '🤲' }, // Light Mauve
];

export default function CurvedDonutBreakdown({
  totalBudget = 10000000,
  segments = defaultSegments,
  onViewAnalytics,
}: CurvedDonutBreakdownProps) {
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const sumAllocated = segments.reduce((acc, s) => acc + s.amount, 0);
  const effectiveTotal = totalBudget > 0 ? totalBudget : (sumAllocated || 1);

  // Parameter geometri SVG Arc
  const size = 260;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Gap antar segmen melengkung dalam satuan panjang keliling (circumference)
  const gapLength = 12; // Gap yang nyaman antar kapsul
  const numSegments = segments.length;
  const totalGapLength = numSegments * gapLength;
  const availableCircumference = Math.max(0, circumference - totalGapLength);

  let accumulatedLength = 0;

  return (
    <div className="bg-[var(--bg-card)] rounded-3xl p-6 border border-[var(--border-color)] shadow-xs relative overflow-hidden">
      {/* Header dengan link View Analytics */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-main)] flex items-center gap-1.5">
            <span>Alokasi Budgeting</span>
            <span className="w-2 h-2 rounded-full bg-[#198754] animate-pulse" />
          </h2>
          <p className="text-[11px] font-medium text-[#007a33]">
            Pembagian alokasi per pos anggaran
          </p>
        </div>

        {onViewAnalytics && (
          <button
            onClick={onViewAnalytics}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#007a33] hover:text-[#004d00] transition-colors"
          >
            <span>Analitik</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Grid: Donut di Kiri / Atas, Legend di Kanan / Bawah */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
        {/* SVG Curved Pill Segment Donut */}
        <div className="sm:col-span-6 flex justify-center">
          <div className="relative w-56 h-56 flex items-center justify-center">
            <svg
              className="w-full h-full -rotate-90 transform"
              viewBox={`0 0 ${size} ${size}`}
            >
              {/* Background circular track tipis */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth - 8}
                className="text-[var(--bg-main)]"
              />

              {/* Segmen-segmen kapsul melengkung dengan gap */}
              {segments.map((seg) => {
                const fraction = seg.amount / effectiveTotal;
                const segLength = Math.max(4, fraction * availableCircumference);
                const dashArray = `${segLength} ${circumference - segLength}`;
                const dashOffset = -(accumulatedLength);

                // Tambahkan akumulasi untuk segmen berikutnya
                accumulatedLength += segLength + gapLength;

                const isHovered = activeSegmentId === seg.id;

                return (
                  <circle
                    key={seg.id}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    className="transition-all duration-300 cursor-pointer"
                    onMouseEnter={() => setActiveSegmentId(seg.id)}
                    onMouseLeave={() => setActiveSegmentId(null)}
                  />
                );
              })}
            </svg>

            {/* Label Tengah Donut */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
              <span className="text-[11px] font-bold text-[#007a33]">
                Budget Bulanan
              </span>
              <span className="text-xl font-extrabold text-[var(--text-main)] tracking-tight mt-0.5 angka-keuangan">
                {formatRupiah(totalBudget)}
              </span>
              <span className="text-[10px] font-bold text-[#007a33] mt-0.5">
                {segments.length} Pos Alokasi
              </span>
            </div>
          </div>
        </div>

        {/* Legend List dengan Titik Warna & Nilai Rupiah */}
        <div className="sm:col-span-6 space-y-2">
          {segments.map((seg) => {
            const isHovered = activeSegmentId === seg.id;
            const percentage = Math.round((seg.amount / effectiveTotal) * 100);

            return (
              <div
                key={seg.id}
                onMouseEnter={() => setActiveSegmentId(seg.id)}
                onMouseLeave={() => setActiveSegmentId(null)}
                className={`p-2.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer border ${
                  isHovered
                    ? 'bg-[var(--bg-main)] border-[var(--border-color)] shadow-xs scale-[1.01]'
                    : 'bg-[var(--bg-main)]/60 border-[var(--border-color)]/70 hover:bg-[var(--bg-main)]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-3.5 h-3.5 rounded-full shadow-xs shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--text-main)]">
                      {seg.name}
                    </span>
                    <span className="text-[10px] text-[#007a33] ml-1.5 font-medium">
                      ({percentage}%)
                    </span>
                  </div>
                </div>

                <span className="text-xs font-extrabold text-[var(--text-main)] angka-keuangan">
                  {formatRupiah(seg.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
