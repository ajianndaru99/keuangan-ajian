'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/AiReconciliationModal.tsx
// Dialog Rekonsiliasi AI Finansial (Google Gemini Flash & Deterministic Fallback)
// - Menggantikan window.confirm/alert yang terblokir di Android WebView
// - Memberikan feedback visual audit finansial, kuota harian, dan ringkasan aksi
// ==============================================================================

import { useState } from 'react';
import {
  X,
  Sparkles,
  ArrowRightLeft,
  CopyX,
  CheckCircle2,
  ShieldAlert,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { ReconciliationExecutionResult } from '@/lib/ai/daily-reconciler';

interface AiReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  remainingQuota: number;
  canRun: boolean;
  pendingCount: number;
  onReconcileSuccess: (newRemainingQuota: number) => Promise<void> | void;
}

export default function AiReconciliationModal({
  isOpen,
  onClose,
  remainingQuota,
  canRun,
  pendingCount,
  onReconcileSuccess,
}: AiReconciliationModalProps) {
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<ReconciliationExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExecute = async () => {
    setStatus('running');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/ai/daily-reconcile', {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Gagal menjalankan rekonsiliasi AI.');
        return;
      }

      setResult(data as ReconciliationExecutionResult);
      setStatus('success');
      await onReconcileSuccess(data.remainingQuota ?? 0);
    } catch (err: unknown) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Terjadi kesalahan jaringan: ${msg}`);
    }
  };

  const handleFinish = () => {
    setStatus('idle');
    setResult(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && status !== 'running') onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[var(--surface-3)] rounded-t-3xl sm:rounded-3xl border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0">
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--surface-3)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">
                Rekonsiliasi AI Gemini
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Audit harian & pencocokan transaksi otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                remainingQuota === 0
                  ? 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30'
                  : remainingQuota === 1
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30'
              }`}
            >
              Sisa Kuota: {remainingQuota}x
            </span>

            {status !== 'running' && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-4)] transition-colors"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Isi Modal Berdasarkan Status */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* 1. STATE IDLE (Konfirmasi Awal) */}
          {status === 'idle' && (
            <>
              {remainingQuota === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>Batas Kuota Harian Telah Tercapai (2/2)</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Fitur rekonsiliasi AI dibatasi maksimal 2 kali per hari demi efisiensi kuota. Kuota Anda akan otomatis direset kembali besok pada pukul <strong>00:00 WIB</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <div>
                        <span className="font-bold text-[var(--text-main)] block">
                          {pendingCount} Transaksi Menunggu Verifikasi
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Siap dianalisis dan direkonsiliasi oleh sistem
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <span className="text-xs font-bold text-[var(--text-main)] block">
                      Aksi yang akan dijalankan oleh AI:
                    </span>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                        <ArrowRightLeft className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[var(--text-main)] block">
                            Deteksi Transfer Internal Keluarga
                          </strong>
                          <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Memasangkan mutasi keluar dan masuk sesama rekening (suami/istri) dengan nominal sama ke kategori &ldquo;Transfer Keluarga&rdquo;.
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                        <CopyX className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[var(--text-main)] block">
                            Pembersihan Notifikasi Ganda
                          </strong>
                          <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Menghapus konfirmasi dobel dari SMS dan push notification aplikasi bank dalam waktu bersamaan agar tidak double counting.
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                        <CheckCircle2 className="w-4 h-4 text-income shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[var(--text-main)] block">
                            Persetujuan Belanja Sah & Penentuan Kategori
                          </strong>
                          <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Transaksi riil langsung disetujui (reconciled) dan dipilihkan pos anggaran yang cocok (Belanja Dapur, Jajan, Bensin, dll).
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                        <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[var(--text-main)] block">
                            Penyaringan Promo & Pelatihan Aturan Adaptif
                          </strong>
                          <span className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                            Mengabaikan promo Rp 0 serta melatih pola regex agar pesan iklan serupa otomatis ditolak ke depannya.
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* 2. STATE RUNNING (Sedang Proses) */}
          {status === 'running' && (
            <div className="py-10 text-center space-y-4">
              <div className="relative w-14 h-14 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 animate-ping" />
                <div className="w-14 h-14 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
                <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400 absolute" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--text-main)]">
                  Menganalisis Transaksi Harian...
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs mx-auto leading-relaxed">
                  Google Gemini Flash sedang memeriksa transfer internal, duplikasi notifikasi, dan kategori pengeluaran keluarga.
                </p>
              </div>
            </div>
          )}

          {/* 3. STATE SUCCESS (Hasil Selesai) */}
          {status === 'success' && result && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-income/10 border border-income/30 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-income/20 text-income flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-main)]">
                    Rekonsiliasi AI Selesai!
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {result.summaryNotes}
                  </p>
                </div>
              </div>

              {/* Grid Metrik Ringkasan */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Transfer Internal
                  </span>
                  <span className="text-base font-extrabold text-sky-500 mt-0.5 block">
                    {result.pairedTransfersCount} Pasang
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Duplikat Dibersihkan
                  </span>
                  <span className="text-base font-extrabold text-amber-500 mt-0.5 block">
                    {result.duplicatesCount} Data
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Transaksi Disetujui
                  </span>
                  <span className="text-base font-extrabold text-income mt-0.5 block">
                    {result.reconciledCount} Data
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                  <span className="text-[10px] text-[var(--text-muted)] block font-medium">
                    Promo / Diabaikan
                  </span>
                  <span className="text-base font-extrabold text-rose-500 mt-0.5 block">
                    {result.ignoredCount} Data
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-muted)] flex items-center justify-between">
                <span>Sisa kuota rekonsiliasi hari ini:</span>
                <span className="font-bold text-[var(--text-main)]">
                  {result.remainingQuota}x
                </span>
              </div>
            </div>
          )}

          {/* 4. STATE ERROR */}
          {status === 'error' && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Kendala Rekonsiliasi AI</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {errorMessage || 'Terjadi kesalahan saat memproses data transaksi.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Tombol Aksi */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--surface-3)]">
          {status === 'idle' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
              >
                {remainingQuota === 0 ? 'Tutup' : 'Batal'}
              </button>

              {remainingQuota > 0 && (
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={!canRun}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Jalankan Audit AI</span>
                </button>
              )}
            </>
          )}

          {status === 'running' && (
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Memproses...</span>
            </span>
          )}

          {status === 'success' && (
            <button
              type="button"
              onClick={handleFinish}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-income hover:opacity-90 active:scale-95 transition-all shadow-xs"
            >
              Selesai & Muat Transaksi
            </button>
          )}

          {status === 'error' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleExecute}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-colors"
              >
                Coba Lagi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
