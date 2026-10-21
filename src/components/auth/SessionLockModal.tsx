'use client';

// ==============================================================================
// COMPONENT: src/components/auth/SessionLockModal.tsx
// Layar Kunci Sesi Otomatis (Overlay Layar Penuh)
// - Muncul saat Aplikasi Ditinggal > 60 Menit
// - Buka Kunci dengan PIN 6 Digit atau Sensor Sidik Jari
// - Menjaga State & Halaman yang Sedang Terbuka agar Tidak Hilang
// ==============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LogOut, ShieldAlert } from 'lucide-react';
import PinKeypad from './PinKeypad';
import { checkBiometricsAvailability, authenticateWithBiometrics } from '@/lib/auth/biometrics';
import { createClient } from '@/lib/supabase/client';

interface SessionLockModalProps {
  isOpen: boolean;
  userRole?: 'suami' | 'istri';
  displayName?: string;
  onUnlock: () => void;
}

export default function SessionLockModal({
  isOpen,
  userRole = 'suami',
  displayName,
  onUnlock,
}: SessionLockModalProps) {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasBiometrics, setHasBiometrics] = useState(false);

  const profileName = displayName || (userRole === 'suami' ? 'Kepala Keluarga' : 'Istri');
  const avatarImg = userRole === 'suami' ? '/avatars/suami.png' : '/avatars/istri.png';
  const userEmail = userRole === 'suami' ? 'suami@keluarga.com' : 'istri@keluarga.com';

  // Periksa ketersediaan biometrik
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    checkBiometricsAvailability().then((res) => {
      if (isMounted) {
        setHasBiometrics(res.available);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Eksekusi Buka Kunci via Sidik Jari
  const handleBiometricAuth = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    const success = await authenticateWithBiometrics(
      'Buka Dasbor Keuangan',
      `Verifikasi sidik jari untuk ${profileName}`
    );

    if (success) {
      setPin('');
      setLoading(false);
      onUnlock();
    } else {
      setLoading(false);
      // Fallback ke keypad PIN
    }
  }, [profileName, onUnlock]);

  // Otomatis picu biometrik saat modal pertama kali terbuka jika didukung
  useEffect(() => {
    if (isOpen && hasBiometrics) {
      const timer = setTimeout(() => {
        handleBiometricAuth();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hasBiometrics, handleBiometricAuth]);

  // Eksekusi Buka Kunci via PIN
  const handlePinComplete = async (enteredPin: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      // Verifikasi kredensial PIN terhadap akun Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: enteredPin,
      });

      if (error) {
        setErrorMessage('PIN 6 digit belum sesuai.');
        setPin('');
        setLoading(false);
      } else {
        setPin('');
        setLoading(false);
        onUnlock();
      }
    } catch {
      setErrorMessage('Terjadi gangguan jaringan.');
      setPin('');
      setLoading(false);
    }
  };

  // Tombol Keluar Sesi Penuh
  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4 bg-[var(--bg-main)]/95 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
        {/* Ikon Kunci & Badge 1 Jam */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--surface-2)] text-[var(--accent-color)] border border-[var(--border-color)] mb-4 shadow-xs">
          <Lock className="w-3.5 h-3.5" />
          <span>Sesi Terkunci (Inaktivitas 1 Jam)</span>
        </div>

        {/* Avatar Profil */}
        <div className="relative mb-3">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl overflow-hidden bg-[var(--surface-1)] border-2 border-[var(--accent-color)] shadow-md">
            <img
              src={avatarImg}
              alt={profileName}
              width={96}
              height={96}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              className="w-full h-full object-cover dark:brightness-95"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--accent-color)] text-white shadow-xs">
            <Lock className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Nama Profil */}
        <h2 className="text-lg sm:text-xl font-bold text-[var(--text-main)] font-heading">
          {profileName}
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5 mb-2">
          Masukkan PIN 6 digit untuk membuka dasbor kembali
        </p>

        {/* Keypad PIN Angka */}
        <PinKeypad
          value={pin}
          onChange={(newVal) => {
            setPin(newVal);
            if (errorMessage) setErrorMessage(null);
          }}
          onComplete={handlePinComplete}
          disabled={loading}
          loading={loading}
          error={errorMessage}
          showBiometrics={hasBiometrics}
          onBiometricsClick={handleBiometricAuth}
        />

        {/* Footer Tombol Keluar / Ganti Akun */}
        <div className="mt-6 pt-4 border-t border-[var(--border-color)] w-full flex items-center justify-between text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1.5 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5 text-[var(--color-income)]" />
            <span>Privasi Keamanan Aktif</span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1 text-[11px] text-[var(--color-expense)] hover:underline font-medium cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Penuh</span>
          </button>
        </div>
      </div>
    </div>
  );
}
