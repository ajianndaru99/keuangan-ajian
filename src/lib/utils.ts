// ==============================================================================
// UTILS: src/lib/utils.ts
// Format mata uang Rupiah, penanggalan WIB, dan utility styling
// ==============================================================================

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format mata uang Rupiah sesuai spesifikasi: "Rp 1.250.000, tanpa desimal"
 */
export function formatRupiah(amount: number | string): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return 'Rp 0';
  
  const rounded = Math.round(numeric);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(rounded);

  return `Rp ${formatted}`;
}

/**
 * Format waktu notifikasi ke zona waktu Asia/Jakarta (WIB)
 */
export function formatTimeWIB(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d) + ' WIB';
}

/**
 * Format tanggal dan waktu relatif atau lengkap WIB
 */
export function formatDateWIB(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  const dateFormatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);

  const timeFormatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

  return `${dateFormatted}, ${timeFormatted} WIB`;
}

/**
 * Mendapatkan format waktu ramah pengguna (contoh: "Hari ini, 14:20 WIB" atau "Kemarin")
 */
export function formatRelativeWIB(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Baru saja';
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;

  const isToday = now.toDateString() === d.toDateString();
  const timeStr = formatTimeWIB(d);

  if (isToday) return `Hari ini, ${timeStr}`;

  return formatDateWIB(d);
}
