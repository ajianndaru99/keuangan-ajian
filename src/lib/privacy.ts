'use client';

// ==============================================================================
// PRIVACY HELPER: src/lib/privacy.ts
// Fitur Sembunyikan / Sensor Nominal Saldo & Angka Sensitif
// Tersinkronisasi dengan localStorage dan event lintas komponen
// ==============================================================================

import { useState, useEffect } from 'react';
import { formatRupiah } from './utils';

const STORAGE_KEY = 'privacy_hide_balance';
const EVENT_NAME = 'privacy_toggle_event';

export function getInitialPrivacyState(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setPrivacyState(hide: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, hide ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { hide } }));
}

export function usePrivacy() {
  const [isHideBalance, setIsHideBalance] = useState<boolean>(false);

  useEffect(() => {
    setIsHideBalance(getInitialPrivacyState());

    const handleEvent = (e: Event) => {
      const custom = e as CustomEvent<{ hide: boolean }>;
      if (custom.detail !== undefined) {
        setIsHideBalance(custom.detail.hide);
      }
    };

    window.addEventListener(EVENT_NAME, handleEvent);
    return () => window.removeEventListener(EVENT_NAME, handleEvent);
  }, []);

  const togglePrivacy = () => {
    const next = !isHideBalance;
    setIsHideBalance(next);
    setPrivacyState(next);
  };

  return { isHideBalance, togglePrivacy };
}

/**
 * Format nominal Rupiah dengan dukungan mode privasi (sensor saldo)
 */
export function formatMaskedRupiah(amount: number | string, isHidden: boolean = false): string {
  if (isHidden) {
    return 'Rp ••••••';
  }
  return formatRupiah(amount);
}
