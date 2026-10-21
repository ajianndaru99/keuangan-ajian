# Modul Aplikasi Android Native (Dashboard Keuangan Keluarga)

Modul Android native ini bertugas menyadap notifikasi transaksi perbankan dan e-wallet secara instan, menyajikan antarmuka WebView dengan integrasi sensor biometrik sidik jari, serta menjamin ketahanan transmisi data finansial keluarga.

---

## Fitur Arsitektur & Keamanan Finansial

* **`KeuanganNotificationListener`**: Layanan penyadap notifikasi Android (`android.service.notification.NotificationListenerService`) yang menyaring notifikasi dari BCA, Mandiri, BRI, SeaBank, Bank Jago, BSI, GoPay, ShopeePay, DANA, dan OVO.
* **Buffer Antrean Offline (Zero Data-Loss)**: Notifikasi yang tertangkap saat ponsel tidak memiliki sinyal internet (misal di basement gedung) secara otomatis disimpan dalam antrean lokal FIFO terproteksi dan dikirim ulang otomatis saat koneksi pulih.
* **Standar Keamanan OWASP Mobile MASVS**:
  * `android:allowBackup="false"` mencegah pencurian SharedPreferences dan kunci API via USB debugging.
  * `android:usesCleartextTraffic="false"` mewajibkan seluruh transmisi data menggunakan TLS 1.3/HTTPS.
  * `FLAG_SECURE` diaktifkan pada `MainActivity` untuk mencegah tangkapan layar atau rekaman latar belakang oleh aplikasi tidak dikenal.
* **Optimasi Infinix Note 30 Pro (Transsion XOS)**:
  * Integrasi intent pemintas langsung ke **Phone Master -> Auto-start Management**.
  * Mekanisme watchdog `requestRebind(ComponentName)` pada `onResume` untuk mengaktifkan kembali listener jika sempat dibekukan sistem operasi.
* **`OnboardingActivity`**: Layanan pemandu izin terpandu saat aplikasi pertama kali dijalankan (pemilihan profil Suami/Istri, konfigurasi API key kustom, uji koneksi database langsung, dan izin sistem).
* **`MainActivity`**: Antarmuka WebView terpadu yang mengekspos `AndroidBridge` untuk memicu dialog sidik jari bawaan (`BiometricPrompt`).

---

## Panduan Khusus Pengguna Infinix Note 30 Pro (XOS)

Agar Android tidak membekukan penangkap notifikasi saat layar ponsel mati:
1. Buka aplikasi **Phone Master** bawaan Infinix &rarr; ketuk **Manajemen Mulai Otomatis (Auto-start)** &rarr; aktifkan izin untuk **Keuangan Keluarga**.
2. Di layar **Recent Apps**, tarik kartu aplikasi Keuangan Keluarga ke bawah atau ketuk ikon **Gembok (Lock)** agar aplikasi tidak tertutup saat tombol "Hapus Semua" ditekan.
3. Di layar Onboarding aplikasi, izinkan opsi **Baterai Tanpa Batas (Unrestricted)**.

---

## Cara Kompilasi (Build APK)

### 1. Kompilasi Lokal Menggunakan Gradle Wrapper
Jika Anda memiliki Android SDK yang terpasang di komputer:
```bash
cd android
./gradlew assembleRelease
```
Berkas installer APK yang telah tertandatangani akan dihasilkan di:
`android/app/build/outputs/apk/release/app-release.apk`

### 2. Kompilasi Otomatis via GitHub Actions (Direct Release)
Setiap kali ada commit atau push ke branch `main`, alur kerja `.github/workflows/build-apk.yml` akan mengompilasi APK dan merilisnya langsung ke **GitHub Releases**:
* **Versi Rilis (Direkomendasikan)**: [KeuanganKeluarga-Release.apk](https://github.com/ajianndaru99/keuangan-ajian/releases/latest/download/KeuanganKeluarga-Release.apk)
* **Versi Debug (Alternatif)**: [KeuanganKeluarga-Debug.apk](https://github.com/ajianndaru99/keuangan-ajian/releases/latest/download/KeuanganKeluarga-Debug.apk)
