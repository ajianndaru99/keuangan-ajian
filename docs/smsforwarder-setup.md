# Panduan Konfigurasi SmsForwarder Android (Arsip / Opsi Cadangan)

> **Catatan:** Repositori ini sekarang sudah menyediakan **Aplikasi Android Native All-in-One** di folder `android/` yang siap dipasang langsung (lihat [Panduan Aplikasi Android](file:///c:/Users/FAPERTA%201/Documents/FAPERTA/File%20Ajian/dashboard-keuangan-keluarga/docs/android-app-setup.md)). Panduan SmsForwarder di bawah ini dipertahankan sebagai dokumen arsip atau alternatif pihak ketiga jika Anda tidak ingin mengompilasi APK mandiri.

Panduan ini memandu langkah demi langkah pemasangan dan konfigurasi aplikasi **SmsForwarder** (Open Source, 100% gratis selamanya, tanpa iklan, dan tanpa batas masa percobaan) di ponsel Android Suami dan Istri.

Setelah dipasang, setiap kali ada notifikasi transaksi masuk dari m-banking atau e-wallet (BCA, Livin Mandiri, Bank Jago, BRImo, GoPay, OVO, ShopeePay), notifikasi akan otomatis dikirim ke sistem secara hening di latar belakang dalam hitungan 1–2 detik.

---

## 1. Prasyarat

1. Ponsel Android (Suami & Istri).
2. Endpoint sistem Anda:
   * **Pengujian Lokal (Wi-Fi yang sama):**  
     `http://<IP_KOMPUTER_LOKAL>:54322/api/notification`  
     *(IP komputer otomatis muncul saat Anda menjalankan `npm run serve:mock` di terminal)*.
   * **Lingkungan Produksi (Supabase Edge Function):**  
     `https://<PROJECT_ID>.supabase.co/functions/v1/notification-catcher`
3. Kunci API (`X-API-KEY`):
   * **HP Suami:** `mock_dev_key_suami` (pengujian) atau kunci produksi suami.
   * **HP Istri:** `mock_dev_key_istri` (pengujian) atau kunci produksi istri.

---

## 2. Pembersihan MacroDroid (Copot Pemasangan)

Sebelum menyetel SmsForwarder, pastikan MacroDroid dinonaktifkan agar tidak terjadi pengiriman ganda:

1. Buka aplikasi **MacroDroid**.
2. Matikan sakelar utama makro (*OFF*).
3. Masuk ke **Pengaturan HP -> Aplikasi -> Akses Khusus -> Akses Notifikasi**, matikan izin untuk MacroDroid.
4. Lakukan **Uninstall (Copot Pemasangan)** pada MacroDroid untuk menghemat RAM dan baterai HP.

---

## 3. Unduh & Pasang SmsForwarder

1. Buka browser di HP Anda dan kunjungi halaman rilis resmi GitHub:  
   **[https://github.com/pppscn/SmsForwarder/releases](https://github.com/pppscn/SmsForwarder/releases)**  
   *(Atau tautan rilis langsung versi terbaru: **[https://github.com/pppscn/SmsForwarder/releases/latest](https://github.com/pppscn/SmsForwarder/releases/latest)**)*
2. Cari rilis versi stabil terbaru (*Latest Release*).
3. Unduh berkas APK bernama:  
   `app-universal-release.apk` (atau `app-arm64-v8a-release.apk`).
4. Pasang (install) file APK ke ponsel. Jika muncul dialog *"Instal dari sumber tidak dikenal"*, izinkan untuk browser Anda.

---

## 4. Izin Sistem Android (Sangat Penting agar Tidak Dimatikan OS)

Agar layanan penyadap tetap aktif 24/7 di latar belakang tanpa dibunuh oleh penghemat baterai Android:

1. **Izin Akses Notifikasi:**  
   Buka SmsForwarder, saat diminta izin akses notifikasi, ketuk *Setuju* dan aktifkan sakelar **SmsForwarder**.
2. **Penggunaan Baterai:**  
   Buka *Info Aplikasi SmsForwarder -> Baterai*, ubah pilihannya ke **Tidak Dibatasi (Unrestricted)**.
3. **Mulai Otomatis (Autostart):**  
   * **Xiaomi (MIUI / HyperOS):** Info Aplikasi -> aktifkan *Mulai otomatis (Autostart)*.
   * **Samsung (One UI):** Pengaturan -> Perawatan Perangkat -> Baterai -> Batas penggunaan latar belakang -> Masukkan SmsForwarder ke daftar *Aplikasi yang tidak pernah tidur (Never sleeping apps)*.
   * **Oppo / Realme / Vivo:** Info Aplikasi -> Kelola Izin -> Izinkan aktivitas latar belakang & mulai otomatis.
4. **Kunci di Recent Apps:**  
   Buka layar aplikasi terakhir (*recent apps*), tekan tahan SmsForwarder, lalu ketuk ikon **Gembok**.

---

## 5. Konfigurasi Sender (Pengirim Webhook)

1. Buka aplikasi **SmsForwarder**.
2. Masuk ke tab **Sender** (ikon pesawat kertas atau menu Pengirim) di bagian bawah.
3. Ketuk tanda tambah (**+**) di pojok kanan bawah.
4. Pilih tipe pengirim: **Webhook**.
5. Isi konfigurasi sebagai berikut:
   * **Nama Sender:** `Dashboard Keuangan`
   * **URL Webhook:** Masukkan URL endpoint sistem Anda (lihat bagian Prasyarat).
   * **Request Method:** Pilih `POST`.
   * **Headers:** Tambahkan header baru:
     * *Key:* `X-API-KEY`
     * *Value:* `mock_dev_key_suami` *(sesuaikan dengan kunci HP masing-masing)*
   * **Content Type (Tipe Konten):** Pilih `application/json`.
   * **WebHook Body:** Tempelkan template JSON berikut:
     ```json
     {
       "app_name": "{{PACKAGE_NAME}}",
       "title": "{{TITLE}}",
       "content": "{{CONTENT}}",
       "received_at": {{RECEIVE_TIME}}
     }
     ```
6. **Uji Coba Kirim:** Ketuk tombol **Test** di layar bawah. Jika endpoint Anda aktif, akan muncul notifikasi sukses dengan respons HTTP 201.
7. Ketuk ikon centang atau tombol **Save** untuk menyimpan.

---

## 6. Konfigurasi Forwarding Rule (Aturan Notifikasi)

1. Masuk ke tab **Rule** (Aturan) di bilah navigasi bawah.
2. Ketuk tanda tambah (**+**).
3. Atur parameter aturan:
   * **Tipe Aturan:** Pilih **App Notification** (Notifikasi Aplikasi).
   * **Target Aplikasi:** Pilih **App List (Daftar Aplikasi)**, lalu centang aplikasi perbankan & e-wallet keluarga Anda:
     * *BCA mobile / myBCA* (`com.bca` / `com.bca.mybca.omni.android`)
     * *Livin' by Mandiri* (`id.bmri.livin`)
     * *BRImo (BRI)* (`id.co.bri.brimo`)
     * *BNI Mobile / wondr by BNI* (`src.com.bni` / `id.bni.wondr`)
     * *BSI Mobile / BYOND by BSI* (`com.bsm.activity2` / `id.co.bankbsi.byond`)
     * *Bank Jago* (`com.jago.digitalBanking` / `com.jago.bank` atau cari "Jago")
     * *SeaBank* (`id.co.bankbkemobile.digitalbank` atau cari "SeaBank")
     * *Bank Saqu* (`id.co.bjj.saqu` atau cari "Bank Saqu")
     * *blu by BCA Digital* (`com.bcadigital.blu`)
     * *GoPay / Gojek* (`com.gojek.gopay` / `com.gojek.app`)
     * *OVO* (`ovo.id`)
     * *DANA* (`id.dana`)
     * *ShopeePay / Shopee* (`com.shopeepay.id` / `com.shopee.id`)
     * *LinkAja* (`linkaja.transaction`)
   * **Filter Kata Kunci Pengecualian (Exclude):**  
     Pilih *Contains (Memuat)* -> masukkan:  
     `OTP, kode verifikasi, PIN, jangan berikan`  
     *(Tujuannya agar kode rahasia login bank tidak pernah dikirim ke server).*
   * **Pilih Sender:** Pilih pengirim `Dashboard Keuangan` yang sudah dibuat di Langkah 5.
4. Simpan aturan dengan mengetuk ikon centang/simpan. Pastikan sakelar aturan dalam posisi **Aktif (ON)**.

---

## 7. Pengujian Nyata

1. Lakukan transaksi pembayaran atau transfer kecil (misal transfer antar kantong Jago atau QRIS nominal Rp 1.000).
2. Tunggu notifikasi bank muncul di bilah atas ponsel.
3. Buka dashboard web keuangan Anda di menu **Inbox**.
4. Transaksi akan langsung muncul di daftar transaksi pending dengan nominal, tanggal, dan nama merchant yang diekstrak secara otomatis.

---

## 8. Penanganan Bukti Struk Screenshot (Non-Teks)

Karena SmsForwarder dikhususkan untuk menangkap teks notifikasi, transaksi yang bukti utamanya berupa gambar fisik (seperti struk kasir kertas atau bukti transfer offline):
* Cukup unggah langsung gambarnya melalui tombol **"Upload Bukti Transfer / Struk"** di halaman **Inbox** web dashboard.
* Vision AI Gemini akan mengekstrak nominal, rekening, dan merchant secara otomatis dalam 2–3 detik.
