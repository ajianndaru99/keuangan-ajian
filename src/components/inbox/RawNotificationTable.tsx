'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RawNotificationTable.tsx
// Tabel & Stream Notifikasi Mentah Masuk dari Seluruh Aplikasi Finansial HP
// Mendukung Tinjauan Langsung, Konversi ke Transaksi, dan Abaikan
// ==============================================================================

import { useState, useMemo } from 'react';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  EyeOff,
  Trash2,
  Search,
  Check,
  CheckCheck,
  Copy,
  FileText,
  Sparkles,
} from 'lucide-react';
import { formatRelativeWIB } from '@/lib/utils';

export interface RawNotificationItem {
  id: string;
  household_id: string;
  device_id: string;
  source: string;
  app_name: string;
  title: string;
  content: string;
  received_at_raw: string | null;
  received_at: number | null;
  server_received_at: string;
  created_at: string;
  outcome: string | null;
  reasons: string[] | null;
  parser_version: string | null;
  sensitive: boolean;
  validated_at: string | null;
}

interface RawNotificationTableProps {
  notifications: RawNotificationItem[];
  onConvertToTransaction: (notif: RawNotificationItem) => void;
  onIgnoreNotification: (id: string) => void;
  onDeleteNotification: (id: string) => void;
  loading?: boolean;
}

export default function RawNotificationTable({
  notifications,
  onConvertToTransaction,
  onIgnoreNotification,
  onDeleteNotification,
  loading = false,
}: RawNotificationTableProps) {
  const [search, setSearch] = useState('');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unvalidated' | 'validated'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyContent = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Daftar nama aplikasi unik untuk filter dropdown
  const uniqueApps = useMemo(() => {
    const set = new Set<string>();
    notifications.forEach((n) => {
      if (n.app_name) set.add(n.app_name);
    });
    return Array.from(set).sort();
  }, [notifications]);

  // Filter Data
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      if (appFilter !== 'all' && notif.app_name.toLowerCase() !== appFilter.toLowerCase()) {
        return false;
      }

      if (statusFilter === 'unvalidated' && notif.validated_at !== null) {
        return false;
      }
      if (statusFilter === 'validated' && notif.validated_at === null) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (notif.title || '').toLowerCase().includes(q);
        const matchContent = (notif.content || '').toLowerCase().includes(q);
        const matchApp = (notif.app_name || '').toLowerCase().includes(q);
        return matchTitle || matchContent || matchApp;
      }

      return true;
    });
  }, [notifications, appFilter, statusFilter, search]);

  // Fungsi bantu warna badge aplikasi
  const getAppBadgeStyle = (appName: string) => {
    const lower = appName.toLowerCase();
    if (lower.includes('jago')) return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700/60';
    if (lower.includes('livin') || lower.includes('mandiri')) return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700/60';
    if (lower.includes('bca')) return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700/60';
    if (lower.includes('brimo') || lower.includes('bri')) return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-700/60';
    if (lower.includes('gopay')) return 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700/60';
    if (lower.includes('shopee')) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700/60';
    if (lower.includes('dana')) return 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700/60';
    if (lower.includes('saqu')) return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700/60';
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  return (
    <div className="space-y-4">
      {/* Toolbar Filter & Pencarian */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari teks notifikasi, bank, atau merchant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-xs text-[var(--text-main)] placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#007a33]/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Bank/App */}
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-xs text-[var(--text-main)] font-medium focus:outline-hidden"
          >
            <option value="all">Semua Aplikasi ({uniqueApps.length})</option>
            {uniqueApps.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>

          {/* Filter Status Tinjauan */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-xs text-[var(--text-main)] font-medium focus:outline-hidden"
          >
            <option value="all">Semua Status</option>
            <option value="unvalidated">Belum Ditinjau</option>
            <option value="validated">Sudah Ditinjau</option>
          </select>
        </div>
      </div>

      {/* Daftar Notifikasi Mentah */}
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)] flex items-center justify-center mx-auto mb-3">
            <Smartphone className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-[var(--text-main)]">
            Belum Ada Log Notifikasi
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
            Setiap notifikasi finansial yang dideteksi oleh MacroDroid di HP (Bank Jago, Mandiri, BCA, GoPay, ShopeePay, DANA, dll.) akan otomatis tercatat dan muncul di sini secara realtime.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((item) => {
            const isSuami = (item.device_id || '').toLowerCase().includes('suami');
            const isDone = item.validated_at !== null;
            const hasParser = item.outcome === 'transaction' || item.outcome === 'needs_review';

            // Ekstrak nominal perkiraan dari teks untuk highlight
            const amountMatch = item.content.match(/\b(?:rp|idr)\.?\s*(\d[\d.,]*)/i);
            const detectedNominal = amountMatch ? amountMatch[0] : null;

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isDone
                    ? 'bg-[var(--bg-card)]/50 border-[var(--border-color)]/60 opacity-80'
                    : 'bg-[var(--bg-card)] border-[var(--border-color)] shadow-2xs hover:border-[#007a33]/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* Header Item: Badge App, Device, dan Waktu */}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${getAppBadgeStyle(
                          item.app_name
                        )}`}
                      >
                        {item.app_name}
                      </span>

                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--bg-main)] text-slate-600 dark:text-slate-300 border border-[var(--border-color)]">
                        {isSuami ? 'HP Suami' : 'HP Istri'}
                      </span>

                      {/* Status Parser */}
                      {item.outcome === 'transaction' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          <span>Terurai Otomatis</span>
                        </span>
                      )}

                      {item.outcome === 'needs_review' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>Perlu Tinjauan</span>
                        </span>
                      )}

                      {!hasParser && !item.sensitive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          Data Mentah (Tanpa Parser)
                        </span>
                      )}

                      {item.sensitive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                          Data Sensitif / OTP
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-auto sm:ml-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeWIB(item.server_received_at || item.created_at)}</span>
                      </span>
                    </div>

                    {/* Judul & Isi Pesan Notifikasi Full */}
                    <div className="pt-1 space-y-1.5">
                      {item.title && (
                        <h4 className="text-xs font-bold text-[var(--text-main)] leading-snug">
                          {item.title}
                        </h4>
                      )}
                      
                      {/* Box Teks Lengkap dengan Tombol Salin */}
                      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-2)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border-color)] text-[10px] text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-muted)] flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>Teks Notifikasi Asli ({item.content.length} karakter)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyContent(item.id, item.content)}
                            className="inline-flex items-center gap-1 font-semibold text-[var(--accent-color)] hover:opacity-80 transition-colors"
                            title="Salin teks notifikasi ini"
                          >
                            {copiedId === item.id ? (
                              <>
                                <CheckCheck className="w-3 h-3 text-[var(--color-income)]" />
                                <span className="text-[var(--color-income)]">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Salin Teks</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="p-3 font-mono text-xs text-[var(--text-main)] leading-relaxed whitespace-pre-wrap break-words select-text">
                          {item.content}
                        </p>
                      </div>
                    </div>

                    {/* Highlight Nominal Jika Terdeteksi */}
                    {detectedNominal && (
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-color)] pt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Nominal Terdeteksi: {detectedNominal}</span>
                      </div>
                    )}
                  </div>

                  {/* Tombol Aksi Kanan */}
                  <div className="flex items-center sm:flex-col gap-1.5 shrink-0 pt-2 sm:pt-0">
                    {/* Tombol Jadikan Transaksi */}
                    <button
                      onClick={() => onConvertToTransaction(item)}
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white dark:text-[#121218] text-xs font-bold transition-all shadow-xs"
                      title="Ubah notifikasi ini menjadi transaksi resmi dan simpan ke database"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Jadikan Transaksi</span>
                    </button>

                    {/* Tombol Tandai Sudah Ditinjau / Abaikan */}
                    {!isDone ? (
                      <button
                        onClick={() => onIgnoreNotification(item.id)}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-4)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold border border-[var(--border-color)] transition-all"
                        title="Tandai notifikasi ini sebagai non-transaksi / sudah selesai dilihat"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Abaikan</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-income)] px-2 py-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ditinjau</span>
                      </span>
                    )}

                    {/* Tombol Hapus Log */}
                    <button
                      onClick={() => onDeleteNotification(item.id)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--color-expense)] hover:bg-[var(--color-expense)]/10 transition-colors"
                      title="Hapus log notifikasi mentah ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
