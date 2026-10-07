'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RealtimeToast.tsx
// Notifikasi Pop-up Halus saat Transaksi Baru Masuk via Screenshot Realtime
// Responsif: Monitor/Laptop di kanan bawah, HP di bawah layar
// ==============================================================================

import { useEffect, useState } from 'react';
import { Sparkles, X, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

export interface ToastTransactionData {
  id?: string;
  merchant: string;
  amount: number;
  direction: 'out' | 'in';
  sourceDevice?: 'suami' | 'istri';
  accountName?: string;
}

interface RealtimeToastProps {
  data: ToastTransactionData | null;
  onClose: () => void;
  duration?: number; // milidetik sebelum otomatis hilang (default 6000ms)
}

export default function RealtimeToast({
  data,
  onClose,
  duration = 6000,
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
      setTimeout(onClose, 300); // Tunggu animasi fade-out selesai
    }, duration);

    return () => clearTimeout(timer);
  }, [data, duration, onClose]);

  if (!data && !isVisible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed z-50 transition-all duration-300 ease-out transform pointer-events-auto
        /* Posisi responsif: HP di bawah tengah, Monitor/Laptop di kanan bawah */
        bottom-4 inset-x-4 max-w-sm mx-auto
        md:bottom-6 md:right-6 md:inset-auto md:max-w-md md:mx-0
        ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }
      `}
    >
      <div className="relative rounded-3xl p-4 liquid-glass bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-sky-300/80 dark:border-sky-500/40 shadow-2xl shadow-sky-500/20 overflow-hidden">
        {/* Glow aksen atas */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-500 to-emerald-400" />

        <div className="flex items-start gap-3">
          {/* Avatar Icon Notifikasi dengan Ping Animasi */}
          <div className="relative shrink-0 mt-0.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 text-white flex items-center justify-center shadow-md shadow-sky-400/30 border border-white/50">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>

          {/* Konten Keterangan Transaksi */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Screenshot Baru Masuk
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold">• Baru saja</span>
            </div>

            <h4 className="text-sm font-black text-slate-900 dark:text-white truncate leading-snug">
              {data?.merchant || 'Transaksi Digital'}
            </h4>

            <div className="flex items-center justify-between gap-2 mt-1.5">
              {/* Nominal */}
              <div className="flex items-center gap-1">
                {data?.direction === 'in' ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-black text-emerald-700 dark:text-emerald-400">
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    +{formatRupiah(data?.amount || 0)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-xs font-black text-rose-700 dark:text-rose-400">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    -{formatRupiah(data?.amount || 0)}
                  </span>
                )}
              </div>

              {/* Badges Ringkas */}
              <div className="flex items-center gap-1">
                {data?.accountName && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {data.accountName}
                  </span>
                )}
                {data?.sourceDevice && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      data.sourceDevice === 'suami'
                        ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                        : 'bg-pink-50 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-800'
                    }`}
                  >
                    {data.sourceDevice === 'suami' ? '👨 Suami' : '👩 Istri'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tombol Tutup */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="p-1 rounded-xl text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
