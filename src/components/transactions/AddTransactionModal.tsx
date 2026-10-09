'use client';

// ==============================================================================
// COMPONENT: src/components/transactions/AddTransactionModal.tsx
// Modal Tambah Transaksi: Input Manual & Pemindaian Foto Struk (Vision AI)
// ==============================================================================

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  UploadCloud,
  Sparkles,
  Check,
  AlertCircle,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  Tag,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface CategoryOption {
  id: string;
  name: string;
  type: 'expense' | 'income';
}

interface AccountOption {
  id: string;
  name: string;
  owner: 'suami' | 'istri';
}

export interface PreloadedTransactionData {
  merchant?: string;
  amount?: number;
  direction?: 'out' | 'in';
  notes?: string;
  transactionDate?: string;
  accountName?: string;
  rawNotificationId?: string;
}

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryOption[];
  accounts: AccountOption[];
  onSuccess: () => void;
  userRole?: 'suami' | 'istri';
  preloadedData?: PreloadedTransactionData | null;
}

export default function AddTransactionModal({
  isOpen,
  onClose,
  categories,
  accounts,
  onSuccess,
  userRole = 'suami',
  preloadedData,
}: AddTransactionModalProps) {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');

  // State Formulir Transaksi
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [transactionDate, setTransactionDate] = useState(() => {
    return new Date().toISOString().slice(0, 16);
  });
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || '');
  const [categoryId, setCategoryId] = useState<string>('');
  const [notes, setNotes] = useState('');

  // State Scanner Vision AI
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Otomatis terapkan data bawaan (misal dari notifikasi mentah) jika ada
  useEffect(() => {
    if (preloadedData && isOpen) {
      setActiveTab('manual');
      if (preloadedData.merchant) setMerchant(preloadedData.merchant);
      if (preloadedData.amount !== undefined) setAmount(preloadedData.amount);
      if (preloadedData.direction) setDirection(preloadedData.direction);
      if (preloadedData.notes) setNotes(preloadedData.notes);
      if (preloadedData.transactionDate) {
        try {
          setTransactionDate(new Date(preloadedData.transactionDate).toISOString().slice(0, 16));
        } catch {
          // Abaikan kesalahan parse
        }
      }
      if (preloadedData.accountName && accounts.length > 0) {
        const found = accounts.find((a) =>
          a.name.toLowerCase().includes(preloadedData.accountName!.toLowerCase())
        );
        if (found) setAccountId(found.id);
      }
    }
  }, [preloadedData, isOpen, accounts]);

  if (!isOpen) return null;

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setScanError('Mohon pilih berkas gambar struk (.jpg, .png, .webp).');
      return;
    }
    setSelectedFile(file);
    setScanError(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleScanReceipt = async () => {
    if (!selectedFile) return;

    setIsScanning(true);
    setScanError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('source_device', userRole);
      formData.append('dry_run', 'true'); // Dapatkan hasil ekstraksi untuk dikonfirmasi

      const res = await fetch('/api/screenshot', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || json.message || 'Gagal menganalisis struk.');
      }

      const vision = json.vision;
      if (vision) {
        if (vision.merchant) setMerchant(vision.merchant);
        if (vision.totalAmount) setAmount(vision.totalAmount);
        if (vision.direction) setDirection(vision.direction);
        if (vision.transactionDate) {
          try {
            setTransactionDate(new Date(vision.transactionDate).toISOString().slice(0, 16));
          } catch {
            // Keep current
          }
        }
        if (vision.notes || vision.rawSummary) {
          setNotes(vision.notes || vision.rawSummary);
        }

        // Cocokkan akun jika ada
        const foundAcc = accounts.find((a) =>
          a.name.toLowerCase().includes(String(vision.accountName || '').toLowerCase())
        );
        if (foundAcc) setAccountId(foundAcc.id);

        // Beralih ke tab form konfirmasi
        setActiveTab('manual');
      }
    } catch (err: any) {
      setScanError(err.message || 'Terjadi kesalahan saat memproses gambar.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      alert('Nominal transaksi harus lebih dari 0.');
      return;
    }
    if (!merchant.trim()) {
      alert('Nama transaksi atau merchant wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        amount: Number(amount),
        merchant: merchant.trim(),
        direction,
        transaction_date: new Date(transactionDate).toISOString(),
        account_id: accountId || null,
        category_id: categoryId || null,
        notes: notes.trim(),
        source_device: userRole,
      };

      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('household_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          const dedupeHash = `manual:${profile.household_id}:${payload.source_device}:${Date.now()}:${payload.amount}:${Math.random().toString(36).slice(2, 8)}`;
          await supabase.from('transactions').insert({
            household_id: profile.household_id,
            account_id: payload.account_id,
            category_id: payload.category_id,
            amount: payload.amount,
            direction: payload.direction,
            merchant: payload.merchant,
            raw_notification: payload.notes || `[Manual Input] ${payload.merchant}`,
            source_device: payload.source_device,
            transaction_date: payload.transaction_date,
            status: 'reconciled',
            dedupe_hash: dedupeHash,
            needs_review: false,
          });

          // Jika transaksi ini berasal dari konversi notifikasi mentah, tandai sebagai tervalidasi
          if (preloadedData?.rawNotificationId) {
            await supabase
              .from('raw_notifications')
              .update({ validated_at: new Date().toISOString() })
              .eq('id', preloadedData.rawNotificationId);
          }
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      alert('Gagal menyimpan transaksi: ' + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter((c) =>
    direction === 'out' ? c.type === 'expense' : c.type === 'income'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[var(--surface-3)] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-lg w-full border border-[var(--border-color)] shadow-2xl animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-150 my-0 sm:my-8 max-h-[92vh] overflow-y-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]/70 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)] leading-tight">
                Tambah Transaksi
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Catat pengeluaran tunai atau pindai foto struk otomatis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Scan Struk vs Input Manual */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'scan'
                ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-2xs font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Scan Foto Struk</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'manual'
                ? 'bg-[var(--accent-color)] text-[var(--bg-main)] shadow-2xs font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Form Manual</span>
          </button>
        </div>

        {/* TAB 1: SCAN FOTO STRUK (VISION AI) */}
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-color)] rounded-3xl p-6 text-center cursor-pointer transition-colors bg-[var(--surface-2)]/60"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileChange(file);
                }}
              />

              {previewUrl ? (
                <div className="space-y-3">
                  <div className="w-36 h-36 mx-auto rounded-2xl overflow-hidden border border-[var(--border-color)] shadow-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Pratinjau Struk" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Klik untuk mengganti foto struk
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] flex items-center justify-center mx-auto shadow-2xs">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-main)]">
                    Ambil Foto Kamera atau Unggah Struk
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                    Mendukung struk belanja fisik (Indomaret, SPBU, kasir) dan tangkapan layar m-Banking
                  </p>
                </div>
              )}
            </div>

            {scanError && (
              <div className="p-3 rounded-2xl bg-expense/15 border border-expense/30 text-expense text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedFile || isScanning}
              onClick={handleScanReceipt}
              className="w-full py-3 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-50 text-[var(--bg-main)] text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isScanning ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Menganalisis Struk dengan Google Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Pindai Data Struk Otomatis</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB 2: INPUT / KONFIRMASI FORMULIR MANUAL */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Arah Arus Kas */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('out')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                  direction === 'out'
                    ? 'bg-expense/15 text-expense border-expense/40 shadow-xs'
                    : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border-color)]'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-expense" />
                <span>Pengeluaran</span>
              </button>

              <button
                type="button"
                onClick={() => setDirection('in')}
                className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                  direction === 'in'
                    ? 'bg-income/15 text-income border-income/40 shadow-xs'
                    : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border-color)]'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-income" />
                <span>Pemasukan</span>
              </button>
            </div>

            {/* Nama Merchant & Nominal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                  Nama Transaksi / Toko
                </label>
                <input
                  type="text"
                  required
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="e.g. Indomaret, SPBU, Kopi Kenangan"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                  Nominal (Rp)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="50000"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] font-bold angka-keuangan focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
              </div>
            </div>

            {/* Tanggal & Rekening */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                  Tanggal & Waktu
                </label>
                <input
                  type="datetime-local"
                  required
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                  Rekening / Dompet
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
                >
                  <option value="">Pilih Rekening...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.owner === 'suami' ? 'Suami' : 'Istri'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Kategori */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                Kategori
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
              >
                <option value="">Pilih Kategori...</option>
                {filteredCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Catatan Tambahan */}
            <div>
              <label className="text-[11px] font-bold text-[var(--text-muted)] block mb-1">
                Catatan / Keterangan (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan belanja keperluan dapur..."
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-color)]"
              />
            </div>

            {/* Tombol Simpan */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-50 text-[var(--bg-main)] text-xs font-bold transition-all shadow-sm"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
