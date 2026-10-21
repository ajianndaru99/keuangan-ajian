# Panduan Pemasangan & Konfigurasi Aplikasi Android

Dokumen ini menjelaskan alur pemasangan, konfigurasi izin sistem operasi, serta mekanisme pengiriman notifikasi pada aplikasi Android Dashboard Keuangan Keluarga.

---

## 1. Spesifikasi Perangkat Target

Aplikasi dirancang dan diuji secara spesifik untuk dua perangkat utama keluarga:

1. **Infinix Note 30 Pro (Ponsel Suami)**
   * Antarmuka: XOS berbasis Android
   * Sensor Keamanan: Pemindai sidik jari di layar (*optical in-display fingerprint*)
   * Tantangan OS: Manajemen memori agresif yang kerap mematikan servis latar belakang secara sepihak
2. **Samsung Galaxy A52 (Ponsel Istri)**
   * Antarmuka: One UI berbasis Android
   * Sensor Keamanan: Pemindai sidik jari di layar (*optical in-display fingerprint*)
   * Tantangan OS: Fitur *Device Care* yang otomatis menidurkan aplikasi yang jarang dibuka ke status *Deep Sleeping Apps*

---

## 2. Cara Memperoleh Paket APK

Paket APK dapat diunduh melalui dua jalur:

1. **Melalui Dashboard Web (`/supports`):**
   * Masuk ke menu **Aplikasi Android & APK** di navigasi samping.
   * Pilih tombol **Unduh APK Universal** atau pindai kode QR yang ditampilkan di layar menggunakan kamera ponsel Anda.
2. **Melalui GitHub Actions (Rilis Otomatis):**
   * Setiap kali ada perubahan kode di branch `main`, GitHub Actions akan mengompilasi APK melalui workflow `.github/workflows/build-apk.yml`.
   * Berkas `app-release.apk` dapat diunduh langsung dari tab *Actions* di repositori GitHub Anda.

---

## 3. Langkah Instalasi & Layar Onboarding

Setelah berkas APK dibuka di ponsel:
1. Jika muncul peringatan keamanan peramban *"Izinkan pemasangan aplikasi dari sumber ini"*, ketuk **Setelan** lalu aktifkan sakelar izin tersebut.
2. Lanjutkan proses pemasangan hingga selesai, kemudian buka aplikasi.
3. Aplikasi akan langsung menampilkan layar **Pengaturan Awal (Onboarding)** yang memandu Anda mengaktifkan dua izin utama secara berurutan:
   * **Izin Akses Notifikasi:** Ketuk tombol *Aktifkan Izin Notifikasi*. Sistem akan membuka menu pengaturan akses notifikasi Android; cari nama aplikasi ini dan geser sakelar ke posisi aktif.
   * **Pengecualian Penghemat Baterai:** Ketuk tombol *Atur Pengecualian Baterai*. Sistem akan membuka jendela perizinan agar aplikasi diizinkan berjalan tanpa batasan daya.

---

## 4. Penyetelan Khusus Sistem Operasi

Untuk memastikan penyadapan notifikasi m-banking tetap berjalan tanpa terputus ketika ponsel terkunci, lakukan penyetelan berikut:

### Pada Samsung Galaxy A52 (One UI)
1. Buka **Pengaturan** -> **Perawatan Perangkat (Device Care)** -> **Baterai**.
2. Pilih **Batas penggunaan latar belakang (Background usage limits)**.
3. Masuk ke menu **Aplikasi yang tidak pernah tidur (Never sleeping apps)**.
4. Ketuk ikon tambah (**+**) di pojok kanan atas, pilih aplikasi **Keuangan Keluarga**, lalu ketuk **Tambah**.

### Pada Infinix Note 30 Pro (XOS)
1. Buka aplikasi **Pengelola Ponsel (Phone Master)** atau masuk ke **Pengaturan** -> **Aplikasi**.
2. Pilih **Manajemen Mulai Otomatis (Auto-start management)**.
3. Aktifkan sakelar untuk aplikasi **Keuangan Keluarga** agar servis otomatis aktif kembali setelah ponsel dimatikan atau dinyalakan ulang.
4. Buka daftar aplikasi berjalan (*Recent Apps*), usap sedikit ke bawah pada jendela aplikasi Keuangan Keluarga hingga muncul ikon **Gembok** untuk mengunci aplikasi di memori RAM.

---

## 5. Pengujian dan Verifikasi Koneksi

1. Di dalam aplikasi Android, ketuk tombol verifikasi atau kirim notifikasi uji coba.
2. Buka dashboard web di komputer atau ponsel Anda, lalu periksa menu **Aplikasi Android & APK** (`/supports`).
3. Kartu status perangkat (Infinix Suami atau Samsung Istri) akan menampilkan status hijau bertuliskan **Terhubung**.
4. Lakukan satu transaksi riil (misalnya transfer nominal kecil atau top-up e-wallet). Dalam 1 hingga 2 detik, notifikasi transaksi akan muncul di halaman **Inbox Transaksi** (`/inbox`).
