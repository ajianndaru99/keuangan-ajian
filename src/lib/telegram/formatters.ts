// ==============================================================================
// TELEGRAM FORMATTERS: src/lib/telegram/formatters.ts
// Tipografi, Visual Progress Bar, & Template Pesan Interaktif Finansial
// ==============================================================================

import { formatRupiah } from '../utils.ts';

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
 * Format Pesan Perintah /status atau /cek
 */
export function formatStatusMessage(data: StatusSummaryData): string {
  const lines: string[] = [];

  lines.push(`📊 *DETAK FINANSIAL KELUARGA*`);
  lines.push(`_Periode: ${data.periodLabel}_\n`);

  lines.push(`💰 *Saldo Dompet & Kas Bersih:*`);
  if (data.accounts.length === 0) {
    lines.push(`_Belum ada data rekening terdaftar._`);
  } else {
    for (const acc of data.accounts) {
      lines.push(`• ${acc.name} (${acc.owner}): \`${formatRupiah(acc.balance)}\``);
    }
  }
  lines.push(`*Total Kas Siap Pakai:* \`${formatRupiah(data.totalBalance)}\`\n`);

  lines.push(`💳 *Realisasi Anggaran Bulan Ini:*`);
  lines.push(`• Total Belanja: \`${formatRupiah(data.totalSpentMonth)}\``);
  if (data.totalBudgetLimit > 0) {
    lines.push(`• Batas Pagu: \`${formatRupiah(data.totalBudgetLimit)}\``);
    lines.push(`• Utilisasi: ${generateProgressBar(data.monthPercentage)}`);
  }
  lines.push('');

  lines.push(`🎯 *Daya Belanja Harian Aman (Safe-to-Spend):*`);
  lines.push(`• Sisa Waktu Menuju Gajian: *${data.daysRemaining} hari*`);
  lines.push(`• Batas Belanja Harian: \`${formatRupiah(data.safeDailySpend)} / hari\``);
  lines.push(`_Jaga ritme pengeluaran di bawah batas harian agar surplus tetap terjaga._`);

  return lines.join('\n');
}

/**
 * Format Pesan Perintah /anggaran
 */
export function formatAnggaranMessage(categories: CategoryBudgetItem[], periodLabel: string): string {
  const lines: string[] = [];

  lines.push(`📋 *STATUS KUOTA ANGGARAN KELUARGA*`);
  lines.push(`_Periode: ${periodLabel}_\n`);

  if (categories.length === 0) {
    lines.push(`_Belum ada pos anggaran aktif yang disetel bulan ini._`);
    lines.push(`Atur batas anggaran melalui dasbor menu Anggaran Belanja.`);
    return lines.join('\n');
  }

  for (const cat of categories) {
    lines.push(`${cat.emoji} *${cat.name}*`);
    if (cat.limit > 0) {
      lines.push(`${generateProgressBar(cat.percentage)}`);
      lines.push(`Terpakai: \`${formatRupiah(cat.spent)}\` / \`${formatRupiah(cat.limit)}\``);
    } else {
      lines.push(`Terpakai: \`${formatRupiah(cat.spent)}\` _(Batas belum disetel)_`);
    }
    lines.push('');
  }

  lines.push(`_Ketik /status untuk ringkasan kas atau /rekap untuk analisis mingguan._`);
  return lines.join('\n');
}

/**
 * Format Pesan Perintah /rekap
 */
export function formatRekapMessage(data: RekapSummaryData): string {
  const lines: string[] = [];

  lines.push(`📈 *REKAP PENGELUARAN MINGGUAN*`);
  lines.push(`_Rentang: ${data.weekLabel}_\n`);

  lines.push(`• Belanja Minggu Ini: *${formatRupiah(data.currentWeekTotal)}*`);
  lines.push(`• Belanja Minggu Lalu: *${formatRupiah(data.previousWeekTotal)}*`);

  if (data.previousWeekTotal > 0) {
    const icon = data.isIncrease ? '📈 Naik' : '📉 Turun';
    lines.push(`• Perubahan: *${icon} ${data.comparisonPercent}%* dibanding minggu lalu.`);
  }
  lines.push('');

  if (data.topCategoryName && data.topCategoryAmount) {
    lines.push(`🏆 *Pos Pengeluaran Terbesar:*`);
    lines.push(`• ${data.topCategoryName}: \`${formatRupiah(data.topCategoryAmount)}\`\n`);
  }

  lines.push(`_Evaluasi bersama dan prioritaskan kebutuhan esensial keluarga._`);
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
  lines.push(`• Transaksi Pending Review: *${data.pendingCount} transaksi*`);
  if (data.unreviewedRawCount > 0) {
    lines.push(`• Notifikasi Mentah Belum Terurai: *${data.unreviewedRawCount} mutasi*`);
  }
  if (data.oldestPendingDate) {
    lines.push(`• Transaksi Tertua Menunggu: _${data.oldestPendingDate}_`);
  }

  lines.push(`\nSilakan buka Dasbor Keuangan di HP/laptop untuk verifikasi atau gunakan tombol *Rekonsiliasi AI* untuk menyetujui sekaligus.`);
  return lines.join('\n');
}

/**
 * Format Pesan Panduan Bantuan /help atau /start
 */
export function formatHelpMessage(): string {
  return `🤖 *ASISTEN KEUANGAN KELUARGA*

Halo! Saya adalah bot asisten keuangan keluarga yang terhubung langsung ke dasbor finansial Anda.

*Perintah Interaktif yang Tersedia:*
• \`/status\` atau \`/cek\` : Ringkasan kas, daya belanja harian (_safe-to-spend_), dan utilisasi anggaran.
• \`/anggaran\` : Pantau progress bar kuota belanja 8 kategori utama.
• \`/rekap\` : Evaluasi belanja 7 hari terakhir dan perbandingan minggu lalu.
• \`/inbox\` : Cek mutasi bank gantung yang butuh konfirmasi.
• \`/help\` : Menampilkan panduan bantuan ini.

*Notifikasi Otomatis Terjadwal (08:00 WIB):*
1. *Senin Pagi* : Rekap Finansial Mingguan (_Weekly Digest_).
2. *Tanggal 18* : Pengingat Tagihan Rutin H-2 (PLN, WiFi, BPJS).
3. *Tanggal Gajian* : Pengingat Menabung Awal Bulan (_Pay Yourself First_).
4. *H+15 Gajian* : Cek Ritme Belanja Tengah Bulan (_Mid-Month Burn Rate_).
5. *Real-time* : Darurat Peringatan Kuota Anggaran Habis 100%.

_Kerahasiaan data terjamin melalui enkripsi dan whitelist chat ID resmi keluarga._`;
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

