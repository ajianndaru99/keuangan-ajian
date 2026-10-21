'use client';

// ==============================================================================
// COMPONENT: src/components/auth/PinKeypad.tsx
// Keypad Angka 6-Digit Responsif untuk Mobile & Desktop
// - 6 Indikator Bulatan PIN dengan Animasi Halus
// - Keypad Virtual 0-9 Ramah Jempol Layar Sentuh
// - Umpan Balik Getaran Haptik (Vibration API)
// - Dukungan Tombol Keyboard Fisik (0-9, Backspace, Enter)
// ==============================================================================

import { useEffect, useCallback } from 'react';
import { Delete, Fingerprint, Loader2 } from 'lucide-react';

interface PinKeypadProps {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  showBiometrics?: boolean;
  onBiometricsClick?: () => void;
}

const PIN_LENGTH = 6;

export default function PinKeypad({
  value,
  onChange,
  onComplete,
  disabled = false,
  loading = false,
  error = null,
  showBiometrics = false,
  onBiometricsClick,
}: PinKeypadProps) {
  // Getaran Haptik Ringan di Ponsel
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(20);
      }
    } catch {
      // Abaikan jika peramban tidak mengizinkan getaran
    }
  }, []);

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (disabled || loading) return;
      if (value.length < PIN_LENGTH) {
        triggerHaptic();
        const nextVal = value + digit;
        onChange(nextVal);
        if (nextVal.length === PIN_LENGTH && onComplete) {
          onComplete(nextVal);
        }
      }
    },
    [disabled, loading, value, onChange, onComplete, triggerHaptic]
  );

  const handleDelete = useCallback(() => {
    if (disabled || loading || value.length === 0) return;
    triggerHaptic();
    onChange(value.slice(0, -1));
  }, [disabled, loading, value, onChange, triggerHaptic]);

  // Dukungan Keyboard Fisik Desktop & Laptop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || loading) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, loading, handleDigitPress, handleDelete]);

  const keypadNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="w-full max-w-xs mx-auto flex flex-col items-center select-none">
      {/* 6 Bulatan Indikator PIN */}
      <div className="flex items-center justify-center gap-3.5 my-4">
        {Array.from({ length: PIN_LENGTH }).map((_, idx) => {
          const isFilled = idx < value.length;
          const isCurrent = idx === value.length && !loading;

          return (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-150 border ${
                isFilled
                  ? 'bg-[var(--accent-color)] border-[var(--accent-color)] scale-110 shadow-xs'
                  : isCurrent
                  ? 'bg-transparent border-[var(--accent-color)] scale-105 animate-pulse'
                  : 'bg-[var(--surface-2)] border-[var(--border-color)] opacity-60'
              }`}
            />
          );
        })}
      </div>

      {/* Pesan Kesalahan jika Ada */}
      {error && (
        <div className="mb-3 px-3 py-1.5 rounded-xl bg-[var(--color-expense)]/10 border border-[var(--color-expense)]/20 text-[var(--color-expense)] text-xs text-center font-medium animate-shake">
          {error}
        </div>
      )}

      {/* Loading Spinner saat Verifikasi */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-[var(--accent-color)] font-medium mb-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memverifikasi PIN...</span>
        </div>
      )}

      {/* Grid Keypad Angka 0-9 */}
      <div className="grid grid-cols-3 gap-3 w-full pt-2">
        {keypadNumbers.map((num) => (
          <button
            key={num}
            type="button"
            disabled={disabled || loading}
            onClick={() => handleDigitPress(num)}
            className="h-14 sm:h-16 rounded-2xl bg-[var(--surface-2)]/80 hover:bg-[var(--surface-2)] active:scale-95 border border-[var(--border-color)] text-xl sm:text-2xl font-bold font-mono text-[var(--text-main)] flex items-center justify-center shadow-xs transition-transform cursor-pointer disabled:opacity-50"
            aria-label={`Angka ${num}`}
          >
            {num}
          </button>
        ))}

        {/* Tombol Biometrik (Kiri Bawah) */}
        {showBiometrics ? (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => {
              triggerHaptic();
              onBiometricsClick?.();
            }}
            className="h-14 sm:h-16 rounded-2xl bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] active:scale-95 border border-[var(--border-color)] text-[var(--accent-color)] flex items-center justify-center shadow-xs transition-transform cursor-pointer"
            aria-label="Masuk dengan Sidik Jari"
            title="Masuk dengan Sidik Jari"
          >
            <Fingerprint className="w-6 h-6 sm:w-7 sm:h-7" />
          </button>
        ) : (
          <div className="h-14 sm:h-16" />
        )}

        {/* Angka 0 */}
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => handleDigitPress('0')}
          className="h-14 sm:h-16 rounded-2xl bg-[var(--surface-2)]/80 hover:bg-[var(--surface-2)] active:scale-95 border border-[var(--border-color)] text-xl sm:text-2xl font-bold font-mono text-[var(--text-main)] flex items-center justify-center shadow-xs transition-transform cursor-pointer disabled:opacity-50"
          aria-label="Angka 0"
        >
          0
        </button>

        {/* Tombol Hapus / Backspace (Kanan Bawah) */}
        <button
          type="button"
          disabled={disabled || loading || value.length === 0}
          onClick={handleDelete}
          className="h-14 sm:h-16 rounded-2xl bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] active:scale-95 border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center justify-center shadow-xs transition-transform cursor-pointer disabled:opacity-30"
          aria-label="Hapus satu angka"
        >
          <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </div>
    </div>
  );
}
