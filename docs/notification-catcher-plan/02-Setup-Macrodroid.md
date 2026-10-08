# Panduan Setup MacroDroid (Notification Catcher)

Ikuti langkah-langkah di bawah ini di HP Android (Suami/Istri) untuk mengatur MacroDroid.

## Prasyarat Sistem Android (SANGAT PENTING)
Agar MacroDroid tidak "dibunuh" oleh sistem saat HP terkunci:
1. **Baterai**: Atur aplikasi MacroDroid ke pengaturan **Tidak Dibatasi (Unrestricted)** di setelan baterai.
2. **Autostart**: Izinkan MacroDroid berjalan otomatis saat HP dinyalakan.
3. **Notifikasi Bank**: Pastikan fitur notifikasi transaksi per kategori (push notification) di aplikasi bank dalam keadaan aktif.

---

## Langkah Pembuatan Macro

### 1. Buat Macro Baru
- Buka MacroDroid, pilih **Add Macro**.
- Beri nama macro, misal: `Kirim Notif Keuangan`.

### 2. Tambahkan Trigger (Pemicu)
- Tekan tombol **+** di bagian Triggers.
- Pilih **Device Events** -> **Notification** -> **Notification Received**.
- Pilih **Select Application(s)** dan centang aplikasi keuangan Anda.
- Pada bagian *Text Content*, pilih **Excludes** lalu masukkan kata kunci pengecualian minimal (seperti `OTP`, `kode verifikasi`, `jangan berikan`). Tujuannya adalah membiarkan semua format notifikasi (bahkan yang Anda tidak yakini bentuknya) masuk ke Fase 0, kecuali yang jelas-jelas OTP. Pembersihan OTP yang lebih solid akan dilakukan ulang oleh server (meskipun sebagian sudah dihadang di HP).

### 3. Tambahkan Action 1: Kirim ke Webhook
- Tekan tombol **+** di bagian Actions.
- Cari di kategori **Connectivity** -> **HTTP Request**.
- Konfigurasi HTTP Request:
  - **Request Method**: `POST`
  - **URL**: 
    - *(Local)*: `http://[IP_LOKAL]:54322/api/notification` (Server mock otomatis bind ke `0.0.0.0:54322` dan menampilkan alamat IP lokal Anda di terminal saat dijalankan via `npm run serve:mock`).
    - *(Produksi)*: `https://[PROJECT_ID].supabase.co/functions/v1/notification-catcher`
- Tab **Headers**:
  - `X-API-KEY` : `mock_dev_key_suami` (Untuk HP suami) atau `mock_dev_key_istri` (Untuk HP istri).
  - `Content-Type` : `application/x-www-form-urlencoded`
- Tab **Body / Content**:
  - Pilih **Standard parameters**. Tambahkan satu per satu parameter berikut agar MacroDroid otomatis melakukan *URL Encoding*:
    - `app_name` = `[not_app_name]`
    - `title` = `[not_title]`
    - `text` = `[not_text]`
    - `received_at` = `[system_time_ms]` *(Gunakan tombol titik tiga [...] "Magic Text" untuk mencari variabel Epoch Milliseconds)*
- **PENTING**: Di dalam aksi HTTP Request ini, cari centang opsi untuk menyimpan kode respons ke dalam variabel lokal MacroDroid (misal ke variabel `http_response_code`). Variabel ini diperlukan untuk fallback *offline*.

### 4. Tambahkan Action 2: Backup Lokal (Offline Fallback bersyarat)
- Tambahkan **If clause (Condition)** di MacroDroid. Set syaratnya mengecek apakah variabel `http_response_code` BUKAN bernilai `200` atau `201`. Letakkan aksi di dalam blok If ini.
- Cari di kategori **Files** -> **Write to File**.
- Pilih direktori di HP Anda (Penting: Sejak Android 11+, folder `Android/data/` sulit diakses. Folder seperti `/Documents/Keuangan/` bisa digunakan namun berisiko terbaca aplikasi lain, jadi berhati-hatilah karena CSV berisi teks biasa).
- Nama file: `backup_notif.csv`.
- Teks yang ditulis (Centang *Append to file*). Susun variabel menggunakan *quote* standar CSV:
  ```text
  "[system_time_ms]","[not_app_name]","[not_title]","[not_text]"
  ```
  *(Catatan: Karakter "baris baru" di dalam `not_text` bisa saja mematahkan baris CSV. CSV ini murni pertahanan terakhir jika koneksi mati).*

### 5. Simpan Macro
- Tekan ikon **Ceklis** di kanan bawah untuk menyimpan Macro.
- **Uji Coba**: Silakan jalankan fitur *"Test Action"* pada MacroDroid untuk melihat apakah `server_received_at` di database dan `received_at` dari parameter sinkron dengan baik.
