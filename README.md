# Dashboard Keuangan Keluarga

Aplikasi pencatatan dan pengelolaan keuangan keluarga yang bekerja secara otomatis. Sistem menangkap notifikasi transaksi dari m-banking dan e-wallet secara langsung di ponsel Android, memproses struk belanja fisik melalui analisis Google Gemini Flash Vision AI, serta menyajikan rekap kas dalam antarmuka web yang terproteksi.

---

## Arsitektur & Teknologi

* **Database & Keamanan**: Supabase (PostgreSQL dengan Row Level Security aktif di seluruh tabel, Supabase Auth).
* **Aplikasi Android Native (`android/`)**:
  * Ditulis menggunakan Kotlin dengan target kompatibilitas Infinix XOS dan Samsung One UI.
  * `KeuanganNotificationListenerService`: Layanan latar belakang untuk menyadap notifikasi transaksi bank dan dompet digital tanpa iklan atau perantara pihak ketiga.
  * Antarmuka terpadu via WebView berkecepatan tinggi dengan jembatan data native (`AndroidBridge`).
  * Autentikasi biometrik bawaan ponsel (*in-display optical fingerprint*) melalui AndroidX `BiometricPrompt`.
  * Penanganan izin khusus: pengecualian penghemat baterai (*Never Sleeping Apps* pada Samsung) dan *Auto-start* latar belakang pada Infinix.
* **Backend Ingestion**:
  * Next.js API Routes (`/api/notification`, `/api/screenshot`, `/api/ai/daily-reconcile`).
  * Supabase Edge Functions (`screenshot-transaction`).
  * Validasi keamanan header `X-API-KEY` dan pencegahan duplikasi data via `dedupe_hash`.
* **Frontend Web Dashboard**:
  * Next.js App Router, TypeScript (mode `strict`), dan Tailwind CSS.
  * Grafik dan analitik menggunakan Recharts.
  * Kunci sesi otomatis setelah 60 menit tidak aktif, dilengkapi proteksi PIN 6-angka tanpa memicu dialog USB security key pada peramban Windows desktop.
* **Otomasi CI/CD**:
  * GitHub Actions (`.github/workflows/build-apk.yml`) untuk kompilasi rilis APK siap pakai secara otomatis setiap kali ada pembaruan kode.

---

## Fitur Utama

1. **Penyederhanaan Akun (Dana Suami & Dana Istri)**
   Transaksi otomatis dipetakan ke dua pos utama berdasarkan perangkat pengirim. Pengguna tidak perlu memilah belasan rekening secara manual.
2. **Penangkapan Notifikasi Otomatis**
   Mendukung aplikasi perbankan dan e-wallet populer di Indonesia: BCA, Mandiri (Livin), BRI (BRImo), Bank Jago, SeaBank, BSI, GoPay, ShopeePay, DANA, dan OVO.
3. **Ekstraksi Bukti Transfer & Struk (Multimodal Vision)**
   Mendukung unggah gambar struk kasir atau screenshot bukti bayar QRIS dengan filter validasi transaksi untuk menolak gambar non-transaksi.
4. **Proteksi Akses & Sesi Aman**
   Sesi terkunci otomatis setelah satu jam. Pembukaan kunci di ponsel mendukung sensor sidik jari bawaan, sementara pada layar laptop/PC disediakan tombol angka virtual.
5. **Pusat Unduhan & Pemantauan (`/supports`)**
   Halaman khusus untuk mengunduh paket APK, memindai QR code pemasangan, memantau *handshake* koneksi ponsel, dan melakukan uji simulasi notifikasi.

---

## Struktur Repositori

```
dashboard-keuangan-keluarga/
├── .github/
│   └── workflows/
│       └── build-apk.yml               # Kompilasi otomatis file APK di GitHub Actions
├── android/                            # Modul aplikasi Android native (Kotlin)
│   ├── app/
│   │   ├── src/main/java/com/keluarga/keuangan/
│   │   │   ├── AppConfig.kt            # Konfigurasi endpoint & API key perangkat
│   │   │   ├── KeuanganNotificationListenerService.kt # Penyadapan notifikasi transaksi
│   │   │   ├── MainActivity.kt         # WebView dashboard + sensor sidik jari
│   │   │   └── OnboardingActivity.kt   # Alur izin khusus Samsung & Infinix
│   │   └── src/main/res/               # Tata letak XML dan ikon aplikasi
│   ├── build.gradle.kts
│   └── settings.gradle.kts
├── supabase/
│   ├── migrations/                     # Skema SQL, RLS, fungsi RPC, dan trigger
│   └── functions/
│       └── screenshot-transaction/     # Edge Function pemrosesan struk
├── src/
│   ├── app/
│   │   ├── accounts/                   # Halaman dompet & rekening (Dana Suami & Istri)
│   │   ├── api/                        # Endpoint webhook notifikasi & analisis
│   │   ├── budget/                     # Perencanaan dan alokasi anggaran
│   │   ├── inbox/                      # Verifikasi transaksi masuk secara realtime
│   │   ├── rekap/                      # Rekapitulasi mingguan dan bulanan
│   │   └── supports/                   # Halaman unduhan APK dan panduan perangkat
│   ├── components/
│   │   ├── auth/SessionLockModal.tsx   # Modal kunci sesi 1 jam (PIN & Sidik Jari)
│   │   └── layout/Sidebar.tsx          # Navigasi utama dashboard
│   └── lib/
│       └── auth/biometrics.ts          # Abstraksi sensor biometrik (Android Bridge & Web)
├── tests/                              # Pengujian otomatis integrasi dan keamanan
└── docs/                               # Panduan teknis konfigurasi perangkat
```

---

## Standar Kualitas & Pengujian

Sebelum dinyatakan siap pakai, seluruh kode diverifikasi melalui tiga gerbang pemeriksaan:

1. **Pengujian Fungsional (182 pengujian lulus):**
   ```bash
   npm test
   ```
2. **Pengecekan Tipe TypeScript (Strict Mode):**
   ```bash
   npx tsc --noEmit
   ```
3. **Kompilasi Produksi Frontend:**
   ```bash
   npm run build
   ```

---

## Panduan Pemasangan di Ponsel Android

1. Buka dashboard web keluarga Anda, lalu masuk ke menu **Aplikasi Android & APK** (`/supports`).
2. Unduh berkas APK yang tersedia atau pindai QR code langsung dari layar ponsel Anda.
3. Buka berkas APK yang telah diunduh, lalu izinkan instalasi dari sumber browser Anda.
4. Pada saat pertama kali aplikasi dibuka, Anda akan dipandu melalui layar onboarding:
   * **Akses Notifikasi**: Aktifkan sakelar izin untuk membaca notifikasi bank.
   * **Baterai Tanpa Batas**: Pada Samsung A52, pastikan aplikasi masuk ke daftar *Never Sleeping Apps*; pada Infinix Note 30 Pro, izinkan opsi *Auto-start*.
5. Setelah konfigurasi selesai, verifikasi status koneksi pada kartu indikator di halaman `/supports`.

---

## Lisensi

Proyek privat untuk pengelolaan keuangan keluarga.
