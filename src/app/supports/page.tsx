'use client';

// ==============================================================================
// SUPPORTS PAGE: src/app/supports/page.tsx
// Halaman Pusat Bantuan, Alur Penggunaan, Status HP, & Simulator Webhook
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
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

export default function SupportsPage() {
  const [userRole, setUserRole] = useState<'suami' | 'istri'>('suami');
  const [displayName, setDisplayName] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState(false);

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

  const apiKeyExample = 'kunci_keuangan_suami_jago_2026_x89q2m9b7z1';

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKeyExample);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
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

      const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notification-catcher`;
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKeyExample,
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
        setSimResult(`Berhasil (HTTP ${res.status}): Notifikasi tiruan berhasil dicatat! Cek Tab Transactions/Inbox.`);
        fetchDeviceHealth();
      } else {
        setSimResult(`Gagal (HTTP ${res.status}): ${resData.error || resData.message || 'Cek console'}`);
      }
    } catch (err: any) {
      setSimResult('Error kirim webhook: ' + (err.message || err));
    } finally {
      setIsSimulating(false);
    }
  };

  const formatLastSeen = (isoStr: string | null) => {
    if (!isoStr) return 'Belum pernah terhubung';
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
      <div className="space-y-6 max-w-4xl">
        {/* Header Supports */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Pusat Bantuan & Monitoring (Supports)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Panduan teknis, status koneksi HP MacroDroid, dan simulator pengujian webhook
          </p>
        </div>

        {/* 1. KARTU MONITORING KONEKSI HP SUAMI & HP ISTRI */}
        <div className="rounded-3xl p-5 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-main)]">
                  Status Koneksi Perangkat HP
                </h3>
                <span className="text-[11px] text-[#007a33]">
                  Aktivitas pengiriman notifikasi MacroDroid ke database
                </span>
              </div>
            </div>

            <button
              onClick={fetchDeviceHealth}
              className="p-1.5 rounded-lg text-[#007a33] hover:text-[#004d00] hover:bg-[var(--bg-main)] transition-colors"
              title="Perbarui status sinyal"
            >
              <RefreshCw className={`w-4 h-4 ${loadingHealth ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* HP Suami */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">👨</span>
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    HP Suami (hp_suami)
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    suamiLastSeen
                      ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/30'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${suamiLastSeen ? 'bg-[#198754]' : 'bg-amber-500'}`} />
                  {suamiLastSeen ? 'Terkoneksi' : 'Siap Hubungkan'}
                </span>
              </div>
              <p className="text-[11px] text-[#007a33]">
                Terakhir kirim sinyal: <strong className="text-[var(--text-main)]">{formatLastSeen(suamiLastSeen)}</strong>
              </p>
            </div>

            {/* HP Istri */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">👩</span>
                  <span className="text-xs font-bold text-[var(--text-main)]">
                    HP Istri (hp_istri)
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    istriLastSeen
                      ? 'bg-[#e8f5e9] text-[#198754] border border-[#198754]/30'
                      : 'bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${istriLastSeen ? 'bg-[#198754]' : 'bg-[#007a33]'}`} />
                  {istriLastSeen ? 'Terkoneksi' : 'Menunggu Setup'}
                </span>
              </div>
              <p className="text-[11px] text-[#007a33]">
                Terakhir kirim sinyal: <strong className="text-[var(--text-main)]">{formatLastSeen(istriLastSeen)}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* 2. SIMULATOR WEBHOOK INTERAKTIF */}
        <div className="rounded-3xl p-5 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-2 rounded-xl bg-[var(--bg-main)] text-[#198754] border border-[var(--border-color)]">
              <Play className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">
                Simulator Webhook Notifikasi Bank
              </h3>
              <span className="text-[11px] text-[#007a33]">
                Uji coba pipeline otomatisasi tanpa perlu transfer uang asli
              </span>
            </div>
          </div>

          <form onSubmit={handleRunSimulation} className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#007a33] block mb-1">
                  Aplikasi Bank / E-Wallet
                </label>
                <select
                  value={simApp}
                  onChange={(e) => setSimApp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
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
                <label className="text-[11px] font-bold text-[#007a33] block mb-1">
                  Perangkat Pengirim
                </label>
                <select
                  value={simDevice}
                  onChange={(e) => setSimDevice(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                >
                  <option value="hp_suami">HP Suami</option>
                  <option value="hp_istri">HP Istri</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#007a33] block mb-1">
                  Arah Transaksi
                </label>
                <select
                  value={simDirection}
                  onChange={(e) => setSimDirection(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                >
                  <option value="out">Pengeluaran (Uang Keluar)</option>
                  <option value="in">Pemasukan (Uang Masuk)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#007a33] block mb-1">
                  Nominal (Rp)
                </label>
                <input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#007a33] block mb-1">
                  Merchant / Lawan Transaksi
                </label>
                <input
                  type="text"
                  value={simMerchant}
                  onChange={(e) => setSimMerchant(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                />
              </div>
            </div>

            {simResult && (
              <div className="p-3 rounded-2xl bg-[var(--bg-main)]/80 border border-[var(--border-color)] text-[var(--text-main)] text-xs">
                {simResult}
              </div>
            )}

            <button
              type="submit"
              disabled={isSimulating}
              className="py-2.5 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] text-xs font-bold transition-all shadow-xs flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isSimulating ? 'Mengirim Simulasi...' : 'Kirim Notifikasi Tiruan Sekarang'}</span>
            </button>
          </form>
        </div>

        {/* 3. PANDUAN RINGKAS SETUP HP ISTRI & MACRODROID */}
        <div className="rounded-3xl p-5 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-xs space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)]">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-main)]">
                Panduan Setup HP Istri & MacroDroid
              </h3>
              <span className="text-[11px] text-[#007a33]">
                Cara menghubungkan HP Istri agar otomatis sinkron ke dashboard
              </span>
            </div>
          </div>

          <div className="space-y-2.5 text-xs text-[var(--text-main)]">
            <div className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70">
              <strong className="text-[var(--text-main)] block mb-1">
                Langkah 1: Pasang MacroDroid di HP Istri
              </strong>
              Download aplikasi MacroDroid dari Google Play Store di HP Istri, lalu berikan izin:
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-[#007a33]">
                <li>Akses Notifikasi (Notification Access)</li>
                <li>Abaikan Penghemat Baterai (Unrestricted Battery)</li>
                <li>Mulai Otomatis di Latar Belakang (Autostart)</li>
              </ul>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70">
              <strong className="text-[var(--text-main)] block mb-1">
                Langkah 2: Gunakan X-API-KEY yang Sama
              </strong>
              Di tindakan Permintaan HTTP MacroDroid, tambahkan header:
              <div className="flex items-center gap-2 mt-1.5 p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] font-mono text-[11px]">
                <span className="truncate flex-1 text-[var(--text-main)]">X-API-KEY: {apiKeyExample}</span>
                <button
                  onClick={handleCopyKey}
                  className="p-1 rounded text-[#007a33] hover:text-[#004d00]"
                  title="Salin Kunci"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-[#198754]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/70">
              <strong className="text-[var(--text-main)] block mb-1">
                Langkah 3: Body JSON Parameter
              </strong>
              Kirim JSON dengan parameter:
              <pre className="p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] mt-1 font-mono text-[11px] overflow-x-auto text-[var(--text-main)]">
{`{
  "device_id": "hp_istri",
  "app_name": "[not_app_name]",
  "title": "[not_title]",
  "text": "[not_text]",
  "received_at": [system_time_ms]
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
