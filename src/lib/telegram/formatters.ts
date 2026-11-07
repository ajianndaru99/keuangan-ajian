// ==============================================================================
// TELEGRAM FORMATTERS: src/lib/telegram/formatters.ts
// Tipografi, Visual Progress Bar, & Template Pesan Interaktif Finansial
// ==============================================================================

import { formatRupiah, formatDateWIB } from '../utils.ts';
import { matchTargetCategory } from '../budget/budget-guard.ts';
import type { WeatherInfo, HolidayInfo } from './weather.ts';

export interface AccountBalanceItem {
  name: string;
  owner: string;
  balance: number;
}

export interface CategoryBudgetItem {
  name: string;
  emoji: string;
  spent: number;
  limit: number;
  percentage: number;
}

export interface StatusSummaryData {
  accounts: AccountBalanceItem[];
  totalBalance: number;
  totalSpentMonth: number;
  totalBudgetLimit: number;
  monthPercentage: number;
  daysRemaining: number;
  safeDailySpend: number;
  periodLabel: string;
  pendingCount?: number;
}

export interface RekapSummaryData {
  currentWeekTotal: number;
  previousWeekTotal: number;
  comparisonPercent: number;
  isIncrease: boolean;
  topCategoryName?: string;
  topCategoryAmount?: number;
  weekLabel: string;
}

export interface TodayExpenseItem {
  time: string;
  merchant: string;
  amount: number;
  categoryName: string;
  accountName: string;
  ownerLabel?: string;
}

export interface TodayExpensesData {
  dateLabel: string;
  items: TodayExpenseItem[];
  totalAmount: number;
}

export interface Daily11AMReportData {
  dateLabel: string;
  weather: WeatherInfo;
  holiday: HolidayInfo;
  accounts: AccountBalanceItem[];
  totalBalance: number;
  todayItems: TodayExpenseItem[];
  todaySpent: number;
  totalSpentMonth: number;
  totalBudgetLimit: number;
  monthPercentage: number;
  daysRemaining: number;
  safeDailySpend: number;
  dailyCaption: string;
}

export interface InboxSummaryData {
  pendingCount: number;
  unreviewedRawCount: number;
  oldestPendingDate?: string;
}

/**
 * Menghasilkan visual bar karakter monospaced untuk persentase anggaran
 * Contoh: 60% -> [██████░░░░] 60%
 */
export function generateProgressBar(percentage: number, length: number = 10): string {
  const safePercent = Math.max(0, percentage);
  const filledCount = Math.min(length, Math.round((safePercent / 100) * length));
  const emptyCount = Math.max(0, length - filledCount);

  const filledChar = '█';
  const emptyChar = '░';
  const bar = filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);

  const alertBadge = safePercent >= 100 ? ' 🚨' : safePercent >= 80 ? ' ⚠️' : '';
  return `\`[${bar}]\` *${safePercent}%*${alertBadge}`;
}

/**
 * Format Pesan Perintah /status atau /cek (Ringkas & Representatif)
 */
export function formatStatusMessage(data: StatusSummaryData): string {
  const lines: string[] = [];

  lines.push(`📊 *DETAK FINANSIAL KELUARGA*`);
  lines.push(`_Periode: ${data.periodLabel}_\n`);

  // Tab: Dompet & Akun
  lines.push(`💰 *Total Kas Siap Pakai:* \`${formatRupiah(data.totalBalance)}\``);
  if (data.accounts.length === 0) {
    lines.push(`🏦 _Belum ada data rekening terdaftar._`);
  } else {
    for (const acc of data.accounts) {
      lines.push(`🏦 • ${acc.name} (${acc.owner}): \`${formatRupiah(acc.balance)}\``);
    }
  }
  lines.push('');

  // Tab: Anggaran Belanja
  if (data.totalBudgetLimit > 0) {
    lines.push(`💳 *Belanja Bulan Ini:* \`${formatRupiah(data.totalSpentMonth)}\` / \`${formatRupiah(data.totalBudgetLimit)}\``);
    lines.push(`📊 *Utilisasi:* ${generateProgressBar(data.monthPercentage)}`);
  } else {
    lines.push(`💳 *Total Belanja Bulan Ini:* \`${formatRupiah(data.totalSpentMonth)}\``);
  }

  // Safe-to-Spend
  lines.push(`🎯 *Batas Aman Harian:* \`${formatRupiah(data.safeDailySpend)} / hari\` _(${data.daysRemaining} hari ke gajian)_`);

  // Tab: Transactions / Inbox Pending (jika ada)
  if (data.pendingCount && data.pendingCount > 0) {
    lines.push(`📥 *Inbox Pending:* _${data.pendingCount} transaksi butuh review_ (\`/inbox\`)`);
  }

  return lines.join('\n');
}

/**
 * Format Pesan Perintah /anggaran
 * Menampilkan pengelompokan pos yang SUDAH DISET dan BELUM DISET secara transparan
 */
export function formatAnggaranMessage(categories: CategoryBudgetItem[], periodLabel: string): string {
  const lines: string[] = [];

  const configured = categories.filter((c) => c.limit > 0);
  const unconfigured = categories.filter((c) => c.limit <= 0);

  const totalLimit = configured.reduce((sum, c) => sum + c.limit, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);

  lines.push(`📋 *STATUS & KESIAPAN ANGGARAN KELUARGA*`);
  lines.push(`_Periode Finansial: ${periodLabel}_\n`);

  lines.push(`📊 *Kelengkapan Pos:* *${configured.length}/${categories.length} Pos Sudah Diset*`);
  lines.push(`💰 *Total Pagu:* \`${formatRupiah(totalLimit)}\` • *Terpakai:* \`${formatRupiah(totalSpent)}\`\n`);

  // Pos yang sudah diset
  if (configured.length > 0) {
    lines.push(`✅ *POS YANG SUDAH DISET:*`);
    for (const cat of configured) {
      const remaining = Math.max(0, cat.limit - cat.spent);
      lines.push(`${cat.emoji} *${cat.name}* • ${generateProgressBar(cat.percentage)}`);
      lines.push(`   Terpakai: \`${formatRupiah(cat.spent)}\` / \`${formatRupiah(cat.limit)}\` _(Sisa: ${formatRupiah(remaining)})_`);
    }
  }

  // Pos yang belum diset
  if (unconfigured.length > 0) {
    lines.push(`\n⚠️ *POS YANG BELUM DISET (${unconfigured.length} Pos):*`);
    for (const cat of unconfigured) {
      const spentText = cat.spent > 0 ? ` _(Sudah ada belanja: ${formatRupiah(cat.spent)})_` : '';
      lines.push(`• ${cat.emoji} *${cat.name}:* _Belum ada pagu_${spentText}`);
    }
    const sample = unconfigured[0];
    lines.push(`\n💡 *Cara Mengatur:* \`set anggaran ${sample.name.toLowerCase()} 500rb\``);
  } else {
    lines.push(`\n🎉 *Seluruh ${categories.length} pos anggaran keluarga telah lengkap terisi!*`);
  }

  lines.push(`\n👉 _Ketik \`/status\` untuk kas harian atau \`/setup\` untuk checklist lengkap._`);
  return lines.join('\n');
}

/**
 * Format Pesan Konfirmasi Pembaruan Anggaran Disertai Status Kelengkapan Pos
 */
export function formatBudgetUpdatedWithStatusMessage(
  updatedCat: { name: string; emoji: string },
  amount: number,
  categories: CategoryBudgetItem[],
  periodLabel: string
): string {
  const configured = categories.filter((c) => c.limit > 0);
  const unconfigured = categories.filter((c) => c.limit <= 0);
  const totalLimit = configured.reduce((sum, c) => sum + c.limit, 0);

  const lines: string[] = [];
  lines.push(`📋 *ANGGARAN BERHASIL DIPERBARUI* ✅\n`);
  lines.push(`Pos: ${updatedCat.emoji} *${updatedCat.name}*`);
  lines.push(`Pagu Baru: \`${formatRupiah(amount)}\``);
  lines.push(`Periode: *${periodLabel}*\n`);

  lines.push(`📊 *Status Kelengkapan (${configured.length}/${categories.length} Pos Diset):*`);
  lines.push(`Total Pagu Terkumpul: \`${formatRupiah(totalLimit)}\`\n`);

  if (unconfigured.length > 0) {
    lines.push(`⚠️ *Masih Belum Diset (${unconfigured.length} Pos):*`);
    for (const u of unconfigured) {
      lines.push(`• ${u.emoji} ${u.name}`);
    }
    lines.push(`\n👉 _Atur pos berikutnya, contoh:_ \`set anggaran ${unconfigured[0].name.toLowerCase()} 500rb\``);
  } else {
    lines.push(`🎉 *Luar biasa! Seluruh 8 pos anggaran keluarga kini sudah terisi lengkap.*`);
  }

  return lines.join('\n');
}

/**
 * Format Pesan Perintah /rekap
 */
export function formatRekapMessage(data: RekapSummaryData): string {
  const lines: string[] = [];

  lines.push(`📈 *REKAP PENGELUARAN MINGGUAN*`);
  lines.push(`_Rentang: ${data.weekLabel}_\n`);

  lines.push(`🛒 *Minggu Ini:* \`${formatRupiah(data.currentWeekTotal)}\``);
  lines.push(`⏮️ *Minggu Lalu:* \`${formatRupiah(data.previousWeekTotal)}\``);

  if (data.previousWeekTotal > 0) {
    const icon = data.isIncrease ? '📈 Naik' : '📉 Turun';
    lines.push(`📊 *Tren:* ${icon} ${data.comparisonPercent}% dibanding minggu lalu.`);
  }

  if (data.topCategoryName && data.topCategoryAmount) {
    lines.push(`🏆 *Pos Terbesar:* ${data.topCategoryName} (\`${formatRupiah(data.topCategoryAmount)}\`)`);
  }

  lines.push(`\n🎯 _Prioritaskan pos esensial keluarga agar cash flow tetap sehat._`);
  return lines.join('\n');
}

/**
 * Format Pesan Perintah /hariini atau /today (Urutan Kronologis per Waktu + Ringkasan per Kategori)
 */
export function formatTodayExpensesMessage(data: TodayExpensesData): string {
  const lines: string[] = [];

  lines.push(`📅 *PENGELUARAN HARI INI*`);
  lines.push(`_${data.dateLabel}_\n`);

  if (data.items.length === 0) {
    lines.push(`✅ *Belum ada pengeluaran yang tercatat hari ini.*`);
    lines.push(`Kas belanja keluarga tetap aman dan terkendali. 🎯`);
    return lines.join('\n');
  }

  lines.push(`🕒 *Urutan Waktu:*`);
  const categoryAgg = new Map<string, { name: string; emoji: string; count: number; total: number }>();

  data.items.forEach((item, idx) => {
    const targetCat = matchTargetCategory(item.categoryName);
    const catEmoji = targetCat.emoji || '📁';
    const catLabel = item.categoryName || targetCat.name || 'Lainnya';
    const ownerTag = item.ownerLabel ? ` (${item.ownerLabel})` : '';
    const accDisplay = item.accountName.toLowerCase().includes((item.ownerLabel || '').toLowerCase())
      ? item.accountName
      : `${item.accountName}${ownerTag}`;

    lines.push(`${idx + 1}. \`${item.time}\` • *${item.merchant}* — \`${formatRupiah(item.amount)}\``);
    lines.push(`   ${catEmoji} ${catLabel} • 🏦 ${accDisplay}`);

    const key = catLabel.toLowerCase();
    const prev = categoryAgg.get(key);
    if (prev) {
      prev.count += 1;
      prev.total += item.amount;
    } else {
      categoryAgg.set(key, {
        name: catLabel,
        emoji: catEmoji,
        count: 1,
        total: item.amount,
      });
    }
  });

  const sortedCategories = Array.from(categoryAgg.values()).sort((a, b) => b.total - a.total);
  lines.push(`\n📁 *Per Kategori:*`);
  for (const cat of sortedCategories) {
    lines.push(`• ${cat.emoji} *${cat.name}* _(${cat.count}x)_: \`${formatRupiah(cat.total)}\``);
  }

  lines.push(`\n💰 *Total Hari Ini:* \`${formatRupiah(data.totalAmount)}\` _(${data.items.length} transaksi)_`);
  lines.push(`👉 _Balas "masuk dapur" pada notifikasi transaksi untuk ubah kategori, atau ketik \`/anggaran\` untuk cek kuota._`);
  return lines.join('\n');
}

/**
 * Format Laporan Harian Siang Pukul 11:00 WIB (Ringkasan Kas, Pengeluaran, Cuaca Yogyakarta, Libur Pemerintah & Motivasi Harian)
 */
export function formatDaily11AMReportMessage(data: Daily11AMReportData): string {
  const lines: string[] = [];

  lines.push(`☀️ *LAPORAN HARIAN PUKUL 11:00 WIB*`);
  lines.push(`_${data.dateLabel}_`);

  // 1. Info Cuaca Yogyakarta & Hari Libur Resmi Pemerintah
  lines.push(`\n${data.weather.emoji} *Cuaca ${data.weather.city}:* *${data.weather.condition}* (\`${data.weather.temperature}°C\` • Rentang \`${data.weather.minTemp}°–${data.weather.maxTemp}°C\`)`);
  lines.push(`🌧️ *Peluang Hujan:* \`${data.weather.rainProbability}%\` — _${data.weather.tip}_`);
  lines.push(`${data.holiday.summaryText}`);

  // 2. Ringkasan Posisi Kas & Anggaran
  lines.push(`\n💼 *Ringkasan Kas Keluarga:*`);
  for (const acc of data.accounts) {
    lines.push(`• *${acc.name}:* \`${formatRupiah(acc.balance)}\``);
  }
  lines.push(`💰 *Total Kas Siap Pakai:* \`${formatRupiah(data.totalBalance)}\``);

  const bar = generateProgressBar(data.monthPercentage, 10);
  lines.push(`\n📊 *Status Anggaran Bulan Ini:*`);
  lines.push(`\`${bar}\` *${data.monthPercentage}%*`);
  lines.push(`• Terpakai: \`${formatRupiah(data.totalSpentMonth)}\` dari \`${formatRupiah(data.totalBudgetLimit)}\``);
  lines.push(`• Batas Aman Harian: \`${formatRupiah(data.safeDailySpend)} / hari\` _(${data.daysRemaining} hari menuju gajian)_`);

  // 3. Rincian Pengeluaran Hari Ini (Urutan Waktu + Per Kategori)
  lines.push(`\n🕒 *Pengeluaran Hari Ini (s.d. Siang):*`);
  if (data.todayItems.length === 0) {
    lines.push(`✅ _Belum ada pengeluaran tercatat hari ini (Rp 0)._`);
  } else {
    const categoryAgg = new Map<string, { name: string; emoji: string; count: number; total: number }>();

    data.todayItems.forEach((item, idx) => {
      const targetCat = matchTargetCategory(item.categoryName);
      const catEmoji = targetCat.emoji || '📁';
      const catLabel = item.categoryName || targetCat.name || 'Lainnya';
      lines.push(`${idx + 1}. \`${item.time}\` • *${item.merchant}* — \`${formatRupiah(item.amount)}\` (${catEmoji} ${catLabel})`);

      const key = catLabel.toLowerCase();
      const prev = categoryAgg.get(key);
      if (prev) {
        prev.count += 1;
        prev.total += item.amount;
      } else {
        categoryAgg.set(key, { name: catLabel, emoji: catEmoji, count: 1, total: item.amount });
      }
    });

    const sortedCategories = Array.from(categoryAgg.values()).sort((a, b) => b.total - a.total);
    lines.push(`\n📁 *Per Kategori Hari Ini:*`);
    for (const cat of sortedCategories) {
      lines.push(`• ${cat.emoji} *${cat.name}* _(${cat.count}x)_: \`${formatRupiah(cat.total)}\``);
    }
    lines.push(`💸 *Total Belanja Hari Ini:* \`${formatRupiah(data.todaySpent)}\` _(${data.todayItems.length} transaksi)_`);
  }

  // 4. Caption Motivasi Keuangan Harian
  lines.push(`\n💡 *Motivasi Keuangan Hari Ini:*`);
  lines.push(`_"${data.dailyCaption}"_`);

  return lines.join('\n');
}

/**
 * Format Pesan Perintah /inbox
 */
export function formatInboxMessage(data: InboxSummaryData): string {
  const lines: string[] = [];

  lines.push(`📥 *KOTAK MASUK & TRANSAKSI GANTUNG*`);

  if (data.pendingCount === 0 && data.unreviewedRawCount === 0) {
    lines.push(`\n✅ *Semua transaksi bersih dan terverifikasi.*`);
    lines.push(`Tidak ada mutasi yang menunggu konfirmasi saat ini.`);
    return lines.join('\n');
  }

  lines.push(`\n⚠️ *Perhatian Dibutuhkan:*`);
  lines.push(`⏳ *Pending Review:* *${data.pendingCount} transaksi*`);
  if (data.unreviewedRawCount > 0) {
    lines.push(`📱 *Notifikasi Mentah:* *${data.unreviewedRawCount} mutasi*`);
  }
  if (data.oldestPendingDate) {
    lines.push(`🕒 *Tertua:* _${data.oldestPendingDate}_`);
  }

  lines.push(`\n👉 _Buka menu *Transactions* di dasbor untuk verifikasi atau gunakan *Rekonsiliasi AI*._`);
  return lines.join('\n');
}

/**
 * Format Pesan Panduan Bantuan /help atau /start
 */
export function formatHelpMessage(): string {
  return `🤖 *ASISTEN KEUANGAN KELUARGA*

Halo! Saya bot asisten keuangan yang terhubung langsung ke dasbor keluarga Anda.

📋 *Menu Laporan & Status:*
📊 \`/status\` — Ringkasan kas, belanja & batas aman harian
📅 \`/hariini\` — Rincian pengeluaran hari ini (urutan waktu & kategori)
☀️ \`/laporansiang\` — Laporan 11:00 WIB, cuaca Yogyakarta & libur nasional
📋 \`/anggaran\` — Kuota belanja 8 kategori (lengkap dengan status pos diset / belum)
📈 \`/rekap\` — Pengeluaran 7 hari & tren vs minggu lalu
📥 \`/inbox\` — Cek mutasi gantung yang butuh konfirmasi
⚙️ \`/pengaturan\` — Pusat kendali rekening, saldo, pagu, gajian & spam
💡 \`/help\` — Panduan bantuan perintah ini

⚙️ *Pengaturan Langsung via Chat:*
• \`set anggaran dapur 1,5jt\` — Mengatur pagu belanja kategori
• \`set saldo dana suami 2jt\` — Sinkronisasi saldo rekening riil
• \`set gajian 25\` — Mengatur tanggal siklus gajian keluarga (tgl 1-28)

💬 *Catat Mutasi & Tanya Jawab AI:*
• _"tadi beli martabak 35rb pake gopay"_
• _"pengeluaran hari ini apa saja?"_
• _"sisa anggaran belanja dapur masih aman?"_
• _Reply pesan alert dengan "masuk dapur" untuk koreksi kategori_
• Kirimkan foto struk kasir / bukti transfer untuk dicatat otomatis

🔒 _Data terenkripsi dan terlindungi whitelist chat ID keluarga._`;
}

/**
 * Format Nudge: Rekap Mingguan Senin Pagi
 */
export function formatWeeklyDigestNudge(data: RekapSummaryData): string {
  return `☕ *SELAMAT SENIN PAGI - REKAP KEUANGAN KELUARGA*

Mari awali pekan ini dengan meninjau arus kas 7 hari kemarin:

• Total Belanja Sepekan: *${formatRupiah(data.currentWeekTotal)}*
${data.previousWeekTotal > 0 ? `• Tren: *${data.isIncrease ? 'Naik' : 'Turun'} ${data.comparisonPercent}%* vs pekan sebelumnya.\n` : ''}
${data.topCategoryName ? `Pengeluaran terbesar ada di pos *${data.topCategoryName}* (\`${formatRupiah(data.topCategoryAmount || 0)}\`).\n` : ''}
Semoga pekan ini penuh berkah dan belanja tetap terkendali! 🎯`;
}

/**
 * Format Nudge: Pengingat Menabung Awal Bulan (Pay Yourself First)
 */
export function formatPayYourselfFirstNudge(paydayDate: number): string {
  return `🎉 *HARI GAJIAN KELUARGA (TANGGAL ${paydayDate})*

Alhamdulillah, hak pendapatan telah tiba! Sebelum membuka keran belanja rutin bulanan, mari terapkan prinsip:

💡 *Pay Yourself First:*
1. Sisihkan tabungan dana darurat (10–20%).
2. Siapkan alokasi investasi keluarga.
3. Kunci pos tabungan masa depan terlebih dahulu.

_Ketik \`/anggaran\` untuk memeriksa rencana alokasi pos belanja bulan ini._`;
}

/**
 * Format Nudge: Pengingat Tagihan H-2 Jatuh Tempo (Tanggal 18)
 */
export function formatBillReminderNudge(): string {
  return `⚡ *PENGINGAT TAGIHAN RUTIN KELUARGA (H-2)*

Menjelang tanggal 20, pastikan seluruh tagihan utilitas rumah tangga telah diselesaikan agar terhindar dari denda atau pemutusan:

• Listrik PLN & Token Rumah 🔌
• Internet / Wi-Fi Rumah 🌐
• Iuran BPJS Kesehatan 🏥
• PDAM / Air Bersih 💧

_Periksa status pembayaran di pos *Tagihan & Utilitas* melalui perintah \`/anggaran\`._`;
}

/**
 * Format Nudge: Cek Ritme Belanja Tengah Bulan (H+15 dari gajian)
 */
export function formatMidMonthNudge(monthPercentage: number, totalSpent: number, safeDailySpend: number, daysRemaining: number): string {
  return `⏳ *CEK FINANSIAL TENGAH BULAN (H+15)*

Bulan finansial telah berjalan separuh jalan. Berikut posisi pengeluaran keluarga saat ini:

• Total Pengeluaran: *${formatRupiah(totalSpent)}* (${monthPercentage}% dari pagu)
• Sisa Waktu Menuju Gajian: *${daysRemaining} hari lagi*
• Rekomendasi Belanja Harian: \`${formatRupiah(safeDailySpend)} / hari\`

${monthPercentage > 60 ? '⚠️ _Pengeluaran sedikit di atas target tengah bulan (>60%). Mari bersama-sama mengerem pos jajan & jalan-jalan untuk 2 pekan ke depan._' : '✅ _Ritme pengeluaran sangat sehat dan terkendali. Pertahankan hingga akhir bulan!_'} 👏`;
}

/**
 * Format Nudge: Darurat Batas Anggaran 100%
 */
export function formatOverbudgetAlert(categoryName: string, totalSpent: number, limitAmount: number, overspent: number): string {
  return `🚨 *PERINGATAN DARURAT: ANGGARAN ${categoryName.toUpperCase()} TELAH HABIS*

Pos pengeluaran *${categoryName}* telah melampaui batas 100% yang disepakati:

• Batas Anggaran: \`${formatRupiah(limitAmount)}\`
• Total Terpakai: \`${formatRupiah(totalSpent)}\`
• Melebihi Batas: \`${formatRupiah(overspent)}\`

Mohon jeda atau tahan sementara pengeluaran non-esensial pada pos ini hingga siklus gajian berikutnya tiba. 🙏`;
}

/**
 * Format Pesan Real-time Alert Pengeluaran Baru dengan Tombol Interaktif
 */
export function formatExpenseAlertMessage(tx: {
  merchant: string;
  amount: number;
  categoryName: string;
  accountName: string;
  sourceDevice?: string;
  isAutoReconciled?: boolean;
  transactionDate?: string | Date;
}): string {
  const deviceBadge = tx.sourceDevice ? (tx.sourceDevice.includes('istri') ? '(Istri)' : '(Suami)') : '';
  const header = tx.isAutoReconciled
    ? `💸 *PENGELUARAN DICATAT OTOMATIS* ✅`
    : `💸 *PENGELUARAN BARU TERDETEKSI*`;
  const footer = tx.isAutoReconciled
    ? `_Format baku terverifikasi (Status: Reconciled). Saldo dan anggaran telah disesuaikan._`
    : `_Apakah hasil pencatatan ini sudah sesuai?_`;

  return `${header}

🛒 *Merchant:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📁 *Kategori:* ${tx.categoryName}
🏦 *Sumber:* ${tx.accountName} ${deviceBadge}
🕒 *Waktu:* ${formatDateWIB(tx.transactionDate || new Date())}

${footer}`;
}

/**
 * Format Pesan Real-time Alert Pemasukan Baru dengan Tombol Interaktif
 */
export function formatIncomeAlertMessage(tx: {
  merchant: string;
  amount: number;
  categoryName: string;
  accountName: string;
  sourceDevice?: string;
  isAutoReconciled?: boolean;
  transactionDate?: string | Date;
}): string {
  const deviceBadge = tx.sourceDevice ? (tx.sourceDevice.includes('istri') ? '(Istri)' : '(Suami)') : '';
  const header = tx.isAutoReconciled
    ? `📈 *PEMASUKAN DICATAT OTOMATIS* ✅`
    : `📈 *PEMASUKAN BARU TERDETEKSI*`;
  const footer = tx.isAutoReconciled
    ? `_Format baku terverifikasi (Status: Reconciled). Saldo rekening telah diselaraskan._\n_Pemasukan menambah total kas keluarga dan tidak memotong pagu anggaran._`
    : `_Apakah hasil pencatatan pemasukan ini sudah sesuai?_\n_Pemasukan menambah total kas keluarga dan tidak memotong pagu anggaran._`;

  return `${header}

💵 *Sumber:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📁 *Kategori:* ${tx.categoryName}
🏦 *Masuk ke:* ${tx.accountName} ${deviceBadge}
🕒 *Waktu:* ${formatDateWIB(tx.transactionDate || new Date())}

${footer}`;
}

/**
 * Format Pesan Real-time Alert Perpindahan Dana Internal / Top-Up E-Wallet
 */
export function formatInternalTransferAlertMessage(tx: {
  fromAccount: string;
  toAccount: string;
  amount: number;
  transactionDate?: string | Date;
}): string {
  return `🔄 *PERPINDAHAN DANA TERDETEKSI* ✅

💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📤 *Dari:* ${tx.fromAccount}
📥 *Ke:* ${tx.toAccount}
🕒 *Waktu:* ${formatDateWIB(tx.transactionDate || new Date())}

_Saldo kedua rekening otomatis diselaraskan dan tidak dihitung memotong anggaran belanja keluarga._`;
}

/**
 * Format Pesan Pengeluaran Terverifikasi
 */
export function formatExpenseVerifiedMessage(tx: {
  merchant: string;
  amount: number;
  categoryName: string;
  accountName: string;
  verifiedBy?: string;
  transactionDate?: string | Date;
}): string {
  return `💸 *PENGELUARAN TERVERIFIKASI* ✅

🛒 *Merchant:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📁 *Kategori:* ${tx.categoryName}
🏦 *Sumber:* ${tx.accountName}
🕒 *Waktu:* ${formatDateWIB(tx.transactionDate || new Date())}

_Diverifikasi oleh ${tx.verifiedBy || 'Keluarga'} (Status: Reconciled)_`;
}

/**
 * Format Pesan Pengeluaran Ditolak / Dibatalkan
 */
export function formatExpenseRejectedMessage(tx: {
  merchant: string;
  amount: number;
  reason: string;
  learnedByAi?: boolean;
}): string {
  const aiNote = tx.learnedByAi
    ? `\n\n💡 _Pola teks ini telah dipelajari oleh AI agar otomatis diabaikan di kemudian hari._`
    : '';

  return `❌ *PENGELUARAN DIBATALKAN*

🛒 *Merchant:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📝 *Alasan:* ${tx.reason}${aiNote}`;
}

/**
 * Format Pesan Hasil Pemindaian Foto Struk / Bukti Transfer
 */
export function formatReceiptScanSuccessMessage(result: {
  merchant: string;
  amount: number;
  categoryName: string;
  accountName: string;
  transactionDate?: string | Date;
}): string {
  return `📸 *STRUK BERHASIL DIPINDAI*

🛒 *Merchant:* ${result.merchant}
💰 *Total Belanja:* \`${formatRupiah(result.amount)}\`
📁 *Kategori:* ${result.categoryName}
🏦 *Sumber:* ${result.accountName}
🕒 *Waktu:* ${formatDateWIB(result.transactionDate || new Date())}

_Data telah dicatat. Apakah hasil pembacaan ini sudah benar?_`;
}

