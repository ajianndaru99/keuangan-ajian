'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RealtimeToast.tsx
// Pop-up Notifikasi Realtime: Full-Text Sederhana dengan Penanda Jelas
// Muncul saat notifikasi mutasi bank baru terekam oleh sistem
// ==============================================================================

import { useEffect, useState } from 'react';
import { formatRupiah } from '@/lib/utils';

export interface ToastTransactionData {
  id?: string;
  merchant: string;
  amount: number;
  direction: 'out' | 'in';
  sourceDevice?: 'suami' | 'istri';
  accountName?: string;
  rawNotification?: string;
}

interface RealtimeToastProps {
  data: ToastTransactionData | null;
  onClose: () => void;
  onViewDetail?: (data: ToastTransactionData) => void;
  duration?: number; // default 7000ms
}

export default function RealtimeToast({
  data,
  onClose,
  onViewDetail,
  duration = 7000,
}: RealtimeToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!data) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [data, duration, onClose]);

  if (!data && !isVisible) return null;

  const isIncome = data?.direction === 'in';
  const ownerLabel = data?.sourceDevice === 'suami' ? 'Suami' : 'Istri';
  const statusMarker = isIncome ? '[PEMASUKAN BARU]' : '[PENGELUARAN BARU]';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-50 transition-all duration-300 ease-out transform pointer-events-auto
        bottom-4 inset-x-4 max-w-sm mx-auto
        sm:bottom-6 sm:right-6 sm:inset-auto sm:max-w-md sm:mx-0
        ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
        }
      `}
    >
      <div className="bg-[var(--surface-4)] rounded-2xl border border-[var(--border-color)] p-4 shadow-xl">
        <div className="flex flex-col gap-1.5">
          {/* Baris Penanda & Informasi Sumber */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`text-[11px] font-bold tracking-tight ${
                  isIncome ? 'text-income' : 'text-expense'
                }`}
              >
                {statusMarker}
              </span>
              {data?.accountName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-color)]">
                  {data.accountName}
                </span>
              )}
              {data?.sourceDevice && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border-color)]">
                  {ownerLabel}
                </span>
              )}
            </div>

            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] px-1.5 py-0.5 rounded transition-colors cursor-pointer"
              title="Tutup notifikasi"
            >
              Tutup
            </button>
          </div>

          {/* Merchant & Nominal */}
          <div className="flex items-baseline justify-between gap-3 pt-0.5">
            <h4 className="text-sm font-bold text-[var(--text-main)] truncate">
              {data?.merchant || 'Transaksi Digital'}
            </h4>
            <span
              className={`text-sm font-bold tracking-tight whitespace-nowrap angka-keuangan ${
                isIncome ? 'text-income' : 'text-expense'
              }`}
            >
              {isIncome ? '+' : '-'}{formatRupiah(data?.amount || 0)}
            </span>
          </div>

          {/* Tombol Aksi Teks */}
          {onViewDetail && (
            <div className="mt-1.5 pt-2 border-t border-[var(--border-color)]/70 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>Tercatat otomatis ke daftar transaksi</span>
              <button
                type="button"
                onClick={() => {
                  setIsVisible(false);
                  if (data) onViewDetail(data);
                }}
                className="font-bold text-[var(--accent-color)] hover:underline transition-colors cursor-pointer"
              >
                Lihat Detail
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
