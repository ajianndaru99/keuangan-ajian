'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/ScreenshotUploadZone.tsx
// Area Unggah & Paste Bukti Transfer Screenshot — Liquid Glass Pastel
// Mendukung Drag & Drop, File Picker, Kamera HP, dan Keyboard Paste (Ctrl+V)
// ==============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Camera,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { formatRupiah } from '@/lib/utils';

interface ScreenshotUploadZoneProps {
  onTransactionCreated?: () => void;
  defaultOwner?: 'suami' | 'istri';
}

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

interface ExtractedData {
  merchant: string;
  amount: number;
  accountName: string;
  direction: 'out' | 'in';
  referenceNumber?: string;
  rawSummary?: string;
}

export default function ScreenshotUploadZone({
  onTransactionCreated,
  defaultOwner = 'suami',
}: ScreenshotUploadZoneProps) {
  const [owner, setOwner] = useState<'suami' | 'istri'>(defaultOwner);
  const [state, setState] = useState<UploadState>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [extracted, setExtracted] = useState<ExtractedData | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fungsi pengiriman gambar ke API /api/screenshot
  const processImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setState('error');
        setStatusMessage('Berkas harus berupa gambar (JPG, PNG, WebP).');
        return;
      }

      setState('uploading');
      setStatusMessage('Mengunggah gambar screenshot...');

      try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('source_device', owner);

        setState('analyzing');
        setStatusMessage('Vision AI membaca struk & nominal pembayaran...');

        // Ambil session token jika ada
        const headers: Record<string, string> = {};
        try {
          const { createClient } = await import('@/lib/supabase/client');
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
        } catch {
          // Abaikan jika offline
        }

        const response = await fetch('/api/screenshot', {
          method: 'POST',
          headers,
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || result.message || 'Gagal memproses screenshot.');
        }

        if (result.duplicate) {
          setState('success');
          setStatusMessage('Bukti transaksi ini sudah pernah tersimpan sebelumnya (duplikat diabaikan).');
          setExtracted({
            merchant: result.transaction?.merchant || 'Transaksi Duplikat',
            amount: Number(result.transaction?.amount) || 0,
            accountName: 'Tercatat',
            direction: 'out',
          });
          if (onTransactionCreated) onTransactionCreated();
          return;
        }

        const vision = result.vision || {};
        setExtracted({
          merchant: vision.merchant || 'Transaksi',
          amount: vision.totalAmount || vision.amount || 0,
          accountName: vision.accountName || 'Bank',
          direction: vision.direction || 'out',
          referenceNumber: vision.referenceNumber,
          rawSummary: vision.rawSummary,
        });

        setState('success');
        setStatusMessage('Transaksi dari screenshot berhasil masuk ke Inbox!');
        if (onTransactionCreated) onTransactionCreated();
      } catch (err: any) {
        setState('error');
        setStatusMessage(err.message || 'Terjadi gangguan saat memproses gambar.');
      }
    },
    [owner, onTransactionCreated]
  );

  // Global listener untuk Paste Clipboard (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processImageFile]);

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processImageFile(files[0]);
    }
  };

  const resetState = () => {
    setState('idle');
    setStatusMessage('');
    setExtracted(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Pencatatan Otomatis Bukti Screenshot (Vision AI)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cukup tempel (Ctrl+V) atau tarik tangkapan layar struk transfer / QRIS ke sini
          </p>
        </div>

        {/* Toggle Pemilik Akun */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setOwner('suami')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              owner === 'suami'
                ? 'bg-white text-slate-800 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Akun Suami
          </button>
          <button
            type="button"
            onClick={() => setOwner('istri')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              owner === 'istri'
                ? 'bg-white text-slate-800 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Akun Istri
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Area Dropzone / Status */}
      <div className="mt-4">
        {state === 'idle' && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragOver
                ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/60'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100/70 text-emerald-700 flex items-center justify-center shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Klik untuk memilih gambar atau seret file ke sini
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Mendukung screenshot m-banking, QRIS, GoPay, OVO, ShopeePay, atau struk fisik (bisa tekan{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[11px] font-mono text-slate-600">
                  Ctrl+V
                </kbd>{' '}
                kapan saja)
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-md">
                <Camera className="w-3 h-3 text-slate-400" /> Buka Kamera HP
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/60">
                <ShieldCheck className="w-3 h-3 text-emerald-600" /> Ekstraksi Vision AI Otomatis
              </span>
            </div>
          </div>
        )}

        {(state === 'uploading' || state === 'analyzing') && (
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 animate-pulse">
            <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{statusMessage}</p>
              <p className="text-xs text-slate-500 mt-1">
                {state === 'uploading'
                  ? 'Menyiapkan berkas gambar...'
                  : 'Mengekstrak nominal, nama merchant, dan nomor referensi via Vision AI...'}
              </p>
            </div>
          </div>
        )}

        {state === 'success' && extracted && (
          <div className="border border-emerald-300 bg-emerald-50/60 rounded-xl p-5 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="inline-block text-[11px] font-semibold tracking-wide text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md mb-1">
                    BERHASIL DICATAT
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{extracted.merchant}</h3>
                  <p className="text-xs text-slate-600">
                    {extracted.accountName} • Milik {owner === 'suami' ? 'Suami' : 'Istri'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg font-bold text-emerald-700">
                  {formatRupiah(extracted.amount)}
                </span>
                {extracted.referenceNumber && (
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Ref: {extracted.referenceNumber}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/60 flex items-center justify-between">
              <p className="text-xs text-slate-600 truncate max-w-[70%]">
                {statusMessage}
              </p>
              <button
                type="button"
                onClick={resetState}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-all shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Unggah Bukti Lain
              </button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="border border-rose-200 bg-rose-50/60 rounded-xl p-5 transition-all">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-rose-900">Pembacaan Screenshot Terkendala</h3>
                <p className="text-xs text-rose-700 mt-1">{statusMessage}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetState}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800 bg-white border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Coba Lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1.5"
                  >
                    Pilih File Berbeda
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
