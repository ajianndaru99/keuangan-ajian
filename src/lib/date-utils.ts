// ==============================================================================
// UTILITY: src/lib/date-utils.ts
// Perhitungan Periode Mingguan & Bulanan (Asia/Jakarta, Minggu Mulai Senin)
// ==============================================================================

export interface DateRange {
  startDate: Date;
  endDate: Date;
  label: string;
  subLabel: string;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const MONTH_SHORT_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * Mendapatkan rentang mingguan (Senin - Minggu) berdasarkan offset minggu dari hari ini
 * offset: 0 = minggu ini, -1 = minggu lalu, +1 = minggu depan
 */
export function getWeeklyRange(offset: number = 0): DateRange {
  const now = new Date();
  
  // Dapatkan hari saat ini (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)
  const currentDay = now.getDay();
  // Hitung selisih ke hari Senin (1)
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + (offset * 7));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const monDate = monday.getDate();
  const sunDate = sunday.getDate();
  const monMonth = MONTH_SHORT_ID[monday.getMonth()];
  const sunMonth = MONTH_SHORT_ID[sunday.getMonth()];
  const year = sunday.getFullYear();

  let label = '';
  if (monMonth === sunMonth) {
    label = `${monDate} - ${sunDate} ${monMonth} ${year}`;
  } else {
    label = `${monDate} ${monMonth} - ${sunDate} ${sunMonth} ${year}`;
  }

  let subLabel = 'Minggu Ini';
  if (offset === -1) subLabel = 'Minggu Lalu';
  else if (offset === 1) subLabel = 'Minggu Depan';
  else if (offset < -1) subLabel = `${Math.abs(offset)} Minggu Lalu`;
  else if (offset > 1) subLabel = `${offset} Minggu Lagi`;

  return {
    startDate: monday,
    endDate: sunday,
    label,
    subLabel,
  };
}

/**
 * Mendapatkan rentang bulanan berdasarkan offset bulan dari hari ini
 * offset: 0 = bulan ini, -1 = bulan lalu, +1 = bulan depan
 * monthStartDay: tanggal awal bulan finansial (default 1)
 */
export function getMonthlyRange(offset: number = 0, monthStartDay: number = 1): DateRange {
  const now = new Date();
  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() + offset;

  const startDate = new Date(targetYear, targetMonth, monthStartDay, 0, 0, 0, 0);
  
  // Tanggal akhir: 1 hari sebelum tanggal awal bulan berikutnya
  const nextMonthStart = new Date(targetYear, targetMonth + 1, monthStartDay, 0, 0, 0, 0);
  const endDate = new Date(nextMonthStart.getTime() - 1);

  const monthName = MONTH_NAMES_ID[startDate.getMonth()];
  const year = startDate.getFullYear();

  const label = `${monthName} ${year}`;

  let subLabel = 'Bulan Ini';
  if (offset === -1) subLabel = 'Bulan Lalu';
  else if (offset === 1) subLabel = 'Bulan Depan';
  else if (offset < -1) subLabel = `${Math.abs(offset)} Bulan Lalu`;
  else if (offset > 1) subLabel = `${offset} Bulan Lagi`;

  return {
    startDate,
    endDate,
    label,
    subLabel,
  };
}

/**
 * Menghitung perbandingan antara nominal periode saat ini vs periode sebelumnya
 */
export function calculateComparison(current: number, previous: number) {
  const diff = current - previous;
  let percent = 0;

  if (previous > 0) {
    percent = Math.round((Math.abs(diff) / previous) * 100);
  } else if (current > 0) {
    percent = 100;
  }

  return {
    diff,
    absDiff: Math.abs(diff),
    percent,
    isIncrease: diff > 0,
    isEqual: diff === 0,
  };
}
