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
  const safeStartDay = Math.min(28, Math.max(1, monthStartDay));

  let baseYear = now.getFullYear();
  let baseMonth = now.getMonth();

  // Jika tanggal hari ini belum mencapai tanggal gajian siklus berjalan, siklus aktif dimulai pada bulan lalu
  if (safeStartDay > 1 && now.getDate() < safeStartDay) {
    baseMonth -= 1;
  }

  const targetMonth = baseMonth + offset;
  const startDate = new Date(baseYear, targetMonth, safeStartDay, 0, 0, 0, 0);

  // Tanggal akhir: 1 hari sebelum tanggal awal siklus berikutnya (23:59:59.999)
  const nextMonthStart = new Date(baseYear, targetMonth + 1, safeStartDay, 0, 0, 0, 0);
  const endDate = new Date(nextMonthStart.getTime() - 1);

  let label: string;
  if (safeStartDay === 1) {
    const monthName = MONTH_NAMES_ID[startDate.getMonth()];
    const year = startDate.getFullYear();
    label = `${monthName} ${year}`;
  } else {
    const startDayNum = startDate.getDate();
    const endDayNum = endDate.getDate();
    const startMonthShort = MONTH_SHORT_ID[startDate.getMonth()];
    const endMonthShort = MONTH_SHORT_ID[endDate.getMonth()];
    const endYear = endDate.getFullYear();
    label = `${startDayNum} ${startMonthShort} - ${endDayNum} ${endMonthShort} ${endYear}`;
  }

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
 * Mendapatkan rentang waktu hari ini (00:00:00.000 - 23:59:59.999 WIB)
 */
export function getTodayRangeWIB(referenceDate: Date = new Date()): DateRange {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);

  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '1970', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);

  // WIB adalah UTC+7 (00:00:00 WIB = 17:00:00 UTC hari sebelumnya)
  const startDate = new Date(Date.UTC(year, month, day, 0 - 7, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, day, 23 - 7, 59, 59, 999));

  const dayNameId = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(referenceDate);

  return {
    startDate,
    endDate,
    label: dayNameId,
    subLabel: 'Hari Ini',
  };
}

/**
 * Mendapatkan kunci string period_month standar (format: YYYY-MM) berdasarkan tanggal dan siklus gajian
 */
export function getBudgetPeriodKey(date: Date = new Date(), monthStartDay: number = 1): string {
  const safeStartDay = Math.min(28, Math.max(1, monthStartDay));
  let baseYear = date.getFullYear();
  let baseMonth = date.getMonth();

  if (safeStartDay > 1 && date.getDate() < safeStartDay) {
    baseMonth -= 1;
  }
  const startDate = new Date(baseYear, baseMonth, safeStartDay);
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
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
