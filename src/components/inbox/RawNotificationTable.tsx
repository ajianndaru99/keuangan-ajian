'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RawNotificationTable.tsx
// Tabel & Stream Notifikasi Mentah Masuk dari Seluruh Aplikasi Finansial HP
// Tampilan Teks Utuh, Lengkap, Akurat, Tanpa Terpotong (Zero Truncation)
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
  Bell,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDateWIB, formatRelativeWIB } from '@/lib/utils';

export interface RawNotificationItem {
  id: string;
  household_id?: string;
  device_id: string;
  source?: string;
  app_name: string;
  title: string;
  content: string;
  received_at_raw?: string | null;
  received_at?: number | null;
  server_received_at?: string;
  created_at: string;
  outcome?: string | null;
  reasons?: string[] | null;
  parser_version?: string | null;
  sensitive?: boolean;
  validated_at?: string | null;
  dedupe_hash?: string | null;
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
  const [expandedMetaIds, setExpandedMetaIds] = useState<Set<string>>(new Set());

  // Salin teks dengan feedback visual
  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Toggle detail teknis/metadata per item
  const toggleMeta = (id: string) => {
    setExpandedMetaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Normalisasi nama aplikasi ramah pengguna
  const getReadableAppName = (appName: string): string => {
    const lower = (appName || '').toLowerCase();
    if (lower.includes('livin') || lower.includes('mandiri')) return "Mandiri Livin'";
    if (lower.includes('brimo') || lower.includes('bri')) return 'BRImo';
    if (lower.includes('mybca')) return 'myBCA';
    if (lower.includes('bca')) return 'BCA';
    if (lower.includes('jago')) return 'Bank Jago';
    if (lower.includes('seabank')) return 'SeaBank';
    if (lower.includes('shopeepay')) return 'ShopeePay';
    if (lower.includes('shopee')) return 'Shopee';
    if (lower.includes('gopay')) return 'GoPay';
    if (lower.includes('gojek')) return 'Gojek';
    if (lower.includes('grab')) return 'Grab';
    if (lower.includes('kai')) return 'Access by KAI';
    if (lower.includes('ovo')) return 'OVO';
    if (lower.includes('dana')) return 'DANA';
    return appName || 'Notifikasi Finansial';
  };

  // Styling badge aplikasi
  const getAppBadgeStyle = (appName: string): string => {
    const lower = (appName || '').toLowerCase();
    if (lower.includes('jago')) return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700';
    if (lower.includes('livin') || lower.includes('mandiri')) return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700';
    if (lower.includes('bca')) return 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700';
    if (lower.includes('brimo') || lower.includes('bri')) return 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700';
    if (lower.includes('gopay') || lower.includes('gojek')) return 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-700';
    if (lower.includes('shopee')) return 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-700';
    if (lower.includes('dana')) return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
    if (lower.includes('seabank')) return 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700';
    if (lower.includes('kai')) return 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  // Daftar nama aplikasi unik untuk filter dropdown
  const uniqueApps = useMemo(() => {
    const set = new Set<string>();
    notifications.forEach((n) => {
      if (n.app_name) set.add(n.app_name);
    });
    return Array.from(set).sort();
  }, [notifications]);

  // Filter Data Notifikasi
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
        const matchDevice = (notif.device_id || '').toLowerCase().includes(q);
        return matchTitle || matchContent || matchApp || matchDevice;
      }

      return true;
    });
  }, [notifications, appFilter, statusFilter, search]);

  return (
    <div className="space-y-4">
      {/* Toolbar Filter & Pencarian */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kata kunci, nominal, bank, atau merchant..."
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
                {getReadableAppName(app)}
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

      {/* Info Status Jumlah Log */}
      <div className="flex items-center justify-between px-1 text-xs text-[var(--text-muted)]">
        <p>
          Menampilkan <span className="font-bold text-[var(--text-main)]">{filteredNotifications.length}</span> log notifikasi mentah utuh.
        </p>
        <span className="text-[11px] font-medium text-[var(--accent-color)]">
          Tampilan Penuh Aktif • Tanpa Potongan Teks
        </span>
      </div>

      {/* Stream Notifikasi Mentah */}
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)] flex items-center justify-center mx-auto mb-3">
            <Smartphone className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-[var(--text-main)]">
            Belum Ada Log Notifikasi
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
            Setiap notifikasi finansial yang diteruskan oleh HP (Notification Forwarder: Mandiri, BCA, BRI, Jago, GoPay, Shopee, DANA, KAI, dll.) akan otomatis tercatat dan tersaji utuh di sini secara realtime.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredNotifications.map((item) => {
            const isSuami = (item.device_id || '').toLowerCase().includes('suami');
            const isDone = item.validated_at !== null;
            const hasParser = item.outcome === 'transaction' || item.outcome === 'needs_review';
            const readableApp = getReadableAppName(item.app_name);

            // Ekstrak nominal perkiraan dari teks untuk highlight
            const amountMatch = item.content.match(/\b(?:rp|idr)\.?\s*(\d[\d.,]*)/i);
            const detectedNominal = amountMatch ? amountMatch[0] : null;

            // Teks lengkap gabungan (Judul + Isi)
            const fullRawText = item.title ? `${item.title}\n\n${item.content}` : item.content;
            const isMetaOpen = expandedMetaIds.has(item.id);

            const timestampStr = item.server_received_at || item.created_at;
            const fullWibTime = formatDateWIB(timestampStr);
            const relativeTime = formatRelativeWIB(timestampStr);

            return (
              <div
                key={item.id}
                className={`p-4 md:p-5 rounded-2xl border transition-all ${
                  isDone
                    ? 'bg-[var(--bg-card)]/60 border-[var(--border-color)]/70 opacity-90'
                    : 'bg-[var(--bg-card)] border-[var(--border-color)] shadow-xs hover:border-[#007a33]/50'
                }`}
              >
                <div className="flex flex-col gap-3">
                  {/* Header Item: Badge App, Device, Outcome, dan Timestamp Lengkap */}
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--border-color)]/60 pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Badge Nama Bank / Aplikasi */}
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-bold border ${getAppBadgeStyle(
                          item.app_name
                        )}`}
                      >
                        {readableApp}
                      </span>

                      {/* Package Name jika berbeda */}
                      {item.app_name && item.app_name !== readableApp && (
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                          ({item.app_name})
                        </span>
                      )}

                      {/* Badge Device */}
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-[var(--bg-main)] text-slate-700 dark:text-slate-300 border border-[var(--border-color)]">
                        {isSuami ? 'HP Suami' : 'HP Istri'}
                      </span>

                      {/* Status Penguraian */}
                      {item.outcome === 'transaction' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Terurai Otomatis</span>
                        </span>
                      )}

                      {item.outcome === 'needs_review' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Perlu Tinjauan</span>
                        </span>
                      )}

                      {!hasParser && !item.sensitive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          Data Mentah
                        </span>
                      )}

                      {item.sensitive && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                          Sensitif / OTP
                        </span>
                      )}
                    </div>

                    {/* Waktu Masuk Lengkap WIB + Relatif */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-[var(--text-main)]">{fullWibTime}</span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">({relativeTime})</span>
                    </div>
                  </div>

                  {/* Judul Notifikasi (Jika Ada) */}
                  {item.title && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)]">
                      <Bell className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />
                      <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider shrink-0">
                        Judul:
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-[var(--text-main)] break-words flex-1">
                        {item.title}
                      </h4>
                    </div>
                  )}

                  {/* Box Teks Lengkap Utuh (Zero Truncation) */}
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] overflow-hidden shadow-2xs">
                    {/* Toolbar Salin & Info Karakter */}
                    <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--surface-2)] border-b border-[var(--border-color)] text-xs">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                        <span className="font-bold text-[var(--text-main)]">
                          Teks Notifikasi Lengkap
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[var(--surface-3)] text-[var(--text-muted)] border border-[var(--border-color)]">
                          {item.content.length} karakter
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Tombol Salin Isi Pesan */}
                        <button
                          type="button"
                          onClick={() => handleCopyText(`content-${item.id}`, item.content)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--accent-color)] hover:bg-[var(--accent-color)]/10 transition-colors"
                          title="Salin isi notifikasi ini"
                        >
                          {copiedId === `content-${item.id}` ? (
                            <>
                              <CheckCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
                              <span className="text-[var(--color-income)]">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Isi</span>
                            </>
                          )}
                        </button>

                        {/* Tombol Salin Seluruh Notifikasi (Judul + Isi) */}
                        {item.title && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(`all-${item.id}`, fullRawText)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-3)] transition-colors hidden sm:inline-flex"
                            title="Salin judul dan isi pesan notifikasi"
                          >
                            {copiedId === `all-${item.id}` ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
                                <span className="text-[var(--color-income)]">Semua Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Salin Semua</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Area Teks Mentah Utuh: Monospace, Rapi, Lengkap, Bebas Seleksi */}
                    <div className="p-3.5 md:p-4 bg-[var(--surface-1)]">
                      <p className="font-mono text-xs sm:text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap break-words select-text">
                        {item.content}
                      </p>
                    </div>
                  </div>

                  {/* Baris Bawah: Highlight Nominal Terdeteksi & Aksi Cepat */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                    {/* Nominal Highlight */}
                    <div>
                      {detectedNominal ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Nominal Terdeteksi: {detectedNominal}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Tidak ada angka nominal otomatis
                        </span>
                      )}
                    </div>

                    {/* Tombol-tombol Aksi */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Toggle Metadata Teknis */}
                      <button
                        type="button"
                        onClick={() => toggleMeta(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-medium border border-[var(--border-color)] transition-colors"
                        title="Tampilkan detail ID dan parameter teknis notifikasi"
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>Metadata</span>
                        {isMetaOpen ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {/* Tombol Jadikan Transaksi */}
                      <button
                        onClick={() => onConvertToTransaction(item)}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white dark:text-[#121218] text-xs font-bold transition-all shadow-xs"
                        title="Ubah notifikasi ini menjadi transaksi resmi dan simpan ke database"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Jadikan Transaksi</span>
                      </button>

                      {/* Tombol Abaikan / Status Ditinjau */}
                      {!isDone ? (
                        <button
                          onClick={() => onIgnoreNotification(item.id)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-4)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold border border-[var(--border-color)] transition-all"
                          title="Tandai notifikasi ini sebagai selesai dilihat / non-transaksi"
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
                        className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--color-expense)] hover:bg-[var(--color-expense)]/10 transition-colors"
                        title="Hapus log notifikasi mentah ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Panel Metadata Teknis Accordion */}
                  {isMetaOpen && (
                    <div className="mt-2 p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-[11px] font-mono space-y-1.5 text-[var(--text-muted)]">
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="font-semibold text-[var(--text-main)]">ID Log:</span>
                        <span className="select-all">{item.id}</span>
                      </div>
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="font-semibold text-[var(--text-main)]">ID Perangkat:</span>
                        <span>{item.device_id}</span>
                      </div>
                      <div className="flex justify-between flex-wrap gap-1">
                        <span className="font-semibold text-[var(--text-main)]">Nama Paket / App:</span>
                        <span>{item.app_name}</span>
                      </div>
                      {item.received_at_raw && (
                        <div className="flex justify-between flex-wrap gap-1">
                          <span className="font-semibold text-[var(--text-main)]">Waktu HP Mentah:</span>
                          <span>{item.received_at_raw}</span>
                        </div>
                      )}
                      {item.dedupe_hash && (
                        <div className="flex justify-between flex-wrap gap-1">
                          <span className="font-semibold text-[var(--text-main)]">Dedupe Hash:</span>
                          <span className="truncate max-w-xs">{item.dedupe_hash}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
