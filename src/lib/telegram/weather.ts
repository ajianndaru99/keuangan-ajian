// ==============================================================================
// TELEGRAM WEATHER, HOLIDAYS & DAILY MOTIVATION: src/lib/telegram/weather.ts
// Info Cuaca Real-Time Yogyakarta (Open-Meteo), Hari Libur Resmi Pemerintah RI,
// & Caption Motivasi Keuangan Berbeda Setiap Hari (0 Token Gemini)
// ==============================================================================

export interface WeatherInfo {
  city: string;
  temperature: number;
  minTemp: number;
  maxTemp: number;
  rainProbability: number;
  condition: string;
  emoji: string;
  tip: string;
}

export interface HolidayInfo {
  isTodayHoliday: boolean;
  todayHolidayName?: string;
  upcomingHolidayName: string;
  upcomingHolidayDateLabel: string;
  daysUntilUpcoming: number;
  summaryText: string;
}

const DEFAULT_CITY = process.env.WEATHER_CITY || 'Yogyakarta';
const DEFAULT_LAT = process.env.WEATHER_LAT || '-7.7956';
const DEFAULT_LON = process.env.WEATHER_LON || '110.3695';

/**
 * Daftar Hari Libur Nasional & Cuti Bersama Resmi Pemerintah RI (SKB 3 Menteri 2025 - 2027)
 * Format tanggal: YYYY-MM-DD
 */
const OFFICIAL_INDONESIAN_HOLIDAYS: Array<{ date: string; name: string; type: 'Libur Nasional' | 'Cuti Bersama' }> = [
  // 2025
  { date: '2025-01-01', name: 'Tahun Baru 2025 Masehi', type: 'Libur Nasional' },
  { date: '2025-01-27', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2025-01-28', name: 'Cuti Bersama Tahun Baru Imlek', type: 'Cuti Bersama' },
  { date: '2025-01-29', name: 'Tahun Baru Imlek 2576 Kongzili', type: 'Libur Nasional' },
  { date: '2025-03-28', name: 'Cuti Bersama Hari Suci Nyepi', type: 'Cuti Bersama' },
  { date: '2025-03-29', name: 'Hari Suci Nyepi Tahun Baru Saka 1947', type: 'Libur Nasional' },
  { date: '2025-03-31', name: 'Hari Raya Idulfitri 1446 H', type: 'Libur Nasional' },
  { date: '2025-04-01', name: 'Hari Raya Idulfitri 1446 H (Hari ke-2)', type: 'Libur Nasional' },
  { date: '2025-04-02', name: 'Cuti Bersama Idulfitri 1446 H', type: 'Cuti Bersama' },
  { date: '2025-04-03', name: 'Cuti Bersama Idulfitri 1446 H', type: 'Cuti Bersama' },
  { date: '2025-04-04', name: 'Cuti Bersama Idulfitri 1446 H', type: 'Cuti Bersama' },
  { date: '2025-04-07', name: 'Cuti Bersama Idulfitri 1446 H', type: 'Cuti Bersama' },
  { date: '2025-04-18', name: 'Wafat Yesus Kristus', type: 'Libur Nasional' },
  { date: '2025-04-20', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'Libur Nasional' },
  { date: '2025-05-01', name: 'Hari Buruh Internasional', type: 'Libur Nasional' },
  { date: '2025-05-12', name: 'Hari Raya Waisak 2569 BE', type: 'Libur Nasional' },
  { date: '2025-05-13', name: 'Cuti Bersama Hari Raya Waisak', type: 'Cuti Bersama' },
  { date: '2025-05-29', name: 'Kenaikan Yesus Kristus', type: 'Libur Nasional' },
  { date: '2025-05-30', name: 'Cuti Bersama Kenaikan Yesus Kristus', type: 'Cuti Bersama' },
  { date: '2025-06-01', name: 'Hari Lahir Pancasila', type: 'Libur Nasional' },
  { date: '2025-06-06', name: 'Hari Raya Iduladha 1446 H', type: 'Libur Nasional' },
  { date: '2025-06-09', name: 'Cuti Bersama Iduladha 1446 H', type: 'Cuti Bersama' },
  { date: '2025-06-27', name: '1 Muharam Tahun Baru Islam 1447 H', type: 'Libur Nasional' },
  { date: '2025-08-17', name: 'Hari Kemerdekaan Republik Indonesia ke-80', type: 'Libur Nasional' },
  { date: '2025-08-18', name: 'Cuti Bersama HUT Kemerdekaan RI', type: 'Cuti Bersama' },
  { date: '2025-09-05', name: 'Maulid Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2025-12-25', name: 'Hari Raya Natal', type: 'Libur Nasional' },
  { date: '2025-12-26', name: 'Cuti Bersama Hari Raya Natal', type: 'Cuti Bersama' },

  // 2026
  { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', type: 'Libur Nasional' },
  { date: '2026-01-16', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2026-02-16', name: 'Cuti Bersama Tahun Baru Imlek', type: 'Cuti Bersama' },
  { date: '2026-02-17', name: 'Tahun Baru Imlek 2577 Kongzili', type: 'Libur Nasional' },
  { date: '2026-03-18', name: 'Cuti Bersama Hari Suci Nyepi', type: 'Cuti Bersama' },
  { date: '2026-03-19', name: 'Hari Suci Nyepi Tahun Baru Saka 1948', type: 'Libur Nasional' },
  { date: '2026-03-20', name: 'Hari Raya Idulfitri 1447 H', type: 'Libur Nasional' },
  { date: '2026-03-21', name: 'Hari Raya Idulfitri 1447 H (Hari ke-2)', type: 'Libur Nasional' },
  { date: '2026-03-23', name: 'Cuti Bersama Idulfitri 1447 H', type: 'Cuti Bersama' },
  { date: '2026-03-24', name: 'Cuti Bersama Idulfitri 1447 H', type: 'Cuti Bersama' },
  { date: '2026-03-25', name: 'Cuti Bersama Idulfitri 1447 H', type: 'Cuti Bersama' },
  { date: '2026-04-03', name: 'Wafat Yesus Kristus', type: 'Libur Nasional' },
  { date: '2026-04-05', name: 'Kebangkitan Yesus Kristus (Paskah)', type: 'Libur Nasional' },
  { date: '2026-05-01', name: 'Hari Buruh Internasional', type: 'Libur Nasional' },
  { date: '2026-05-14', name: 'Kenaikan Yesus Kristus', type: 'Libur Nasional' },
  { date: '2026-05-15', name: 'Cuti Bersama Kenaikan Yesus Kristus', type: 'Cuti Bersama' },
  { date: '2026-05-27', name: 'Hari Raya Iduladha 1447 H', type: 'Libur Nasional' },
  { date: '2026-05-28', name: 'Cuti Bersama Iduladha 1447 H', type: 'Cuti Bersama' },
  { date: '2026-05-31', name: 'Hari Raya Waisak 2570 BE', type: 'Libur Nasional' },
  { date: '2026-06-01', name: 'Hari Lahir Pancasila', type: 'Libur Nasional' },
  { date: '2026-06-16', name: '1 Muharam Tahun Baru Islam 1448 H', type: 'Libur Nasional' },
  { date: '2026-08-17', name: 'Hari Kemerdekaan Republik Indonesia ke-81', type: 'Libur Nasional' },
  { date: '2026-08-25', name: 'Maulid Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2026-12-24', name: 'Cuti Bersama Hari Raya Natal', type: 'Cuti Bersama' },
  { date: '2026-12-25', name: 'Hari Raya Natal', type: 'Libur Nasional' },

  // 2027
  { date: '2027-01-01', name: 'Tahun Baru 2027 Masehi', type: 'Libur Nasional' },
  { date: '2027-01-05', name: 'Isra Mikraj Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2027-02-06', name: 'Tahun Baru Imlek 2578 Kongzili', type: 'Libur Nasional' },
  { date: '2027-03-09', name: 'Hari Raya Idulfitri 1448 H', type: 'Libur Nasional' },
  { date: '2027-03-10', name: 'Hari Raya Idulfitri 1448 H (Hari ke-2)', type: 'Libur Nasional' },
  { date: '2027-03-26', name: 'Wafat Yesus Kristus', type: 'Libur Nasional' },
  { date: '2027-03-28', name: 'Hari Suci Nyepi Tahun Baru Saka 1949', type: 'Libur Nasional' },
  { date: '2027-05-01', name: 'Hari Buruh Internasional', type: 'Libur Nasional' },
  { date: '2027-05-06', name: 'Kenaikan Yesus Kristus', type: 'Libur Nasional' },
  { date: '2027-05-16', name: 'Hari Raya Iduladha 1448 H', type: 'Libur Nasional' },
  { date: '2027-05-20', name: 'Hari Raya Waisak 2571 BE', type: 'Libur Nasional' },
  { date: '2027-06-01', name: 'Hari Lahir Pancasila', type: 'Libur Nasional' },
  { date: '2027-06-06', name: '1 Muharam Tahun Baru Islam 1449 H', type: 'Libur Nasional' },
  { date: '2027-08-14', name: 'Maulid Nabi Muhammad SAW', type: 'Libur Nasional' },
  { date: '2027-08-17', name: 'Hari Kemerdekaan Republik Indonesia ke-82', type: 'Libur Nasional' },
  { date: '2027-12-25', name: 'Hari Raya Natal', type: 'Libur Nasional' },
];

/**
 * Menerjemahkan kode cuaca standar WMO (Open-Meteo) ke Bahasa Indonesia beserta saran aktivitas
 */
export function mapWeatherCodeToIndonesian(
  code: number,
  rainProb: number = 0
): { condition: string; emoji: string; tip: string } {
  if (code === 0) {
    return {
      condition: 'Cerah',
      emoji: '☀️',
      tip: 'Cuaca Yogyakarta cerah bersahabat, tetap jaga hidrasi saat beraktivitas di luar.',
    };
  }
  if (code === 1 || code === 2) {
    return {
      condition: 'Cerah Berawan',
      emoji: '⛅',
      tip: rainProb >= 50
        ? 'Siang cerah berawan namun ada potensi hujan sore nanti, siapkan payung/jas hujan.'
        : 'Cuaca Yogyakarta teduh cerah berawan, nyaman untuk aktivitas keluarga.',
    };
  }
  if (code === 3) {
    return {
      condition: 'Berawan',
      emoji: '☁️',
      tip: rainProb >= 40
        ? 'Langit mendung berawan, antisipasi potensi turun hujan siang/sore ini.'
        : 'Langit berawan teduh sepanjang siang.',
    };
  }
  if (code === 45 || code === 48) {
    return {
      condition: 'Berkabut / Udara Lembap',
      emoji: '🌫️',
      tip: 'Jarak pandang agak terbatas, hati-hati saat berkendara.',
    };
  }
  if (code >= 51 && code <= 57) {
    return {
      condition: 'Gerimis',
      emoji: '🌦️',
      tip: 'Sedang turun gerimis, gunakan jas hujan atau payung bila keluar rumah.',
    };
  }
  if (code >= 61 && code <= 67) {
    return {
      condition: 'Hujan',
      emoji: '🌧️',
      tip: 'Turun hujan, utamakan keselamatan di jalan dan bijak bila memesan makanan online.',
    };
  }
  if (code >= 80 && code <= 82) {
    return {
      condition: 'Hujan Lokal / Deras',
      emoji: '🌧️',
      tip: 'Waspada hujan deras mendadak siang/sore ini, siapkan perlengkapan hujan.',
    };
  }
  if (code >= 95) {
    return {
      condition: 'Hujan Petir',
      emoji: '⛈️',
      tip: 'Waspada hujan disertai petir, tunda perjalanan luar ruangan bila belum mendesak.',
    };
  }

  return {
    condition: 'Cerah Berawan',
    emoji: '🌤️',
    tip: 'Semoga aktivitas keluarga di Yogyakarta siang ini berjalan lancar dan penuh berkah.',
  };
}

/**
 * Mengambil data cuaca real-time Yogyakarta dari Open-Meteo API (Gratis, Tanpa API Key, 0 Token AI)
 */
export async function fetchTodayWeatherInfo(
  options?: { city?: string; lat?: string; lon?: string }
): Promise<WeatherInfo> {
  const city = options?.city || DEFAULT_CITY;
  const lat = options?.lat || DEFAULT_LAT;
  const lon = options?.lon || DEFAULT_LON;

  const fallbackWeather: WeatherInfo = {
    city,
    temperature: 30,
    minTemp: 24,
    maxTemp: 32,
    rainProbability: 30,
    condition: 'Cerah Berawan',
    emoji: '⛅',
    tip: 'Tetap jaga kesehatan dan kelola pengeluaran harian keluarga dengan bijak.',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FJakarta&forecast_days=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return fallbackWeather;
    }

    const data = await res.json();
    const currentTemp = Math.round(Number(data?.current?.temperature_2m ?? 30));
    const weatherCode = Number(data?.current?.weather_code ?? 1);
    const maxTemp = Math.round(Number(data?.daily?.temperature_2m_max?.[0] ?? Math.max(currentTemp, 32)));
    const minTemp = Math.round(Number(data?.daily?.temperature_2m_min?.[0] ?? Math.min(currentTemp, 24)));
    const rainProb = Math.round(Number(data?.daily?.precipitation_probability_max?.[0] ?? 20));

    const mapped = mapWeatherCodeToIndonesian(weatherCode, rainProb);

    return {
      city,
      temperature: currentTemp,
      minTemp,
      maxTemp,
      rainProbability: rainProb,
      condition: mapped.condition,
      emoji: mapped.emoji,
      tip: mapped.tip,
    };
  } catch {
    return fallbackWeather;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Mengecek informasi Hari Libur Nasional & Cuti Bersama Resmi Pemerintah RI (SKB 3 Menteri)
 */
export function getIndonesianHolidayInfo(referenceDate: Date = new Date()): HolidayInfo {
  const wibDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate);

  const todayEntry = OFFICIAL_INDONESIAN_HOLIDAYS.find((h) => h.date === wibDateStr);

  const todayMidnightUtc = new Date(`${wibDateStr}T00:00:00Z`).getTime();

  const upcomingEntry = OFFICIAL_INDONESIAN_HOLIDAYS.find((h) => h.date > wibDateStr);

  if (!upcomingEntry) {
    return {
      isTodayHoliday: Boolean(todayEntry),
      todayHolidayName: todayEntry ? `${todayEntry.name} (${todayEntry.type})` : undefined,
      upcomingHolidayName: 'Tahun Baru Masehi',
      upcomingHolidayDateLabel: '1 Jan',
      daysUntilUpcoming: 30,
      summaryText: todayEntry
        ? `🎉 *Hari Ini ${todayEntry.type}:* ${todayEntry.name}`
        : `🗓️ *Libur Resmi Terdekat:* Tahun Baru Masehi (1 Jan)`,
    };
  }

  const upcomingMidnightUtc = new Date(`${upcomingEntry.date}T00:00:00Z`).getTime();
  const daysUntil = Math.max(1, Math.round((upcomingMidnightUtc - todayMidnightUtc) / (1000 * 60 * 60 * 24)));

  const upcomingDateObj = new Date(`${upcomingEntry.date}T05:00:00Z`);
  const upcomingDateLabel = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(upcomingDateObj);

  const summaryText = todayEntry
    ? `🎉 *Hari Ini ${todayEntry.type}:* *${todayEntry.name}*\n🗓️ *Libur Berikutnya:* ${upcomingEntry.name} (${upcomingDateLabel} • _${daysUntil} hari lagi_)`
    : `🗓️ *Libur Pemerintah Terdekat:* *${upcomingEntry.name}* _(${upcomingEntry.type})_ — ${upcomingDateLabel} *(${daysUntil} hari lagi)*`;

  return {
    isTodayHoliday: Boolean(todayEntry),
    todayHolidayName: todayEntry ? `${todayEntry.name} (${todayEntry.type})` : undefined,
    upcomingHolidayName: `${upcomingEntry.name} (${upcomingEntry.type})`,
    upcomingHolidayDateLabel: upcomingDateLabel,
    daysUntilUpcoming: daysUntil,
    summaryText,
  };
}

/**
 * 31+ Kutipan Motivasi Keuangan Keluarga yang Berbeda Setiap Hari (0 Token Gemini)
 */
const DAILY_FINANCIAL_MOTIVATIONS: string[] = [
  'Kekayaan sejati keluarga bukan diukur dari seberapa besar penghasilan semata, melainkan seberapa bijak kita menjaga sisanya untuk masa depan.',
  'Mencatat setiap pengeluaran kecil hari ini adalah bentuk cinta dan tanggung jawab nyata demi ketenangan rumah tangga esok hari.',
  'Anggaran keluarga bukanlah pembatas kebahagiaan, melainkan peta jalan agar setiap rupiah bekerja untuk impian bersama.',
  'Ketenangan pikiran saat tanggal tua jauh lebih berharga daripada kepuasan sesaat membeli barang yang tidak kita butuhkan.',
  'Kompak antara suami dan istri dalam keterbukaan finansial adalah fondasi terkuat menghadapi segala musim kehidupan.',
  'Sebelum membeli sesuatu siang ini, berhentilah sepuluh detik: apakah ini kebutuhan keluarga atau sekadar keinginan sesaat?',
  'Menabung bukan menunggu uang sisa di akhir bulan, tetapi menyisihkan komitmen di awal dengan penuh kesadaran.',
  'Kebocoran kas terbesar sering kali datang dari pengeluaran kecil yang berulang tanpa disadari—mari jaga ritme belanja hari ini.',
  'Hidup sederhana di bawah kemampuan finansial kita adalah kunci kemerdekaan finansial yang sesungguhnya.',
  'Setiap rupiah yang berhasil dihemat dari belanja impulsif hari ini adalah tambahan modal untuk pendidikan dan masa depan keluarga.',
  'Disiplin finansial adalah kebiasaan harian; langkah kecil yang dijaga konsisten setiap hari akan melahirkan hasil besar di akhir tahun.',
  'Jangan biarkan diskon memancing kita membeli barang yang tidak masuk rencana anggaran bulan ini.',
  'Keluarga yang tangguh secara finansial selalu siap menghadapi hari hujan karena rajin menata payung anggaran saat hari cerah.',
  'Rasa syukur membuat apa yang kita miliki terasa cukup; pengelolaan yang rapi membuat apa yang cukup menjadi berkah berlipat.',
  'Evaluasi pengeluaran di siang hari membantu kita mengerem laju belanja sebelum hari berakhir melebihi batas aman.',
  'Membedakan antara kebutuhan dapur yang pokok dan keinginan gaya hidup adalah keahlian finansial terbaik dalam keluarga.',
  'Dana darurat yang kokoh berawal dari keberanian berkata "cukup" pada pengeluaran yang kurang prioritas hari ini.',
  'Transparansi catatan kas keluarga menghilangkan prasangka dan menumbuhkan rasa saling percaya setiap harinya.',
  'Investasi terbaik dalam rumah tangga adalah ketenangan batin karena terbebas dari pengeluaran di luar batas kemampuan.',
  'Memasak dan menyiapkan bekal dari rumah bukan hanya menyehatkan raga, tetapi juga menyehatkan pos anggaran bulanan kita.',
  'Uang adalah hamba yang sangat baik ketika diatur dengan disiplin, namun menjadi tuan yang berat bila dibiarkan mengalir tanpa catatan.',
  'Keberhasilan mengelola anggaran bulan ini ditentukan oleh keputusan-keputusan kecil yang kita ambil dari pagi hingga malam.',
  'Saat arus kas terjaga di bawah batas aman harian, akhir pekan bersama keluarga terasa lebih ringan tanpa beban pikiran.',
  'Bijak menggunakan pembayaran digital/QRIS: kemudahannya jangan sampai membuat kita lupa mengecek sisa kuota pos anggaran.',
  'Tujuan keuangan keluarga tidak dicapai dengan langkah terburu-buru, melainkan dengan ketekunan menjaga pos belanja setiap hari.',
  'Satu pengeluaran yang berhasil kita tahan karena tidak perlu adalah kemenangan langsung bagi tabungan keluarga.',
  'Merencanakan anggaran sebelum hari libur tiba membantu keluarga menikmati waktu berkualitas tanpa khawatir tagihan membengkak.',
  'Kekuatan finansial rumah tangga lahir dari kebiasaan memeriksa posisi kas secara berkala dan saling mengingatkan dengan kasih.',
  'Jangan bandingkan gaya belanja keluarga kita dengan orang lain; fokuslah pada kesehatan kas dan tujuan jangka panjang kita sendiri.',
  'Setiap kali kita mematuhi pagu kategori yang telah disepakati, kita sedang membangun masa depan keluarga yang lebih mapan.',
  'Hari yang baik dimulai dengan semangat bekerja, dilanjutkan dengan belanja yang terukur, dan ditutup dengan hati yang bersyukur.',
];

/**
 * Menghasilkan Caption Motivasi Keuangan yang berbeda setiap hari (berdasarkan day-of-year WIB)
 */
export function generateDailyDynamicCaption(params: {
  date?: Date;
  monthPercentage: number;
  todaySpent: number;
  safeDailySpend: number;
}): string {
  const refDate = params.date || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(refDate);

  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '2026', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);

  // Hitung indeks hari unik sepanjang tahun agar setiap hari berganti secara deterministik
  const dayOfYear = Math.floor(
    (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / (1000 * 60 * 60 * 24)
  );
  const baseMotivation = DAILY_FINANCIAL_MOTIVATIONS[dayOfYear % DAILY_FINANCIAL_MOTIVATIONS.length];

  if (params.monthPercentage >= 90) {
    return `${baseMotivation} (💡 Pengingat: Pagu bulan ini telah mencapai ${params.monthPercentage}%, mari utamakan pos kebutuhan pokok hingga gajian).`;
  }

  if (params.safeDailySpend > 0 && params.todaySpent > params.safeDailySpend) {
    return `${baseMotivation} (💡 Pengingat: Belanja hari ini telah melewati batas aman harian, mari jaga ritme pengeluaran sore/malam nanti).`;
  }

  return baseMotivation;
}
