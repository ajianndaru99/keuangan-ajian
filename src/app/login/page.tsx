'use client';

// ==============================================================================
// LOGIN / WELCOME PAGE: src/app/login/page.tsx
// Autentikasi Tunggal Akun Utama (Suami):
// - Login Google OAuth (otomatis membuat & menyambungkan Google Spreadsheet)
// - Login Email (Magic Link / Sandi)
// - Keypad PIN 6 Digit & Sidik Jari / Biometrik Perangkat
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  Mail,
  FileSpreadsheet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import PinKeypad from '@/components/auth/PinKeypad';
import BrandLogo from '@/components/layout/BrandLogo';
import { checkBiometricsAvailability, authenticateWithBiometrics } from '@/lib/auth/biometrics';

const SUAMI_PROFILE = {
  id: 'suami',
  label: 'Akun Utama Keluarga',
  name: 'Kepala Keluarga (Suami)',
  email: 'suami@keluarga.com',
  avatarImg: '/avatars/suami.png',
};

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  const [inputMode, setInputMode] = useState<'pin' | 'email'>('pin');
  const [emailInput, setEmailInput] = useState('');
  const [textPassword, setTextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    checkBiometricsAvailability().then((res) => {
      setHasBiometrics(res.available);
    });
  }, []);

  const handleBiometricLogin = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const success = await authenticateWithBiometrics(
      'Masuk ke Dasbor Keuangan',
      `Verifikasi sidik jari untuk ${SUAMI_PROFILE.name}`
    );
    if (success) {
      router.push('/');
      router.refresh();
    } else {
      setLoading(false);
    }
  }, [router]);

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) {
        setErrorMessage(error.message);
        setGoogleLoading(false);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memulai login Google.');
      setGoogleLoading(false);
    }
  };

  const handlePinSubmit = async (enteredPin: string) => {
    setLoading(true);
    setErrorMessage(null);
    const emailToUse = emailInput.trim() || SUAMI_PROFILE.email;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: enteredPin,
      });

      if (error) {
        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'PIN atau kata sandi belum sesuai.'
            : error.message
        );
        setPin('');
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Terjadi gangguan jaringan.');
      setPin('');
      setLoading(false);
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textPassword.trim()) {
      setErrorMessage('Silakan masukkan kata sandi atau kirim Link Login Email.');
      return;
    }
    await handlePinSubmit(textPassword.trim());
  };

  const handleMagicLink = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes('@')) {
      setErrorMessage('Masukkan alamat email yang valid terlebih dahulu.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setMagicSent(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setMagicSent(true);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengirim link login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-6 sm:py-10 bg-[var(--bg-main)] text-[var(--text-main)]">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-5">
          <div className="mb-2.5 flex justify-center">
            <BrandLogo size="lg" />
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-[var(--text-main)] tracking-tight">
            Dashboard Keuangan Keluarga
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
            Monitoring Grafik &amp; Perputaran Kas — Kontrol Penuh via Telegram
          </p>
        </div>

        <div className="bg-[var(--surface-1)] rounded-3xl p-5 sm:p-6 shadow-xs border border-[var(--border-color)] space-y-4">
          {/* Profil Tunggal Suami */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)]">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[var(--surface-1)] border border-[var(--border-color)] shrink-0">
              <img
                src={SUAMI_PROFILE.avatarImg}
                alt={SUAMI_PROFILE.name}
                width={48}
                height={48}
                className="w-full h-full object-cover dark:brightness-90"
              />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-[var(--text-main)] block truncate">
                {SUAMI_PROFILE.name}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block">
                {SUAMI_PROFILE.label}
              </span>
            </div>
          </div>

          {/* Login Google OAuth (Auto-Connect Google Spreadsheet) */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full py-3 px-4 rounded-2xl bg-[var(--surface-2)] hover:border-[var(--accent-color)] border border-[var(--border-color)] font-bold text-xs text-[var(--text-main)] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-[var(--color-income)]" />
            )}
            <span>Masuk dengan Google (Hubungkan Spreadsheet)</span>
          </button>

          <div className="relative flex items-center py-0.5">
            <div className="flex-grow border-t border-[var(--border-color)]" />
            <span className="mx-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              atau
            </span>
            <div className="flex-grow border-t border-[var(--border-color)]" />
          </div>

          {inputMode === 'pin' ? (
            <div>
              <div className="text-center mb-1">
                <span className="text-xs font-bold text-[var(--text-main)]">
                  Masukkan PIN 6 Digit
                </span>
              </div>

              <PinKeypad
                value={pin}
                onChange={(val) => {
                  setPin(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                onComplete={handlePinSubmit}
                disabled={loading}
                loading={loading}
                error={errorMessage}
                showBiometrics={hasBiometrics}
                onBiometricsClick={handleBiometricLogin}
              />

              <div className="text-center mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInputMode('email');
                  }}
                  className="text-[11px] text-[var(--accent-color)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Masuk dengan Email / Kata Sandi</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleEmailPasswordLogin} className="space-y-3">
              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-[var(--color-expense)]/10 border border-[var(--color-expense)]/30 text-[var(--color-expense)] text-xs font-semibold">
                  {errorMessage}
                </div>
              )}

              {magicSent && (
                <div className="p-2.5 rounded-xl bg-[var(--color-income)]/10 border border-[var(--color-income)]/30 text-[var(--color-income)] text-xs font-semibold">
                  Link login telah dikirim ke email Anda. Periksa inbox untuk masuk.
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[var(--text-main)] block mb-1" htmlFor="login-email">
                  Alamat Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={SUAMI_PROFILE.email}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm text-[var(--text-main)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-main)] block mb-1" htmlFor="text-password">
                  Kata Sandi (opsional jika pakai Link Email)
                </label>
                <div className="relative">
                  <input
                    id="text-password"
                    type={showPassword ? 'text' : 'password'}
                    value={textPassword}
                    onChange={(e) => setTextPassword(e.target.value)}
                    placeholder="Masukkan sandi..."
                    className="w-full px-3.5 py-2.5 pr-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm font-mono text-[var(--text-main)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="py-2.5 px-3 rounded-xl bg-[var(--accent-color)] hover:opacity-90 text-white dark:text-[#121218] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  <span>Masuk Sandi</span>
                </button>
                <button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={loading}
                  className="py-2.5 px-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] font-bold text-xs text-[var(--text-main)] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Kirim Link Email</span>
                </button>
              </div>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setInputMode('pin');
                  }}
                  className="text-[11px] text-[var(--accent-color)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Kembali ke Keypad PIN</span>
                </button>
              </div>
            </form>
          )}

          <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
              <span>Akun Tunggal Suami • RLS Aktif</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
