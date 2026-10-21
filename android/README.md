# Modul Aplikasi Android Native (Dashboard Keuangan Keluarga)

Modul Android native ini bertugas menyadap notifikasi transaksi perbankan dan e-wallet secara instan, serta menyajikan antarmuka WebView dengan integrasi sensor biometrik sidik jari ponsel.

---

## Fitur Modul

* **`KeuanganNotificationListenerService`**: Layanan penyadap notifikasi Android (`android.service.notification.NotificationListenerService`) yang menyaring notifikasi dari BCA, Mandiri, BRI, SeaBank, Bank Jago, BSI, GoPay, ShopeePay, DANA, dan OVO, lalu mengirimkan payload JSON ke endpoint sistem.
* **`OnboardingActivity`**: Layanan pemandu izin sistem operasi saat aplikasi pertama kali dijalankan (akses notifikasi dan pengecualian penghemat baterai).
* **`MainActivity`**: Antarmuka WebView terpadu yang mengekspos `AndroidBridge` untuk memicu dialog sidik jari bawaan (`BiometricPrompt`).
* **`AppConfig`**: Pusat konfigurasi URL endpoint webhook dan API key untuk perangkat Suami dan Istri.

---

## Cara Kompilasi (Build APK)

### 1. Kompilasi Lokal Menggunakan Gradle Wrapper
Jika Anda memiliki Android SDK yang terpasang:
```bash
cd android
./gradlew assembleRelease
```
Berkas APK akan dihasilkan di: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

### 2. Kompilasi Otomatis via GitHub Actions
Setiap kali ada commit atau push ke branch `main`, workflow `.github/workflows/build-apk.yml` akan berjalan secara otomatis di server GitHub untuk mengompilasi APK. Anda dapat mengunduh berkas APK langsung dari tab **Actions** di repositori GitHub.
