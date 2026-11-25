'use client';

// ==============================================================================
// COMPONENT: src/components/inbox/RawNotificationTable.tsx
// Stream Notifikasi Mentah (Read-Only Inspection dengan Teks Utuh & Salin)
// ==============================================================================

import { useState, useMemo } from 'react';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  CheckCheck,
  Copy,
  FileText,
  Sparkles,
  Bell,
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
  created_at: string;
  outcome?: string | null;
  reasons?: string[] | null;
  parser_version?: string | null;
  sensitive?: boolean;
}

interface RawNotificationTableProps {
  notifications: RawNotificationItem[];
  loading?: boolean;
}

export default function RawNotificationTable({
  notifications,
  loading = false,
}: RawNotificationTableProps) {
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'transaction' | 'ignored'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getReadableAppName = (appName: string): string => {
    const lower = (appName || '').toLowerCase();
    if (lower.includes('livin') || lower.includes('mandiri') || lower.includes('bmri')) return "Mandiri Livin'";
    if (lower.includes('jago')) return 'Bank Jago';
    if (lower.includes('bca')) return 'BCA Mobile / myBCA';
    if (lower.includes('gopay') || lower.includes('gojek')) return 'GoPay';
    if (lower.includes('dana')) return 'DANA';
    if (lower.includes('ovo')) return 'OVO';
    if (lower.includes('shopee')) return 'ShopeePay';
    if (lower.includes('seabank')) return 'SeaBank';
    return appName || 'Aplikasi';
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (outcomeFilter !== 'all' && n.outcome !== outcomeFilter) return false;
      if (!q) return true;
      return `${n.app_name} ${n.title} ${n.content}`.toLowerCase().includes(q);
    });
  }, [notifications, search, outcomeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari isi teks notifikasi mentah..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs w-max">
          {(['all', 'transaction', 'ignored'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setOutcomeFilter(mode)}
              className={`px-3 py-1 rounded-lg font-semibold ${
                outcomeFilter === mode
                  ? 'bg-[var(--surface-2)] text-[var(--text-main)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {mode === 'all' ? 'Semua' : mode === 'transaction' ? 'Masuk DB' : 'Diabaikan'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Memuat stream notifikasi...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[var(--surface-1)] border border-[var(--border-color)] text-center space-y-1.5">
          <Bell className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
          <p className="text-xs font-semibold text-[var(--text-main)]">Belum ada notifikasi mentah.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const fullText = `${n.title ? `${n.title}: ` : ''}${n.content || ''}`.trim();
            const isTx = n.outcome === 'transaction';
            return (
              <div
                key={n.id}
                className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Smartphone className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                    <span className="font-bold text-[var(--text-main)]">{getReadableAppName(n.app_name)}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isTx
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-zinc-500/15 text-zinc-500'
                      }`}
                    >
                      {isTx ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Transaksi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Diabaikan
                        </span>
                      )}
                    </span>
                    {n.parser_version && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] inline-flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> {n.parser_version}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1" title={formatDateWIB(n.created_at)}>
                      <Clock className="w-3 h-3" />
                      {formatRelativeWIB(n.created_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(n.id, fullText)}
                      className="inline-flex items-center gap-1 text-[var(--accent-color)] hover:underline"
                    >
                      {copiedId === n.id ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedId === n.id ? 'Disalin' : 'Salin'}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-2)]/70 border border-[var(--border-color)] text-xs font-mono text-[var(--text-main)] whitespace-pre-wrap break-words">
                  <FileText className="w-3.5 h-3.5 inline mr-1.5 text-[var(--text-muted)]" />
                  {n.title && <strong>{n.title}: </strong>}
                  {n.content}
                </div>

                {Array.isArray(n.reasons) && n.reasons.length > 0 && (
                  <p className="text-[11px] text-[var(--text-muted)]">Catatan parser: {n.reasons.join(' • ')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
