# Rencana Sistem Notification Catcher (MacroDroid)

Dokumen ini berisi rencana lengkap (Full Plan) untuk menambahkan sistem penangkap notifikasi (Notification Catcher) menggunakan MacroDroid. Sistem ini akan melengkapi sistem Vision AI (Screenshot) yang tetap dipertahankan sebagai cadangan untuk transaksi tunai atau aplikasi yang tidak memunculkan notifikasi.

## 1. Arsitektur Sistem

1. **Sumber Data (MacroDroid di HP Android)**
   - Mendengarkan notifikasi (Notification Listener) dengan filter kata kunci minimal agar format baru bisa ditangkap.
   - Menarik atribut: `app_name`, `title`, `text`, dan waktu notifikasi mentah dari HP (`received_at_raw`).
   - Mengirim HTTP POST request dengan format `application/x-www-form-urlencoded`.
   - Aksi fallback lokal: menulis data ke file CSV di direktori privat HP jika HTTP merespons selain `200`/`201`.

2. **Webhook Endpoint (Penerima Data)**
   - **Local**: `scripts/serve-webhook-mock.ts` menggunakan port `54322`.
   - **Production (Supabase)**: Edge function `notification-catcher`. Endpoint mematikan validasi JWT bawaan Supabase dan menggunakan autentikasi *X-API-KEY*.
   - **Keamanan Kunci**: Menggunakan satu kunci API per perangkat (HP Suami beda dengan HP Istri). Server menentukan identitas perangkat dari kunci, bukan dari payload. Pengecekan kunci kebal dari manipulasi *prototype pollution* menggunakan `Object.hasOwn`. Kunci *dev* ditolak mentah-mentah di lingkungan produksi dan panjang kunci minimal diwajibkan 32 karakter.

3. **Logika Pemrosesan (Parser Teks Regex per Bank)**
   - Modul parser berada di `supabase/functions/_shared/parsers/` (terdiri dari rules, fields, amount, engine, dan profil bank).
   - Selama Fase 0, parser akan dijalankan *on-the-fly* untuk mengevaluasi data, tetapi hasil akhirnya (`outcome`, `reasons`, `parser_version`) hanya disimpan di tabel sampel.
   - Menyaring data sensitif (seperti OTP) sesegera mungkin di server setelah normalisasi teks (NFKC dan pembersihan zero-width), sebelum data dicetak ke konsol log atau disimpan ke database. Pola sensitif dipersempit agar tidak membuang notifikasi transaksi yang sah.

4. **Penyimpanan (Supabase)**
   - Semua notifikasi mentah masuk ke tabel `raw_notifications`. Tabel ini dilindungi RLS ketat, mencatat `received_at_raw` dan `server_received_at` (untuk deteksi jam HP melenceng), memiliki batas panjang `content` 2000 karakter code point Unicode, serta kolom `validated_at` untuk retensi data (pembersihan otomatis via `public.cleanup_old_raw_notifications(retention_days)`).
   - Disediakan view agregasi harian `v_daily_redacted_notification_stats` untuk memantau rasio notifikasi yang di-redact per hari tanpa menyimpan teks sensitif.
   - Tersedia kolom `source` untuk mencatat darimana data berasal (notification, screenshot, csv).
   - **Kunci Idempotensi & Deduplikasi Mentah**: Menggunakan `content_hash` MD5 dan batasan UNIK `(device_id, app_name, received_at_raw, content_hash)` untuk mencegah notifikasi persis berganda tersimpan ulang saat pengiriman ulang MacroDroid atau impor CSV.
   - **Deduplikasi (Level Transaksi)**: Dilakukan di Fase 2 dengan jendela waktu 2-3 menit menggunakan pencocokan device, app_name, dan nomor referensi jika ada.
   - **Transfer Internal**: Berdasarkan rentang waktu berdekatan pada perangkat berbeda, sistem akan *mengusulkan* ini sebagai transfer internal (berdasarkan daftar rekening milik sendiri).

---

## 2. Pembagian Fase Pengerjaan

### Fase 0: Pengumpulan Data Mentah (Fase Saat Ini)
- **Aksi**: Setup MacroDroid dan Webhook sederhana yang bertugas mem-bypass data notifikasi (kecuali OTP) ke tabel `raw_notifications` secara persisten.
- **Waktu & Kriteria Selesai**: Kumpulkan sampel asli dari aktivitas nyata sampai tercapai **cakupan (coverage) yang memadai** untuk setiap bank (contoh target: ada contoh transfer masuk, transfer keluar, QRIS, top up, biaya admin, gagal, dan refund).
- **Validasi Akhir Fase**: Bandingkan notifikasi yang masuk dengan mutasi bulanan bank asli untuk mengukur berapa persen transaksi yang berhasil ditangkap.

### Fase 1: Pembaruan Parser & Unit Test
- Penambahan fungsi parser yang sesuai dengan format data mentah hasil panen Fase 0.
- Unit Test diperbarui dan divalidasi penuh.

### Fase 2: Integrasi Database Transaksi Akhir
- Menyimpan hasil parsing teks ke tabel utama `transactions`.
- Menghidupkan *Dedupe* di level transaksi menggunakan rentang waktu 2-3 menit.
