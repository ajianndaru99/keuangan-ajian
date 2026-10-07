'use client';

// ==============================================================================
// LOGIN PAGE: src/app/login/page.tsx
// Halaman otentikasi Supabase Auth — Soft Pastel Liquid Glass
// ==============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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

  return (
    <div className="flex-1 flex flex-col justify-center px-6 py-12">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-sky-400 via-sky-300 to-indigo-300 text-white shadow-lg shadow-sky-400/25 border border-white/60 mb-3">
          <Wallet className="w-8 h-8 text-white drop-shadow-sm" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">
          Keuangan Keluarga
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Rekap & Pemetaan Pengeluaran Digital Suami & Istri
        </p>
      </div>

      {/* Login Card — Frosted Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 shadow-xl border border-white/80 dark:border-white/10">
        <div className="flex items-center gap-2 mb-6 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
          <ShieldCheck className="w-4 h-4" />
          <span>Akses Masuk Terproteksi</span>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl liquid-pill bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 text-xs font-medium">
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
              placeholder="suami@keluarga.com"
              required
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/60 dark:bg-black/30 border border-white/80 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all text-slate-800 dark:text-white"
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
              className="w-full px-4 py-2.5 rounded-2xl liquid-pill bg-white/60 dark:bg-black/30 border border-white/80 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all text-slate-800 dark:text-white"
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 hover:from-sky-500 hover:to-indigo-600 active:scale-[0.99] text-white font-semibold text-sm shadow-md shadow-sky-400/25 flex items-center justify-center gap-2 transition-all disabled:opacity-70 border border-white/30"
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
      </div>
    </div>
  );
}
