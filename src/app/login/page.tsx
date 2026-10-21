'use client';

// ==============================================================================
// LOGIN / WELCOME PAGE: src/app/login/page.tsx
// Halaman Selamat Datang & Masuk Keluarga
// - Pemilihan Profil Cepat 1-Ketuk (Kepala Keluarga / Istri)
// - Keypad PIN Angka 6 Digit Virtual Responsif (Mobile-first)
// - Sensor Sidik Jari / Biometrik Bawaan Ponsel (Infinix, Samsung, Chrome/Safari)
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet,
  ShieldCheck,
  UserCheck,
  Sparkles,
  HeartHandshake,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import PinKeypad from '@/components/auth/PinKeypad';
import { checkBiometricsAvailability, authenticateWithBiometrics } from '@/lib/auth/biometrics';

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
    subtitle: 'Akun Utama (Infinix Note 30 Pro)',
    email: 'suami@keluarga.com',
    avatarImg: '/avatars/suami.png',
  },
  {
    id: 'istri',
    label: 'Istri',
    name: 'Istri',
    subtitle: 'Bendahara (Samsung Galaxy A52)',
    email: 'istri@keluarga.com',
    avatarImg: '/avatars/istri.png',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<FamilyRole>('suami');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  // Mode input alternatif (jika menggunakan sandi teks panjang)
  const [inputMode, setInputMode] = useState<'pin' | 'text'>('pin');
  const [textPassword, setTextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCustomEmail, setShowCustomEmail] = useState(false);
  const [customEmail, setCustomEmail] = useState('');

  const currentProfile = familyProfiles.find((p) => p.id === selectedRole)!;

  // Cek ketersediaan sensor biometrik di perangkat
  useEffect(() => {
    checkBiometricsAvailability().then((res) => {
      setHasBiometrics(res.available);
    });
  }, []);

  // Eksekusi Autentikasi Biometrik
  const handleBiometricLogin = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const success = await authenticateWithBiometrics(
      'Masuk ke Dasbor Keuangan',
      `Verifikasi sidik jari untuk ${currentProfile.name}`
    );

    if (success) {
      // Masuk otomatis
      router.push('/');
      router.refresh();
    } else {
      setLoading(false);
    }
  }, [currentProfile.name, router]);

  // Eksekusi Login via PIN 6-Digit
  const handlePinSubmit = async (enteredPin: string) => {
    setLoading(true);
    setErrorMessage(null);

    const emailToUse = showCustomEmail && customEmail.trim() ? customEmail.trim() : currentProfile.email;

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: enteredPin,
      });

      if (error) {
        if (error.message === 'Invalid login credentials') {
          setErrorMessage(`PIN untuk ${currentProfile.name} belum sesuai.`);
        } else {
          setErrorMessage(error.message);
        }
        setPin('');
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Terjadi gangguan jaringan.');
      setPin('');
      setLoading(false);
    }
  };

  // Eksekusi Login via Sandi Teks
  const handleTextPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textPassword.trim()) {
      setErrorMessage('Silakan masukkan kata sandi.');
      return;
    }
    await handlePinSubmit(textPassword.trim());
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-6 sm:py-10 bg-[var(--bg-main)] text-[var(--text-main)]">
      <div className="w-full max-w-md mx-auto">
        {/* Brand & Greeting Header */}
        <div className="text-center mb-5 sm:mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[var(--surface-1)] text-[var(--accent-color)] border border-[var(--border-color)] shadow-xs mb-2.5">
            <Wallet className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] mb-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Keluarga Ajian</span>
            </div>
          </div>
          <h1 className="text-xl sm:text-2xl font-heading tracking-tight">
            <span className="font-extrabold text-[var(--text-main)]">Selamat</span>{' '}
            <span className="font-semibold italic text-[var(--text-accent-italic)]">Datang</span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5">
            Pilih profil Anda untuk masuk ke sistem dasbor
          </p>
        </div>

        {/* Card Form: Surface-1 */}
        <div className="bg-[var(--surface-1)] rounded-3xl p-5 sm:p-6 shadow-xs border border-[var(--border-color)]">
          {/* Label Pemilihan Profil */}
          <div className="flex items-center justify-between mb-3 text-xs font-bold text-[var(--text-muted)]">
            <span>Pilih Profil Masuk:</span>
            <span className="text-[11px] font-normal text-[var(--text-muted)] flex items-center gap-1">
              <HeartHandshake className="w-3.5 h-3.5 text-[var(--color-income)]" />
              Keluarga Ajian
            </span>
          </div>

          {/* Profil Selector dengan Ilustrasi Foto Avatar Asli */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {familyProfiles.map((p) => {
              const isSelected = selectedRole === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedRole(p.id);
                    setErrorMessage(null);
                    setPin('');
                    setTextPassword('');
                  }}
                  className={`relative p-3 rounded-2xl border text-left transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--surface-2)] border-[var(--accent-color)] shadow-xs ring-2 ring-[var(--accent-color)]/25'
                      : 'bg-[var(--surface-2)]/50 border-[var(--border-color)] hover:border-[var(--accent-color)]/40 opacity-70 hover:opacity-100'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 p-0.5 rounded-full bg-[var(--color-income)] text-white shadow-xs">
                      <UserCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {/* Foto Avatar */}
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-[var(--surface-1)] border-2 border-[var(--border-color)] shadow-xs">
                    <img
                      src={p.avatarImg}
                      alt={p.name}
                      width={64}
                      height={64}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      className="w-full h-full object-cover dark:brightness-90"
                    />
                  </div>
                  <div className="text-center pt-0.5">
                    <span className="text-xs sm:text-sm font-bold text-[var(--text-main)] block leading-tight">
                      {p.name}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                      {p.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Mode PIN Keypad (Default & Cepat) */}
          {inputMode === 'pin' ? (
            <div className="pt-1">
              <div className="text-center mb-1">
                <span className="text-xs font-bold text-[var(--text-main)]">
                  Masukkan PIN 6 Digit {currentProfile.name}
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
                  onClick={() => setInputMode('text')}
                  className="text-[11px] text-[var(--accent-color)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Gunakan Sandi Teks Biasa</span>
                </button>
              </div>
            </div>
          ) : (
            /* Mode Form Sandi Teks (Cadangan) */
            <form onSubmit={handleTextPasswordLogin} className="space-y-3 pt-1">
              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-[var(--color-expense)]/10 border border-[var(--color-expense)]/30 text-[var(--color-expense)] text-xs font-semibold leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[var(--text-main)] block mb-1" htmlFor="text-password">
                  Kata Sandi {currentProfile.name}
                </label>
                <div className="relative">
                  <input
                    id="text-password"
                    type={showPassword ? 'text' : 'password'}
                    value={textPassword}
                    onChange={(e) => setTextPassword(e.target.value)}
                    placeholder="Masukkan sandi..."
                    required
                    autoFocus
                    className="w-full px-3.5 py-2.5 pr-11 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-sm font-mono text-[var(--text-main)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {showCustomEmail && (
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">
                    Email Khusus (Opsional)
                  </label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder={currentProfile.email}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border-color)] text-xs text-[var(--text-main)]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-[var(--accent-color)] hover:opacity-90 active:scale-[0.99] text-white dark:text-[#121218] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk sebagai {currentProfile.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setInputMode('pin')}
                  className="text-[11px] text-[var(--accent-color)] hover:underline cursor-pointer"
                >
                  Kembali ke Mode Keypad PIN Angka
                </button>
              </div>
            </form>
          )}

          {/* Footer Card */}
          <div className="mt-4 pt-3.5 border-t border-[var(--border-color)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-income)]" />
              <span>Privasi Terproteksi</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomEmail(!showCustomEmail)}
              className="text-[var(--accent-color)] hover:underline text-[10px]"
            >
              {showCustomEmail ? 'Sembunyikan Email' : 'Gunakan Akun Kustom'}
            </button>
          </div>
        </div>

        {/* Catatan Bantuan Bawah */}
        <p className="text-center text-[11px] text-[var(--text-muted)] mt-3">
          Dashboard otomatis mencatat notifikasi bank & bukti transfer dompet keluarga.
        </p>
      </div>
    </div>
  );
}
