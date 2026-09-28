'use client';

// ==============================================================================
// LOGIN PAGE: src/app/login/page.tsx
// Halaman otentikasi Supabase Auth untuk Suami & Istri
// ==============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Wallet, ShieldCheck, ArrowRight, Loader2, HeartHandshake } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      setErrorMessage(
        error.message === 'Invalid login credentials'
          ? 'Email atau kata sandi tidak cocok. Silakan periksa kembali.'
          : error.message
      );
      setLoading(false);
    } else {
      router.push('/inbox');
      router.refresh();
    }
  };

  // Helper cepat untuk mengisi akun pengujian
  const setPreset = (presetEmail: string) => {
    setEmail(presetEmail);
    setPassword('password123');
    setErrorMessage(null);
  };

  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-12">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 mb-4">
          <Wallet className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Keuangan Keluarga
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Rekap & Pemetaan Notifikasi Otomatis Suami & Istri
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white dark:bg-slate-800/80 rounded-3xl p-6 shadow-xl border border-slate-200/80 dark:border-slate-700/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-6 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Akses Masuk Terproteksi</span>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Email Pengguna
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contoh: suami@keluarga.com"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Kata Sandi
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-semibold text-sm shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-70"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>Masuk ke Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Preset Cepat untuk Pengujian */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700/60">
          <p className="text-[11px] text-center font-medium text-slate-400 mb-2.5 flex items-center justify-center gap-1">
            <HeartHandshake className="w-3.5 h-3.5 text-indigo-400" />
            Pilih Akun Cepat (Uji Coba):
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPreset('suami@keluarga.com')}
              className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-slate-300 text-xs font-medium border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
            >
              👨 Akun Suami
            </button>
            <button
              type="button"
              onClick={() => setPreset('istri@keluarga.com')}
              className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-slate-700 dark:text-slate-300 text-xs font-medium border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
            >
              👩 Akun Istri
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
