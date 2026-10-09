'use client';

// ==============================================================================
// LOGIN / WELCOME PAGE: src/app/login/page.tsx
// Halaman Selamat Datang Keluarga Ajian
// - Pemilihan Profil Cepat 1-Ketuk (Kepala Keluarga / Istri)
// - Menggunakan Foto Avatar Kustom Asli Keluarga
// - Sandi Angka 6 Digit (Tanpa Input Email / Username)
// ==============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet,
  ShieldCheck,
  ArrowRight,
  Loader2,
  UserCheck,
  Eye,
  EyeOff,
  Sparkles,
  HeartHandshake,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type FamilyRole = 'suami' | 'istri';

interface RoleProfile {
  id: FamilyRole;
  label: string;
  name: string;
  subtitle: string;
  email: string;
  avatarImg: string;
}

const familyProfiles: RoleProfile[] = [
  {
    id: 'suami',
    label: 'Kepala Keluarga',
    name: 'Kepala Keluarga',
    subtitle: 'Akun Utama',
    email: 'suami@keluarga.com',
    avatarImg: '/avatars/suami.png',
  },
  {
    id: 'istri',
    label: 'Istri',
    name: 'Istri',
    subtitle: 'Bendahara Keluarga',
    email: 'istri@keluarga.com',
    avatarImg: '/avatars/istri.png',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<FamilyRole>('suami');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Opsi input kustom jika sewaktu-waktu ingin akun berbeda
  const [showCustomEmail, setShowCustomEmail] = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  const currentProfile = familyProfiles.find((p) => p.id === selectedRole)!;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMessage('Silakan masukkan kata sandi.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const emailToUse = showCustomEmail && customEmail.trim() ? customEmail.trim() : currentProfile.email;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: password.trim(),
      });

      if (error) {
        if (error.message === 'Invalid login credentials') {
          setErrorMessage(`Kata sandi untuk ${currentProfile.name} belum sesuai.`);
        } else {
          setErrorMessage(error.message);
        }
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi gangguan jaringan.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:py-12 bg-[var(--bg-main)] text-[var(--text-main)]">
      <div className="w-full max-w-md mx-auto">
        {/* Brand & Greeting Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--surface-1)] text-[var(--accent-color)] border border-[var(--border-color)] shadow-xs mb-3">
            <Wallet className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Keluarga Ajian</span>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading tracking-tight">
            <span className="font-extrabold text-[var(--text-main)]">Selamat</span>{' '}
            <span className="font-semibold italic text-[var(--text-accent-italic)]">Datang</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] font-medium mt-1">
            Pilih profil Anda untuk masuk ke sistem dashboard
          </p>
        </div>

        {/* Card Form: Surface-1 */}
        <div className="bg-[var(--surface-1)] rounded-3xl p-5 sm:p-7 shadow-xs border border-[var(--border-color)]">
          {/* Label Pemilihan Profil */}
          <div className="flex items-center justify-between mb-3 text-xs font-bold text-[var(--text-muted)]">
            <span>Pilih Profil Masuk:</span>
            <span className="text-[11px] font-normal text-[var(--text-muted)] flex items-center gap-1">
              <HeartHandshake className="w-3.5 h-3.5 text-[var(--color-income)]" />
              Keluarga Ajian
            </span>
          </div>

          {/* Profil Selector dengan Ilustrasi Foto Avatar Asli */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {familyProfiles.map((p) => {
              const isSelected = selectedRole === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedRole(p.id);
                    setErrorMessage(null);
                    setPassword('');
                  }}
                  className={`relative p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--surface-2)] border-[var(--accent-color)] shadow-xs ring-2 ring-[var(--accent-color)]/25'
                      : 'bg-[var(--surface-2)]/50 border-[var(--border-color)] hover:border-[var(--accent-color)]/40 opacity-70 hover:opacity-100'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2.5 right-2.5 p-0.5 rounded-full bg-[var(--color-income)] text-white shadow-xs">
                      <UserCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {/* Foto Avatar */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[var(--surface-1)] border-2 border-[var(--border-color)] shadow-xs">
                    <img
                      src={p.avatarImg}
                      alt={p.name}
                      width={80}
                      height={80}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      className="w-full h-full object-cover dark:brightness-90 dark:contrast-[0.98]"
                    />
                  </div>
                  <div className="text-center pt-0.5">
                    <span className="text-sm font-bold text-[var(--text-main)] block leading-tight">
                      {p.name}
                    </span>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] block mt-0.5">
                      {p.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Feedback Error: Desaturated WCAG AA Alert */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-[var(--color-expense)]/10 border border-[var(--color-expense)]/30 text-[var(--color-expense)] text-xs font-semibold leading-relaxed">
              {errorMessage}
            </div>
          )}

          {/* Form Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Input Password Utama */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[var(--text-main)]" htmlFor="account-password">
                  Kata Sandi {currentProfile.name}
                </label>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  6 Digit Angka
                </span>
              </div>
              <div className="relative">
                <input
                  id="account-password"
                  type={showPassword ? 'text' : 'password'}
                  inputMode="numeric"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan sandi..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-3 pr-11 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/30 transition-colors text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                  aria-label={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Opsi Opsional Email Kustom */}
            {showCustomEmail && (
              <div className="pt-1">
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                  Email Khusus (Opsional)
                </label>
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder={currentProfile.email}
                  className="w-full px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            )}

            {/* Tombol Masuk */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-[var(--accent-color)] hover:opacity-90 active:scale-[0.99] text-white dark:text-[#121218] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-xs cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi Sandi...</span>
                </>
              ) : (
                <>
                  <span>Masuk sebagai {currentProfile.name}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer Card */}
          <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
              <span>Privasi Terproteksi</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomEmail(!showCustomEmail)}
              className="text-[var(--accent-color)] hover:underline text-[10px]"
            >
              {showCustomEmail ? 'Sembunyikan Opsi Email' : 'Gunakan Akun Kustom'}
            </button>
          </div>
        </div>

        {/* Catatan Bantuan Bawah */}
        <p className="text-center text-[11px] text-[var(--text-muted)] mt-4">
          Dashboard otomatis mencatat notifikasi bank & bukti transfer dompet keluarga.
        </p>
      </div>
    </div>
  );
}
