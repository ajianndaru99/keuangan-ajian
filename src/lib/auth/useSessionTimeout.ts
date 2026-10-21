'use client';

// ==============================================================================
// HOOK: src/lib/auth/useSessionTimeout.ts
// Manajemen Kunci Sesi & Inaktivitas 1 Jam (60 Menit)
// - Memantau Aktivitas Pengguna (Sentuhan, Ketukan, Gerakan, Scroll)
// - Kunci Layar Otomatis saat Ditinggal > 60 Menit
// - Sinkronisasi Lintas Tab via LocalStorage
// ==============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

const TIMEOUT_MS = 60 * 60 * 1000; // 1 Jam = 3.600.000 ms
const STORAGE_LAST_ACTIVE = 'keuangan_last_active_at';
const STORAGE_IS_LOCKED = 'keuangan_is_locked';
const THROTTLE_WRITE_MS = 10 * 1000; // Simpan ke storage paling sering tiap 10 detik

export function useSessionTimeout(enabled = true) {
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const lastWriteRef = useRef<number>(0);

  // Periksa apakah sesi saat ini harus terkunci
  const checkLockStatus = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return false;

    // Periksa status terkunci eksplisit di storage
    const storedLock = localStorage.getItem(STORAGE_IS_LOCKED);
    if (storedLock === 'true') {
      setIsLocked(true);
      return true;
    }

    const lastActiveStr = localStorage.getItem(STORAGE_LAST_ACTIVE);
    if (lastActiveStr) {
      const lastActive = parseInt(lastActiveStr, 10);
      const now = Date.now();
      if (!isNaN(lastActive) && now - lastActive >= TIMEOUT_MS) {
        localStorage.setItem(STORAGE_IS_LOCKED, 'true');
        setIsLocked(true);
        return true;
      }
    }

    return false;
  }, [enabled]);

  // Perbarui stempel waktu aktivitas terakhir
  const recordActivity = useCallback(() => {
    if (!enabled || isLocked || typeof window === 'undefined') return;

    const now = Date.now();
    // Throttle penulisan ke storage agar tidak membebani performa
    if (now - lastWriteRef.current > THROTTLE_WRITE_MS) {
      lastWriteRef.current = now;
      localStorage.setItem(STORAGE_LAST_ACTIVE, String(now));
    }
  }, [enabled, isLocked]);

  // Kunci sesi secara manual
  const lock = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_IS_LOCKED, 'true');
    setIsLocked(true);
  }, []);

  // Buka kunci sesi
  const unlock = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    localStorage.removeItem(STORAGE_IS_LOCKED);
    localStorage.setItem(STORAGE_LAST_ACTIVE, String(now));
    lastWriteRef.current = now;
    setIsLocked(false);
  }, []);

  // Inisialisasi & Pasang Event Listener Aktivitas
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // 1. Cek status awal saat komponen dipasang
    checkLockStatus();

    // 2. Set stempel waktu awal jika belum ada
    if (!localStorage.getItem(STORAGE_LAST_ACTIVE)) {
      localStorage.setItem(STORAGE_LAST_ACTIVE, String(Date.now()));
    }

    // 3. Listener interaksi pengguna
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleUserInteraction = () => {
      recordActivity();
    };

    events.forEach((evt) => {
      window.addEventListener(evt, handleUserInteraction, { passive: true });
    });

    // 4. Listener saat tab/aplikasi kembali dibuka dari latar belakang (visibility change)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const locked = checkLockStatus();
        if (!locked) {
          recordActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 5. Interval pemeriksaan berkala tiap 30 detik
    const intervalId = setInterval(() => {
      checkLockStatus();
    }, 30 * 1000);

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleUserInteraction);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [enabled, checkLockStatus, recordActivity]);

  return {
    isLocked,
    lock,
    unlock,
    recordActivity,
  };
}
