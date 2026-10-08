'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RealtimeToast.tsx
// Pop-up Notifikasi Realtime: Tampilan Elegan, Bersih, dan Profesional
// Muncul saat notifikasi bank baru terekam oleh sistem
// ==============================================================================

import { useEffect, useState } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, ArrowRight, Bell } from 'lucide-react';
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xl shadow-slate-900/10 dark:shadow-black/40">
        <div className="flex items-start gap-3">
          {/* Icon Indikator Arah */}
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isIncome
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {isIncome ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            )}
          </div>

          {/* Konten Keterangan Transaksi */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Bell className="w-3 h-3 text-slate-400" />
                  Transaksi Baru
                </span>
                {data?.accountName && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    {data.accountName}
                  </span>
                )}
                {data?.sourceDevice && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    {ownerLabel}
                  </span>
                )}
              </div>

              <button
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(onClose, 300);
                }}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 rounded transition-colors"
                title="Tutup notifikasi"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-1 flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {data?.merchant || 'Transaksi Digital'}
              </h4>
              <span
                className={`text-sm font-bold tracking-tight whitespace-nowrap ${
                  isIncome
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {isIncome ? '+' : '-'}{formatRupiah(data?.amount || 0)}
              </span>
            </div>

            {/* Tombol Aksi Cepat */}
            {onViewDetail && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsVisible(false);
                    if (data) onViewDetail(data);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:text-slate-700 dark:text-slate-100 dark:hover:text-white transition-colors"
                >
                  <span>Lihat Detail</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
