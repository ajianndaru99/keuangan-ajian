# Rencana Implementasi: Smart Financial Reminder & Cek Berkala Bot Telegram

Dokumen ini mendokumentasikan spesifikasi teknis, arsitektur, dan tahapan implementasi sistem pengingat finansial profesional (*financial nudges*) serta pemeriksaan berkala interaktif melalui Bot Telegram untuk aplikasi Dasbor Keuangan Keluarga.

---

## 1. Filosofi & Standar Pengingat Finansial Profesional

Pengingat dirancang menyerupai asisten finansial pribadi (*financial companion*) yang elegan dan beretika, dengan empat pilar:

1. **Kontekstual & Memberi Solusi (*Actionable Insights*)**:
   Tidak sekadar menyajikan angka pengeluaran mentah, melainkan menghitung daya belanja harian aman (*Safe-to-Spend Daily Burn Rate*):
   $$\text{Batas Belanja Harian Aman} = \frac{\text{Sisa Batas Anggaran}}{\text{Sisa Hari Hingga Tanggal Gajian}}$$
2. **Bahasa Netral & Kolaboratif (Tanpa Menghakimi)**:
   Keuangan keluarga adalah ranah sensitif; pesan dirancang mendukung kemitraan (*teamwork*) suami-istri tanpa menyudutkan salah satu pihak ketika anggaran menipis.
3. **Format Tipografi & Visual Khusus Telegram**:
   Memanfaatkan *Markdown*, visual *progress bar* karakter monospaced (`[██████░░░░] 60%`), serta penyusunan pesan yang rapi dan nyaman dibaca di layar ponsel.
4. **Disiplin Frekuensi (*Cadence Discipline*)**:
   Semua notifikasi proaktif harian dipusatkan ke **satu waktu** di pagi hari (pukul 08:00 WIB), mencegah distraksi di jam kerja dan menghindari kelelahan notifikasi (*notification fatigue*).

---

## 2. Fitur Utama

### A. Cek Berkala Interaktif (*On-Demand Commands via Chat Telegram*)
Suami atau Istri dapat mengirimkan perintah langsung ke Bot Telegram atau di dalam grup keluarga kapan saja:

| Perintah | Deskripsi & Isi Pesan Balasan |
|---|---|
| `/status` atau `/cek` | **Detak Finansial Terkini**: Total saldo kas seluruh rekening, total pengeluaran bulan berjalan, persentase terhadap batas anggaran, dan batas belanja harian aman (*daily safe-to-spend*). |
| `/anggaran` | **Status Kuota Kategori**: Visual *progress bar* real-time untuk 8 kategori anggaran bulanan beserta nominal terpakai vs batas. |
| `/rekap` | **Perbandingan Periode**: Pengeluaran minggu ini dibandingkan minggu lalu dan kategori yang menyerap dana terbesar. |
| `/inbox` | **Pemeriksaan Transaksi Gantung**: Jumlah mutasi bank yang masih berstatus `pending` atau memerlukan konfirmasi di dasbor. |
| `/help` | Panduan lengkap daftar perintah dan cara interaksi bot. |

### B. Pengingat Berkala Otomatis (*Proactive Scheduled Nudges via Cron*)
Dijalankan oleh satu *scheduler cron* setiap hari pukul 08:00 WIB (01:00 UTC):

1. **Cek Kesehatan Berkala Tengah Bulan (*Mid-Month Burn Rate Check*)**:
   - *Pemicu*: Tepat H+15 dari tanggal awal bulan finansial (`month_start_day`).
   - *Evaluasi*: Jika pengeluaran telah mencapai $>60\%$ padahal bulan baru berjalan separuh, bot memberikan sinyal ramah untuk menjaga ritme belanja sisa bulan.
2. **Pengingat Menabung Awal Bulan (*Pay Yourself First*)**:
   - *Pemicu*: Tanggal gajian (disetel di `settings.month_start_day`, misal tgl 25).
   - *Pesan*: Mengingatkan untuk mengamankan pos tabungan, dana darurat, atau investasi keluarga terlebih dahulu sebelum alokasi belanja harian dibuka.
3. **Pengingat Tagihan Wajib Bulanan (H-2 Jatuh Tempo)**:
   - *Pemicu*: Tanggal 18 setiap bulan (menjelang tanggal 20).
   - *Pesan*: Daftar tagihan rutin (listrik PLN, internet rumah, BPJS) agar terselesaikan tepat waktu tanpa terkena denda.
4. **Rekap Finansial Mingguan (*Weekly Digest*)**:
   - *Pemicu*: Setiap hari Senin pagi pukul 07:30–08:00 WIB.
   - *Pesan*: Rangkuman total belanja 7 hari terakhir, kategori terboros, dan sisa hari menuju gajian berikutnya.
5. **Peringatan Anggaran Habis (*Critical Overbudget Alert 100%*)**:
   - *Pemicu*: Real-time saat transaksi baru membuat kategori belanja menyentuh $100\%$.
   - *Pesan*: Peringatan darurat otomatis ke grup Telegram keluarga agar kedua belah pihak bersama-sama mengerem pengeluaran di pos tersebut.

---

## 3. Tantangan Teknis & Strategi Mitigasi

| # | Tantangan Teknis | Risiko / Dampak | Solusi & Mitigasi |
|---|---|---|---|
| 1 | **Batasan Cron Vercel (Hobby Tier)** | Vercel Hobby membatasi frekuensi cron (1 eksekusi per hari per endpoint). | Seluruh pemicu berkala dikonsolidasikan ke dalam satu endpoint cerdas `src/app/api/cron/financial-nudges/route.ts` yang berjalan setiap pukul 08:00 WIB. Fungsi ini menginspeksi tanggal hari ini dan menjalankan logika yang relevan (Senin = rekap, tgl gajian = menabung, tgl 18 = tagihan, H+15 = burn rate). |
| 2 | **Keamanan & Privasi Chat ID** | Username bot Telegram dapat dicari publik; pihak luar berpotensi memicu perintah bot. | Penerapan *whitelist* ketat pada `TELEGRAM_ALLOWED_CHAT_IDS`. Bot memvalidasi `chat.id` pengirim sebelum memproses kueri database. Permintaan dari ID yang tidak terdaftar akan ditolak secara *fail-closed*. |
| 3 | **Timeout Webhook Telegram (3 Detik)** | Kueri database agregasi yang lambat akan memicu retry berulang dari Telegram. | Optimasi kueri Supabase terindeks, validasi header `X-Telegram-Bot-Api-Secret-Token`, dan pengiriman respon balasan HTTP 200 secara instan. |
| 4 | **Perhitungan Periode Finansial Dinamis** | Siklus keuangan keluarga mengikuti tanggal gajian (misal tgl 25), bukan tanggal 1 kalender Masehi. | Memanfaatkan modul [src/lib/date-utils.ts](file:///c:/Users/FAPERTA%201/Documents/FAPERTA/File%20Ajian/dashboard-keuangan-keluarga/src/lib/date-utils.ts) untuk menghitung awal dan akhir siklus keuangan secara konsisten di seluruh endpoint. |

---

## 4. Rincian Tahapan Implementasi

### Langkah 1: Klien Telegram & Visual Formatters
- **Berkas**: `src/lib/telegram/bot.ts`
  - Fungsi `sendTelegramMessage(chatId, text, options)` berbasis `fetch` native tanpa dependensi eksternal.
  - Penanganan error HTTP Telegram API dengan pesan log deskriptif.
- **Berkas**: `src/lib/telegram/formatters.ts`
  - Generator karakter monospaced *progress bar* (misal: `generateProgressBar(percentage)`).
  - Format pesan untuk `/status`, `/anggaran`, `/rekap`, dan notifikasi terjadwal.

### Langkah 2: Endpoint Webhook Interaktif
- **Berkas**: `src/app/api/telegram/webhook/route.ts`
  - Menerima POST request dari Telegram Bot API.
  - Validasi secret token webhook.
  - Parser perintah (`/status`, `/anggaran`, `/rekap`, `/inbox`, `/help`).
  - Menghitung agregasi saldo akun dan anggaran kategori dari Supabase, lalu mengirimkan pesan balasan.

### Langkah 3: Mesin Pengingat Cerdas Terjadwal (Cron Nudges)
- **Berkas**: `src/app/api/cron/financial-nudges/route.ts`
  - Endpoint yang dipicu oleh Vercel Cron.
  - Proteksi header `Authorization: Bearer CRON_SECRET`.
  - Evaluasi multi-kondisi harian:
    - Apakah hari ini Senin? $\rightarrow$ Kirim Rekap Mingguan.
    - Apakah hari ini hari gajian (`month_start_day`)? $\rightarrow$ Kirim Pengingat Menabung.
    - Apakah hari ini H-2 tagihan (tanggal 18)? $\rightarrow$ Kirim Pengingat Tagihan.
    - Apakah hari ini H+15 dari gajian? $\rightarrow$ Kirim Cek Burn Rate Tengah Bulan.
- **Berkas**: `vercel.json`
  - Menambahkan konfigurasi jadwal cron `0 1 * * *` (pukul 08:00 WIB).

### Langkah 4: Integrasi Alert Anggaran Kritis ke Telegram
- **Berkas**: `src/app/api/notification/route.ts` & `src/lib/budget/budget-guard.ts`
  - Saat `budgetAlert.level === '100'`, selain memicu notifikasi lokal Android, sistem juga memicu pengiriman pesan peringatan ke `TELEGRAM_CHAT_ID` keluarga.

### Langkah 5: Pengujian Kualitas & Unit Test
- **Berkas**: `tests/telegram-bot.test.ts`
  - Unit test generator format progress bar dan pembentukan teks pesan.
  - Unit test filter keamanan chat ID dan penanganan perintah bot.
  - Unit test kalkulasi *safe-to-spend daily burn rate*.
- **Tiga Gerbang Kualitas**:
  1. `npm test`: Seluruh unit test lulus.
  2. `npx tsc --noEmit`: 0 error mode strict.
  3. `npm run build`: Kompilasi Next.js lulus.

---

## 5. Konfigurasi Variabel Lingkungan (.env)

| Variabel | Keterangan | Contoh Nilai |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token otentikasi bot dari `@BotFather` | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | Daftar ID chat atau grup keluarga yang diizinkan (dipisah koma) | `-1001234567890,987654321` |
| `TELEGRAM_WEBHOOK_SECRET` | Token rahasia acak untuk memverifikasi keaslian webhook Telegram | `rahasia_webhook_telegram_keluarga_99` |
| `CRON_SECRET` | Token otorisasi untuk memicu endpoint cron terjadwal | `cron_secret_token_123` |
