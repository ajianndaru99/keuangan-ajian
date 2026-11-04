# Panduan Langkah demi Langkah: Setup & Integrasi Bot Telegram

Panduan ini disusun secara berurutan dan praktis agar Anda dapat langsung menghubungkan Bot Telegram ke aplikasi Dasbor Keuangan Keluarga.

---

## Ringkasan Alur Cepat (4 Langkah)

```
[1. Buat Bot via @BotFather] ➔ [2. Dapatkan Chat ID Grup] ➔ [3. Setel Environment Vercel] ➔ [4. Daftarkan Webhook]
```

---

## Langkah 1: Buat Bot di Telegram melalui @BotFather

1. Buka aplikasi **Telegram** di ponsel atau komputer Anda.
2. Pada kolom pencarian, cari akun resmi **`@BotFather`** (pastikan bercentang biru).
3. Ketuk **Start** atau kirim perintah:
   ```text
   /newbot
   ```
4. **Nama Tampilan Bot**: Masukkan nama bot sesuai keinginan Anda (contoh: `Keuangan Keluarga Ajian`).
5. **Username Bot**: Masukkan username unik yang berakhiran kata `bot` (contoh: `keuangan_keluarga_bot` atau `ajian_finance_bot`).
6. **Simpan Token**: BotFather akan mengirimkan pesan berisi **HTTP API Token**:
   ```text
   Contoh Token: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
   > ⚠️ *Simpan token ini. Token ini akan digunakan pada konfigurasi Vercel.*

---

## Langkah 2: Buat Grup Keluarga & Dapatkan Chat ID

Bot diamankan dengan whitelist (*fail-closed*), sehingga hanya Chat ID yang Anda daftarkan yang bisa mengakses data keuangan.

### Cara Mendapatkan Chat ID Grup Keluarga (Direkomendasikan):
1. Buat **Grup Telegram Baru** (misal: `"Keluarga Ajian"`).
2. Undang **Suami**, **Istri**, dan **Bot** yang baru dibuat ke dalam grup.
3. Kirim satu pesan apa saja di dalam grup tersebut (contoh: `"tes bot"`).
4. Buka browser dan buka tautan ini (ganti `<TOKEN_BOT>` dengan token Anda dari Langkah 1):
   ```text
   https://api.telegram.org/bot<TOKEN_BOT>/getUpdates
   ```
5. Cari potongan JSON berikut:
   ```json
   "chat": {
     "id": -1001987654321,
     "title": "Keluarga Ajian",
     "type": "supergroup"
   }
   ```
6. Salin angka pada `"id"`, termasuk tanda minus di depannya (contoh: `-1001987654321`).

### Opsi Tambahan (Chat Pribadi):
Jika Anda ingin bot juga bisa merespons pesan pribadi (Direct Message):
1. Buka chat pribadi ke bot Anda, ketuk **Start**.
2. Buka URL `getUpdates` di atas, temukan ID chat pribadi Anda (berupa angka positif, misal: `987654321`).

### Pengaturan Penting Privasi Grup:
Agar bot dapat membaca perintah di dalam grup tanpa harus selalu di-mention:
1. Buka chat `@BotFather`.
2. Kirim `/mybots` > Pilih bot Anda.
3. Pilih **Bot Settings** > **Group Privacy** > Pilih **Turn off**.

---

## Langkah 3: Masukkan Konfigurasi ke Vercel

Buka dashboard Vercel Anda di **Project Settings > Environment Variables** (atau berkas `.env.local` jika menguji secara lokal):

Tambahkan 4 variabel berikut:

| Nama Variabel | Contoh Nilai | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` | Token dari @BotFather (Langkah 1) |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `-1001987654321,987654321` | ID grup / akun yang diizinkan (pisahkan koma) |
| `TELEGRAM_WEBHOOK_SECRET` | `rahasia_webhook_keluarga_99` | Kata sandi acak pengaman webhook |
| `CRON_SECRET` | `kunci_cron_keluarga_123` | Kunci otorisasi Vercel Cron |

> 💡 *Setelah menyimpan variabel di Vercel, lakukan **Redeploy** pada deployment terbaru agar variabel diterapkan.*

---

## Langkah 4: Daftarkan Webhook Telegram ke Domain Vercel

Jalankan perintah cURL berikut **satu kali** melalui Command Prompt, PowerShell, Terminal, atau aplikasi Postman:

```bash
curl -F "url=https://DOMAIN-VERCEL-ANDA.vercel.app/api/telegram/webhook" \
     -F "secret_token=rahasia_webhook_keluarga_99" \
     https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook
```

*Ganti:*
- `DOMAIN-VERCEL-ANDA.vercel.app` dengan domain Vercel Anda.
- `rahasia_webhook_keluarga_99` dengan nilai `TELEGRAM_WEBHOOK_SECRET` Anda.
- `<TOKEN_BOT_ANDA>` dengan token dari `@BotFather`.

Jika berhasil, Anda akan menerima respons:
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

Untuk mengecek status webhook kapan saja:
```bash
curl https://api.telegram.org/bot<TOKEN_BOT_ANDA>/getWebhookInfo
```

---

## Langkah 5: Uji Coba Perintah di Telegram

Buka grup Telegram keluarga Anda dan coba kirim perintah-perintah berikut:

1. **`/status`** atau **`/cek`**
   - Menampilkan total saldo seluruh rekening, total pengeluaran bulan ini, dan daya belanja harian aman (*safe-to-spend*) hingga gajian.
2. **`/anggaran`** atau **`/budget`**
   - Menampilkan visual progress bar kuota belanja 8 kategori utama (Dapur, Makan & Jajan, Transportasi, Tagihan, dll).
3. **`/rekap`**
   - Menampilkan perbandingan belanja 7 hari terakhir vs minggu lalu dan pos pengeluaran terbesar.
4. **`/inbox`**
   - Menampilkan jumlah transaksi mutasi bank yang masih berstatus `pending` atau butuh verifikasi.
5. **`/help`** atau **`/panduan`**
   - Menampilkan ringkasan seluruh perintah dan jadwal pengingat.

---

## Pengingat Otomatis yang Berjalan Mandiri (Pukul 08:00 WIB)

Tanpa perlu mengetik apa pun, bot akan mengirimkan pesan otomatis ke grup Anda:

| Jadwal | Jenis Pengingat | Isi Pesan |
|---|---|---|
| **Setiap Senin Pagi** | Rekap Mingguan (*Weekly Digest*) | Evaluasi total belanja 7 hari lalu dan kategori terboros. |
| **Tanggal 18 Setiap Bulan** | Tagihan Rutin H-2 | Pengingat membayar PLN, Wi-Fi rumah, BPJS, PDAM sebelum tgl 20. |
| **Tanggal Gajian (Default tgl 25)** | *Pay Yourself First* | Pengingat menyisihkan pos tabungan dan dana darurat terlebih dahulu. |
| **H+15 dari Gajian** | Cek Ritme Tengah Bulan | Evaluasi apakah pengeluaran telah melebihi 60% pagu anggaran. |
| **Real-time (Kapan Saja)** | Darurat Overbudget 100% | Peringatan instan saat transaksi baru membuat pos anggaran mencapai 100%. |

---

## Tanya Jawab / Kendala Sering Terjadi

1. **Bot tidak merespons di grup?**
   - Pastikan Anda sudah mematikan *Group Privacy* di `@BotFather` (**Bot Settings > Group Privacy > Turn off**).
   - Pastikan Chat ID grup (angka negatif berawalan `-100`) sudah dimasukkan ke `TELEGRAM_ALLOWED_CHAT_IDS`.
2. **Muncul pesan "⛔ Akses Ditolak"?**
   - ID pengirim belum terdaftar di `TELEGRAM_ALLOWED_CHAT_IDS`. Tambahkan ID tersebut di environment Vercel lalu redeploy.
3. **Webhook tidak merespons setelah deploy?**
   - Cek `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` untuk melihat apakah ada pesan kesalahan URL dari Telegram.

