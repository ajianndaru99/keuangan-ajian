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
 */
export function formatAnggaranMessage(categories: CategoryBudgetItem[], periodLabel: string): string {
  const lines: string[] = [];

  lines.push(`📋 *STATUS KUOTA ANGGARAN KELUARGA*`);
  lines.push(`_Periode: ${periodLabel}_\n`);

  if (categories.length === 0) {
    lines.push(`⚠️ _Belum ada pos anggaran aktif yang disetel bulan ini._`);
    lines.push(`💡 Atur batas anggaran melalui menu *Anggaran Belanja* di dasbor.`);
    return lines.join('\n');
  }

  for (const cat of categories) {
    if (cat.limit > 0) {
      lines.push(`${cat.emoji} *${cat.name}* • ${generateProgressBar(cat.percentage)}`);
      lines.push(`   Terpakai: \`${formatRupiah(cat.spent)}\` / \`${formatRupiah(cat.limit)}\``);
    } else {
      lines.push(`${cat.emoji} *${cat.name}*: \`${formatRupiah(cat.spent)}\` _(Tanpa pagu)_`);
    }
  }

  lines.push(`\n💡 _Ketik /status untuk ringkasan kas atau /rekap untuk analisis tren._`);
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

📋 *Menu Perintah Cepat:*
📊 \`/status\` — Ringkasan kas, belanja & batas aman harian
📋 \`/anggaran\` — Kuota belanja 8 kategori utama
📈 \`/rekap\` — Pengeluaran 7 hari & tren vs minggu lalu
📥 \`/inbox\` — Cek transaksi gantung yang butuh konfirmasi
💡 \`/help\` — Panduan bantuan perintah ini

⏰ *Jadwal Pengingat Otomatis (08:00 WIB):*
☕ *Senin Pagi* — Rekap finansial mingguan
⚡ *Tgl 18* — Pengingat tagihan rutin (PLN, WiFi, BPJS)
🎉 *Tgl Gajian* — Pengingat menabung (Pay Yourself First)
⏳ *H+15* — Cek ritme belanja tengah bulan
🚨 *Real-time* — Peringatan darurat overbudget 100%

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
}): string {
  const deviceBadge = tx.sourceDevice ? (tx.sourceDevice.includes('istri') ? '(Istri)' : '(Suami)') : '';
  return `💸 *PENGELUARAN BARU TERDETEKSI*

🛒 *Merchant:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📁 *Kategori:* ${tx.categoryName}
🏦 *Sumber:* ${tx.accountName} ${deviceBadge}

_Apakah hasil pencatatan ini sudah sesuai?_`;
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
}): string {
  return `💸 *PENGELUARAN TERVERIFIKASI* ✅

🛒 *Merchant:* ${tx.merchant}
💰 *Nominal:* \`${formatRupiah(tx.amount)}\`
📁 *Kategori:* ${tx.categoryName}
🏦 *Sumber:* ${tx.accountName}

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
}): string {
  return `📸 *STRUK BERHASIL DIPINDAI*

🛒 *Merchant:* ${result.merchant}
💰 *Total Belanja:* \`${formatRupiah(result.amount)}\`
📁 *Kategori:* ${result.categoryName}
🏦 *Sumber:* ${result.accountName}

_Data telah dicatat. Apakah hasil pembacaan ini sudah benar?_`;
}

