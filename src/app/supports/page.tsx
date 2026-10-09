'use client';

// ==============================================================================
// SUPPORTS PAGE: src/app/supports/page.tsx
// Halaman Pusat Bantuan, Monitoring HP Suami & Istri, Simulator Webhook,
// serta Panduan Langkah-demi-Langkah MacroDroid di Android
// ==============================================================================

import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Play,
  HelpCircle,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  SlidersHorizontal,
  Send,
  Zap,
  Info,
  CheckCheck,
} from 'lucide-react';

export default function SupportsPage() {
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [copiedKeySuami, setCopiedKeySuami] = useState(false);
  const [copiedKeyIstri, setCopiedKeyIstri] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Status Perangkat
  const [suamiLastSeen, setSuamiLastSeen] = useState<string | null>(null);
  const [istriLastSeen, setIstriLastSeen] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Simulator State
  const [simApp, setSimApp] = useState('Bank Jago');
  const [simDevice, setSimDevice] = useState<'hp_suami' | 'hp_istri'>('hp_suami');
  const [simDirection, setSimDirection] = useState<'out' | 'in'>('out');
  const [simAmount, setSimAmount] = useState('45000');
  const [simMerchant, setSimMerchant] = useState('Kopi Kenangan');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  // Fetch Heartbeat HP dari raw_notifications
  const fetchDeviceHealth = async () => {
    if (!isSupabaseConfigured()) return;
    setLoadingHealth(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, display_name')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setUserRole(profile.role);
          setDisplayName(profile.display_name);
        }
      }

      // Cari notifikasi terakhir untuk hp_suami
      const { data: lastSuami } = await supabase
        .from('raw_notifications')
        .select('created_at')
        .eq('device_id', 'hp_suami')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSuami) setSuamiLastSeen(lastSuami.created_at);

      // Cari notifikasi terakhir untuk hp_istri
      const { data: lastIstri } = await supabase
        .from('raw_notifications')
        .select('created_at')
        .eq('device_id', 'hp_istri')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastIstri) setIstriLastSeen(lastIstri.created_at);
    } catch (e) {
      console.warn('Gagal memuat status perangkat:', e);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    fetchDeviceHealth();
  }, []);

  const apiKeySuami = process.env.NEXT_PUBLIC_API_KEY_SUAMI || 'mock_dev_key_suami';
  const apiKeyIstri = process.env.NEXT_PUBLIC_API_KEY_ISTRI || 'mock_dev_key_istri';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://[PROJECT_ID].supabase.co';
  const webhookUrl = `${supabaseUrl}/functions/v1/notification-catcher`;

  const templateJson = `{
  "device_id": "hp_suami",
  "app_name": "[not_app_name]",
  "title": "[not_title]",
  "text": "[not_text]",
  "received_at": [system_time_ms]
}`;

  const copyToClipboard = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // Kirim Notifikasi Tiruan ke Webhook
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSimulating(true);
    setSimResult(null);

    try {
      const amtNum = parseInt(simAmount.replace(/[^0-9]/g, ''), 10) || 50000;
      const formattedAmt = amtNum.toLocaleString('id-ID');
      const nowMs = Date.now();

      let title = simApp;
      let text = '';

      if (simApp === 'Bank Jago') {
        if (simDirection === 'out') {
          text = `Uang keluar sebesar Rp ${formattedAmt} ke ${simMerchant} berhasil dikirim.`;
        } else {
          text = `Uang masuk sebesar Rp ${formattedAmt} dari ${simMerchant} berhasil diterima.`;
        }
      } else if (simApp === "Mandiri Livin'") {
        if (simDirection === 'out') {
          title = 'Transaksi Berhasil';
          text = `Pembayaran QRIS Rp ${formattedAmt} di ${simMerchant} berhasil.`;
        } else {
          title = 'Transfer Masuk';
          text = `Dana sebesar Rp ${formattedAmt} telah masuk ke rekening Anda dari ${simMerchant}.`;
        }
      } else {
        if (simDirection === 'out') {
          text = `Pembayaran sebesar Rp ${formattedAmt} ke ${simMerchant} berhasil.`;
        } else {
          text = `Top up atau transfer masuk Rp ${formattedAmt} berhasil.`;
        }
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': simDevice === 'hp_suami' ? apiKeySuami : apiKeyIstri,
        },
        body: JSON.stringify({
          device_id: simDevice,
          app_name: simApp,
          title,
          text,
          received_at: nowMs,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        setSimResult(`Berhasil (HTTP ${res.status}): Notifikasi tiruan berhasil dicatat! Buka Tab Transactions/Inbox untuk melihat.`);
        fetchDeviceHealth();
      } else {
        setSimResult(`Gagal (HTTP ${res.status}): ${resData.error || resData.message || 'Periksa konfigurasi webhook'}`);
      }
    } catch (err: any) {
      setSimResult('Error saat mengirim: ' + (err.message || err));
    } finally {
      setIsSimulating(false);
    }
  };

  const formatLastSeen = (isoStr: string | null) => {
    if (!isoStr) return 'Belum ada sinyal';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WIB';
    } catch {
      return isoStr;
    }
  };

  return (
    <AppShell userRole={userRole} displayName={displayName} pendingCount={0}>
      <div className="space-y-6 max-w-4xl pb-12">
        {/* Header Supports */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-heading">
            <span className="font-extrabold text-[var(--text-main)]">Pusat</span>{' '}
            <span className="font-semibold italic text-[var(--text-accent-italic)]">Bantuan & Monitoring</span>
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
            Panduan lengkap MacroDroid Android, status sinyal HP Suami & Istri, serta simulator webhook
          </p>
        </div>

        {/* 1. KARTU MONITORING KONEKSI HP SUAMI & HP ISTRI: Surface-1 */}
        <div className="rounded-3xl p-5 sm:p-6 bg-[var(--surface-1)] border border-[var(--border-color)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)]">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[var(--text-main)]">
                  Status Koneksi HP Android
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                  Aktivitas pengiriman notifikasi MacroDroid ke database
                </span>
              </div>
            </div>

            <button
              onClick={fetchDeviceHealth}
              className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--surface-2)] transition-colors"
              title="Perbarui status sinyal"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHealth ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* HP Suami */}
            <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👨</span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text-main)]">
                      HP Suami (Kepala Keluarga)
                    </h4>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">id: hp_suami</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    suamiLastSeen
                      ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/30'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${suamiLastSeen ? 'bg-[#198754]' : 'bg-amber-500'}`} />
                  {suamiLastSeen ? 'Terkoneksi' : 'Menunggu Sinyal'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-[var(--border-color)]/60">
                Terakhir kirim: <strong className="text-[var(--text-main)]">{formatLastSeen(suamiLastSeen)}</strong>
              </p>
            </div>

            {/* HP Istri */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-[var(--border-color)]/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👩</span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-[var(--text-main)]">
                      HP Istri
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">id: hp_istri</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    istriLastSeen
                      ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/30'
                      : 'bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${istriLastSeen ? 'bg-[#198754]' : 'bg-[#007a33]'}`} />
                  {istriLastSeen ? 'Terkoneksi' : 'Siap Dihubungkan'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-[var(--border-color)]/60">
                Terakhir kirim: <strong className="text-[var(--text-main)]">{formatLastSeen(istriLastSeen)}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* 2. PANDUAN LENGKAP STEP-BY-STEP MACRODROID DI HP ANDROID */}
        <div className="rounded-3xl p-5 sm:p-6 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)] font-heading">
                Panduan Setup MacroDroid Langkah-demi-Langkah
              </h3>
              <p className="text-xs text-[#007a33]">
                Ikuti 4 langkah mudah ini di HP Android Suami dan Istri
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-[var(--text-main)]">
            {/* LANGKAH 1: PENGATURAN IZIN ANDROID */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-[var(--border-color)]/80 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#007a33] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  1
                </span>
                <h4 className="font-bold text-[var(--text-main)] text-sm">
                  Prasyarat Sistem Android (Sangat Penting)
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Pasang aplikasi <strong>MacroDroid</strong> dari Google Play Store. Agar MacroDroid tidak dimatikan oleh sistem saat layar HP terkunci:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300 pl-1">
                <li>
                  <strong>Akses Notifikasi (Notification Access)</strong>: Buka Setelan HP &rarr; Aplikasi &rarr; Akses Khusus &rarr; Akses Notifikasi &rarr; Berikan izin ke MacroDroid.
                </li>
                <li>
                  <strong>Baterai Tanpa Batas (Unrestricted Battery)</strong>: Buka Setelan Aplikasi MacroDroid &rarr; Baterai &rarr; Pilih <em>Tidak Dibatasi / Jangan Optimalkan</em>.
                </li>
                <li>
                  <strong>Mulai Otomatis (Autostart)</strong>: Pastikan opsi Autostart aktif dan kunci aplikasi MacroDroid di layar Recent Apps agar selalu berjalan di latar belakang.
                </li>
              </ul>
            </div>

            {/* LANGKAH 2: TRIGGER / PEMICU */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-[var(--border-color)]/80 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#007a33] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </span>
                <h4 className="font-bold text-[var(--text-main)] text-sm">
                  Atur Trigger (Pemicu Notifikasi Bank)
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Di MacroDroid, tekan tombol <strong>Add Macro</strong> (+), lalu tambahkan Trigger:
              </p>
              <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] font-mono text-xs space-y-1">
                <p>1. Tekan tombol (+) merah di bagian <strong>Triggers</strong>.</p>
                <p>2. Pilih: <strong>Device Events</strong> &rarr; <strong>Notification</strong> &rarr; <strong>Notification Received</strong>.</p>
                <p>3. Pilih <strong>Select Application(s)</strong>: Centang aplikasi bank & e-wallet keluarga (Bank Jago, BCA mobile, Mandiri Livin', GoPay, OVO, ShopeePay, Dana).</p>
                <p>4. Pada opsi Text Content: Pilih <strong>Any content</strong>.</p>
              </div>
            </div>

            {/* LANGKAH 3: ACTION / TINDAKAN HTTP POST */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-[var(--border-color)]/80 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#007a33] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  3
                </span>
                <h4 className="font-bold text-[var(--text-main)] text-sm">
                  Atur Action (HTTP Request POST ke Database)
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Di bagian <strong>Actions</strong> (tombol biru +), cari: <strong>Connectivity &rarr; HTTP Request</strong> dengan konfigurasi berikut:
              </p>

              {/* A. URL Webhook */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#007a33] block">
                  A. Method & URL Webhook:
                </span>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] font-mono text-xs">
                  <span className="px-2 py-0.5 rounded bg-[#007a33] text-white font-bold text-[10px]">POST</span>
                  <span className="truncate flex-1 text-[var(--text-main)]">{webhookUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(webhookUrl, setCopiedUrl)}
                    className="p-1 rounded text-[#007a33] hover:text-[#004d00] transition-colors"
                    title="Salin URL"
                  >
                    {copiedUrl ? <CheckCheck className="w-4 h-4 text-[#198754]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* B. Request Headers */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#007a33] block">
                  B. Request Headers (Pilih Header X-API-KEY sesuai HP):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {/* Header Suami */}
                  <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] text-slate-500 block">Untuk HP Suami:</span>
                      <span className="font-bold text-[var(--text-main)] truncate block">X-API-KEY: {apiKeySuami}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`X-API-KEY: ${apiKeySuami}`, setCopiedKeySuami)}
                      className="p-1 rounded text-[#007a33] hover:text-[#004d00]"
                      title="Salin Header Suami"
                    >
                      {copiedKeySuami ? <CheckCheck className="w-4 h-4 text-[#198754]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Header Istri */}
                  <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] text-slate-500 block">Untuk HP Istri:</span>
                      <span className="font-bold text-[var(--text-main)] truncate block">X-API-KEY: {apiKeyIstri}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`X-API-KEY: ${apiKeyIstri}`, setCopiedKeyIstri)}
                      className="p-1 rounded text-[#007a33] hover:text-[#004d00]"
                      title="Salin Header Istri"
                    >
                      {copiedKeyIstri ? <CheckCheck className="w-4 h-4 text-[#198754]" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tambahkan juga header: <code>Content-Type: application/json</code>
                </p>
              </div>

              {/* C. Body JSON */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#007a33]">
                    C. Request Body (JSON Content):
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(templateJson, setCopiedJson)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#007a33] hover:text-[#004d00]"
                  >
                    {copiedJson ? <CheckCheck className="w-3.5 h-3.5 text-[#198754]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedJson ? 'Tersalin' : 'Salin JSON Template'}</span>
                  </button>
                </div>

                <pre className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] font-mono text-xs text-[var(--text-main)] overflow-x-auto leading-relaxed">
{templateJson}
                </pre>
                <p className="text-[11px] text-slate-500">
                  <em>Tips</em>: Ganti <code>"device_id": "hp_suami"</code> menjadi <code>"device_id": "hp_istri"</code> pada HP Istri. Variabel seperti <code>[not_text]</code> dan <code>[system_time_ms]</code> adalah token otomatis MacroDroid (dapat dipilih lewat tombol titik tiga [...] Magic Text).
                </p>
              </div>
            </div>

            {/* LANGKAH 4: TESTING */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/70 border border-[var(--border-color)]/80 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#007a33] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  4
                </span>
                <h4 className="font-bold text-[var(--text-main)] text-sm">
                  Uji Coba Langsung di MacroDroid
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Tekan tanda titik tiga di sebelah kanan aksi HTTP Request di MacroDroid, lalu pilih <strong>Test Action</strong>. Jika berhasil, server akan merespons dengan <strong>HTTP 200</strong> atau <strong>HTTP 201</strong>. Notifikasi akan langsung masuk ke Inbox dasbor Anda.
              </p>
            </div>
          </div>
        </div>

        {/* 3. SIMULATOR WEBHOOK INTERAKTIF */}
        <div className="rounded-3xl p-5 sm:p-6 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2.5 rounded-2xl bg-[var(--bg-main)] text-[#198754] border border-[var(--border-color)]">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-main)] font-heading">
                Simulator Webhook Notifikasi Bank
              </h3>
              <span className="text-xs text-[#007a33]">
                Uji coba pipeline otomatisasi langsung dari browser tanpa perlu transfer uang asli
              </span>
            </div>
          </div>

          <form onSubmit={handleRunSimulation} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-[#007a33] block mb-1">
                  Aplikasi Bank / E-Wallet
                </label>
                <select
                  value={simApp}
                  onChange={(e) => setSimApp(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                >
                  <option value="Bank Jago">Bank Jago</option>
                  <option value="Mandiri Livin'">Mandiri Livin'</option>
                  <option value="BCA">BCA</option>
                  <option value="GoPay">GoPay</option>
                  <option value="OVO">OVO</option>
                  <option value="ShopeePay">ShopeePay</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#007a33] block mb-1">
                  Perangkat Pengirim
                </label>
                <select
                  value={simDevice}
                  onChange={(e) => setSimDevice(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                >
                  <option value="hp_suami">HP Suami (Ajian)</option>
                  <option value="hp_istri">HP Istri</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#007a33] block mb-1">
                  Arah Transaksi
                </label>
                <select
                  value={simDirection}
                  onChange={(e) => setSimDirection(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                >
                  <option value="out">Pengeluaran (Uang Keluar)</option>
                  <option value="in">Pemasukan (Uang Masuk)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#007a33] block mb-1">
                  Nominal (Rp)
                </label>
                <input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)] font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#007a33] block mb-1">
                  Merchant / Lawan Transaksi
                </label>
                <input
                  type="text"
                  value={simMerchant}
                  onChange={(e) => setSimMerchant(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                />
              </div>
            </div>

            {simResult && (
              <div className="p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--text-main)] text-xs leading-relaxed font-mono">
                {simResult}
              </div>
            )}

            <button
              type="submit"
              disabled={isSimulating}
              className="py-3 px-5 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 active:scale-[0.99] text-[var(--bg-main)] text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
            >
              <Send className="w-4 h-4" />
              <span>{isSimulating ? 'Mengirim Notifikasi Tiruan...' : 'Kirim Notifikasi Tiruan Sekarang'}</span>
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
