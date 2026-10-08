'use client';

// ==============================================================================
// LOGIN PAGE: src/app/login/page.tsx
// Halaman Otentikasi Pengguna: Desain Minimalis & Profesional
// ==============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, ShieldCheck, ArrowRight, Loader2, User } from 'lucide-react';
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

  const handleQuickLogin = async (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    setLoading(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: quickEmail,
      password: quickPass,
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
    <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full px-4 py-12">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--bg-main)] text-[#007a33] border border-[var(--border-color)] shadow-xs mb-3">
          <Wallet className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-main)] font-heading">
          Keluarga Ajian
        </h1>
        <p className="text-xs text-[#007a33] font-medium mt-1">
          Akses Masuk Dashboard Suami & Istri
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-[var(--bg-card)] rounded-3xl p-6 shadow-xs border border-[var(--border-color)]">
        <div className="flex items-center gap-2 mb-5 text-xs font-semibold text-[#007a33]">
          <ShieldCheck className="w-4 h-4 text-[#198754]" />
          <span>Autentikasi Terproteksi</span>
        </div>

        {/* 1-Tap Akses Cepat */}
        <div className="mb-5 p-3 rounded-2xl bg-[var(--bg-main)]/60 border border-[var(--border-color)]/80">
          <span className="text-[11px] font-bold text-[#007a33] block mb-2">
            Pilih Akun Demo:
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('suami@keluarga.com', 'password123')}
              className="py-2 px-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-main)] text-xs font-semibold text-[var(--text-main)] border border-[var(--border-color)] transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <User className="w-3.5 h-3.5 text-[#007a33]" />
              <span>Suami</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('istri@keluarga.com', 'password123')}
              className="py-2 px-3 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-main)] text-xs font-semibold text-[var(--text-main)] border border-[var(--border-color)] transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <User className="w-3.5 h-3.5 text-[#007a33]" />
              <span>Istri</span>
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-[#fde8ea] border border-[#DC3545]/30 text-[#DC3545] text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="suami@keluarga.com"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[#007a33]/30 transition-colors text-[var(--text-main)] placeholder:text-[#007a33]/50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#007a33] mb-1.5">
              Kata Sandi
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[#007a33]/30 transition-colors text-[var(--text-main)] placeholder:text-[#007a33]/50"
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-[var(--bg-main)] font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-70 shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <span>Masuk ke Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
