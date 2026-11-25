'use client';

// ==============================================================================
// SUPPORTS PAGE: src/app/supports/page.tsx
// Status Aplikasi Android Tunggal (Suami Only) & Unduhan APK (Read-Only)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/layout/AppShell';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  Smartphone,
  HelpCircle,
  Copy,
  RefreshCw,
  CheckCheck,
  Download,
  ShieldCheck,
  Fingerprint,
  Bot,
} from 'lucide-react';

export default function SupportsPage() {
  const [displayName, setDisplayName] = useState<string>('Kepala Keluarga (Suami)');
  const [copiedKeySuami, setCopiedKeySuami] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [suamiLastSeen, setSuamiLastSeen] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchDeviceHealth = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    setLoadingHealth(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        if (profile?.display_name) setDisplayName(profile.display_name);
      }

      const { data: lastSuami } = await supabase
        .from('raw_notifications')
        .select('created_at')
        .eq('device_id', 'hp_suami')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSuami) setSuamiLastSeen(lastSuami.created_at);
    } catch (e) {
      console.warn('Gagal mengambil status perangkat:', e);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchDeviceHealth();
  }, [fetchDeviceHealth]);

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/notification`
      : 'https://your-domain.vercel.app/api/notification';

  const apiKeySuami = 'kunci_rahasia_suami_ganti_di_env';
  const templateJson = JSON.stringify(
    {
      app_name: '[not_app_name]',
      title: '[not_title]',
      content: '[not_text]',
      device_id: 'hp_suami',
      received_at: '[system_time_ms]',
    },
    null,
    2
  );

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell userRole="suami" displayName={displayName}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-main)]">
              Aplikasi Android &amp; Koneksi HP Suami
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Aplikasi Android identik dengan Website (tampilan grafik &amp; listener notifikasi otomatis)
            </p>
          </div>

          <button
            type="button"
            onClick={fetchDeviceHealth}
            disabled={loadingHealth}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-main)] self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
            <span>Cek Status HP</span>
          </button>
        </div>

        {/* Kartu Status HP Suami & APK Download */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-3xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)]">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text-main)]">Status HP Suami (Utama)</h2>
                <span className="text-xs text-[var(--text-muted)]">
                  Notifikasi terakhir:{' '}
                  <strong className="text-[var(--text-main)]">
                    {suamiLastSeen ? new Date(suamiLastSeen).toLocaleString('id-ID') : 'Belum ada data masuk'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-[var(--border-color)]">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
                <span>Auto Anti-Dobel APK</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Fingerprint className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Biometrik &amp; PIN Aktif</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl p-5 bg-[var(--surface-1)] border border-[var(--border-color)] flex flex-col justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-main)]">Unduh APK Android Resmi</h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Menjalankan WebView yang 100% identik dengan Website + NotificationListener langsung ke endpoint Vercel.
              </p>
            </div>
            <a
              href="/downloads/KeuanganKeluarga-v2.0.apk"
              download
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-white dark:text-[#121218] text-xs font-bold"
            >
              <Download className="w-4 h-4" />
              <span>Unduh APK Keluarga</span>
            </a>
          </div>
        </div>

        {/* Endpoint Canonical & MacroDroid Cadangan */}
        <div className="rounded-3xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] space-y-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-[var(--accent-color)]" />
            <h3 className="text-sm font-bold text-[var(--text-main)]">
              Endpoint Webhook Resmi (Cadangan MacroDroid HP Suami)
            </h3>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-between gap-2 text-xs font-mono">
            <span className="truncate">{webhookUrl}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(webhookUrl, setCopiedUrl)}
              className="p-1 text-[var(--accent-color)] shrink-0"
              title="Salin URL"
            >
              {copiedUrl ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-between gap-2 text-xs font-mono">
            <span className="truncate">X-API-KEY: {apiKeySuami}</span>
            <button
              type="button"
              onClick={() => copyToClipboard(apiKeySuami, setCopiedKeySuami)}
              className="p-1 text-[var(--accent-color)] shrink-0"
              title="Salin Key"
            >
              {copiedKeySuami ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-muted)]">Payload JSON (hp_suami):</span>
              <button
                type="button"
                onClick={() => copyToClipboard(templateJson, setCopiedJson)}
                className="text-[var(--accent-color)] inline-flex items-center gap-1 font-semibold"
              >
                {copiedJson ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedJson ? 'Tersalin' : 'Salin JSON'}</span>
              </button>
            </div>
            <pre className="p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs font-mono overflow-x-auto">
              {templateJson}
            </pre>
          </div>

          <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2">
            <Bot className="w-4 h-4 shrink-0" />
            <span>
              Untuk memindai foto nota / struk belanja langsung dari HP, kirimkan foto ke Bot Telegram keluarga.
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
