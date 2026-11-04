# Panduan Lengkap: Menghubungkan & Menggunakan Bot Telegram Keuangan Keluarga

Dokumen ini memandu Anda langkah demi langkah dari awal untuk membuat Bot Telegram, mengonfigurasi variabel lingkungan di Vercel, mendaftarkan webhook, hingga menggunakan perintah interaktif dan pengingat otomatis di grup keluarga.

---

## 1. Langkah Cepat: Pembuatan Bot di Telegram

1. Buka aplikasi Telegram di HP atau desktop Anda.
2. Di kolom pencarian, cari akun resmi **`@BotFather`** (dengan centang biru verified).
3. Ketuk tombol **Start** atau kirim pesan:
   ```text
   /newbot
   ```
4. BotFather akan meminta nama tampilan bot (contoh: `Keuangan Keluarga Ajian`).
5. Selanjutnya, masukkan username bot berakhiran `bot` (contoh: `keuangan_keluarga_bot` atau `ajian_finance_bot`).
6. Setelah berhasil, BotFather akan memberikan **HTTP API Token**, misalnya:
   ```text
   123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
   > ⚠️ **Penting**: Simpan token ini baik-baik dan jangan dibagikan ke pihak luar.

---

## 2. Mendapatkan Chat ID (Pribadi atau Grup Keluarga)

Bot hanya akan melayani Chat ID yang terdaftar dalam whitelist (*fail-closed* demi keamanan finansial).

### Opsi A: Grup Telegram Keluarga (Disarankan)
1. Buat grup Telegram baru, misalnya **"Keluarga Ajian"**, lalu masukkan Suami dan Istri ke dalamnya.
2. Tambahkan Bot yang baru dibuat ke dalam grup tersebut.
3. Berikan izin standar dan kirim satu pesan uji coba apa saja di grup (misal: `"halo bot"`).
4. Buka browser dan buka URL berikut (ganti `<TOKEN_BOT>` dengan token dari BotFather):
   ```text
   https://api.telegram.org/bot<TOKEN_BOT>/getUpdates
   ```
5. Cari bagian `"chat":{"id": -100xxxxxxxxxx, ...}`.
   - Untuk grup, ID selalu berupa angka negatif dan biasanya diawali `-100` (contoh: `-1001987654321`).

### Opsi B: Chat Pribadi dengan Bot
1. Buka chat langsung ke bot Anda, ketuk **Start** atau kirim pesan `"tes"`.
2. Buka URL `https://api.telegram.org/bot<TOKEN_BOT>/getUpdates`.
3. Cari bagian `"chat":{"id": 987654321, ...}` (berupa angka positif).

---

## 3. Konfigurasi Environment Variables

Buka **Dashboard Vercel > Proyek Anda > Settings > Environment Variables** (atau berkas `.env.local` di lingkungan lokal):

| Variabel | Nilai Contoh | Penjelasan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ` | Token otentikasi dari `@BotFather` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | `-1001987654321,987654321` | ID chat yang berhak mengakses (pisahkan koma jika lebih dari satu) |
| `TELEGRAM_WEBHOOK_SECRET` | `rahasia_webhook_keluarga_99` | String acak pengaman header webhook |
| `CRON_SECRET` | `kunci_cron_keluarga_123` | Kunci otorisasi Vercel Cron |

Setelah variabel lingkungan disimpan di Vercel, lakukan *Redeploy* agar variabel aktif.

---

## 4. Daftarkan Webhook Telegram ke Domain Vercel

Jalankan perintah cURL berikut sekali saja melalui terminal komputer, PowerShell, atau aplikasi Postman:

```bash
curl -F "url=https://DOMAIN-VERCEL-ANDA.vercel.app/api/telegram/webhook" \
     -F "secret_token=rahasia_webhook_keluarga_99" \
     https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook
```

Jika berhasil, Telegram akan mengembalikan respons:
```json
{"ok": true, "result": true, "description": "Webhook was set"}
```

*Untuk memeriksa status webhook kapan saja:*
```bash
curl https://api.telegram.org/bot<TOKEN_BOT_ANDA>/getWebhookInfo
```

---

## 5. Daftar Perintah Interaktif di Telegram

Ketik perintah ini langsung di dalam grup keluarga atau chat pribadi bot:

| Perintah | Fungsi & Informasi yang Ditampilkan |
|---|---|
| `/status` atau `/cek` | **Detak Finansial**: Total saldo seluruh kas/rekening, total pengeluaran bulan ini, persentase pagu, dan daya belanja harian aman (*safe-to-spend*) hingga gajian. |
| `/anggaran` atau `/budget` | **Kuota 8 Kategori**: Visual progress bar (`[██████░░░░] 60%`) untuk Belanja Dapur, Makan & Jajan, Transportasi, Tagihan, Kebutuhan Rumah, Jalan-jalan, Darurat, dan Lainnya. |
| `/rekap` | **Analisis Mingguan**: Total belanja sepekan, persentase naik/turun vs minggu lalu, serta pos kategori terbesar. |
| `/inbox` | **Audit Transaksi**: Jumlah mutasi bank berstatus `pending` atau notifikasi mentah yang butuh konfirmasi. |
| `/help` atau `/panduan` | Menampilkan panduan bantuan dan daftar perintah. |

> 💡 **Tips Penggunaan di Grup**: Anda juga dapat memanggil perintah dengan mention bot, misalnya `/status@nama_bot_anda`.

---

## 6. Jadwal Pengingat Otomatis (*Proactive Scheduled Nudges*)

Bot akan mengirim pesan pengingat ke grup setiap hari pukul **08:00 WIB** secara cerdas:

1. **Setiap Hari Senin**: Rekap Keuangan Mingguan (*Weekly Digest*) 7 hari terakhir.
2. **Tanggal 18 Setiap Bulan**: Pengingat Tagihan Rutin H-2 (PLN, Wi-Fi rumah, BPJS, PDAM) agar tidak terlambat bayar.
3. **Tanggal Gajian (Disetel di Dasbor, Default Tgl 25)**: Pengingat *Pay Yourself First* untuk mengamankan tabungan dana darurat sebelum belanja dibuka.
4. **H+15 dari Gajian**: Evaluasi Ritme Belanja Tengah Bulan (*Mid-Month Burn Rate Check*).
5. **Real-time**: Notifikasi darurat instan jika ada pengeluaran yang membuat anggaran pos belanja menyentuh **100%**.

---

## 7. Solusi Kendala & Tanya Jawab (*Troubleshooting*)

* **Bot tidak merespons pesan**:
  1. Pastikan Chat ID grup atau akun Anda sudah terdaftar di `TELEGRAM_ALLOWED_CHAT_IDS`.
  2. Periksa apakah webhook aktif melalui `getWebhookInfo`.
  3. Di grup Telegram, jika bot tidak bisa membaca pesan, buka `@BotFather` > `/mybots` > pilih bot Anda > **Bot Settings** > **Group Privacy** > pilih **Turn off** agar bot dapat mendengarkan perintah di dalam grup.
* **Pesan "Akses Ditolak"**:
  Artinya Chat ID pengirim belum dimasukkan ke `TELEGRAM_ALLOWED_CHAT_IDS`. Tambahkan ID tersebut ke environment variable lalu redeploy.
