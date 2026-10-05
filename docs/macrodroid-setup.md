# Panduan Konfigurasi Automasi MacroDroid (Android)

Dokumen ini memandu langkah demi langkah konfigurasi MacroDroid pada ponsel Android suami dan istri untuk menangkap notifikasi transaksi perbankan dan e-wallet secara otomatis, lalu mengirimkannya ke Webhook Supabase.

---

## 1. Prasyarat Perangkat Android

1. Pasang aplikasi **MacroDroid** dari Google Play Store.
2. Berikan izin sistem:
   - **Akses Notifikasi (Notification Access)**: Buka *Settings HP -> Privacy/Notification Access -> Beri centang/izinkan MacroDroid*.
   - **Abaikan Optimasi Baterai (Ignore Battery Optimization)**: Buka *Settings HP -> Battery Optimization -> Pilih MacroDroid -> Don't Optimize / Unrestricted*. Hal ini wajib agar MacroDroid tidak dimatikan Android saat berjalan di latar belakang.

---

## 2. Membuat Macro Baru

Buka MacroDroid, pilih **Add Macro** (+), lalu atur tiga komponen berikut:

### A. Trigger (Pemicu)
1. Tekan tombol **(+)** pada bagian **Triggers**.
2. Pilih kategori **Device Events** -> **Notification**.
3. Pilih opsi **Notification Received**.
4. Pilih **Select Applications**:
   - Beri centang pada aplikasi keuangan yang aktif di ponsel:
     - Bank Jago
     - BCA (m-BCA / myBCA)
     - Mandiri (Livin' by Mandiri)
     - BRI (BRImo)
     - GoPay / Gojek
     - Shopee / ShopeePay
     - DANA
     - OVO
5. Pada pilihan *Text Content*, biarkan opsi **Any** (Menangkap semua notifikasi dari aplikasi terpilih).

---

### B. Action (Tindakan Kirim Webhook)
1. Tekan tombol **(+)** pada bagian **Actions**.
2. Pilih kategori **Connectivity** -> **HTTP Request**.
3. Atur parameter request sebagai berikut:

| Parameter | Nilai Konfigurasi |
|---|---|
| **Request Method** | `POST` |
| **URL** | `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/webhook-transaction` |
| **Content Type** | `application/json` |

4. Tambahkan **Request Headers**:
   - Header 1: `Content-Type` bernilai `application/json`
   - Header 2: `X-API-KEY` bernilai `<KUNCI_RAHASIA_DARI_ENV>` (sesuai nilai `WEBHOOK_API_KEY` di Supabase)

5. Isi **Request Body (Text)**:
   *Gunakan tombol ikon tiga titik `...` di samping input teks MacroDroid untuk menyisipkan variabel notifikasi bawaan:*

```json
{
  "source_device": "suami",
  "app_name": "[notif_app_name]",
  "raw_text": "[notif_title] - [notif_text]",
  "timestamp": "[year]-[month_digit]-[day_digit]T[hour_format_24]:[minute]:[second]+07:00"
}
```

> **Catatan Penting**:
> 1. Pada ponsel istri, ganti `"source_device": "suami"` menjadi `"source_device": "istri"`.
> 2. Field `raw_text` menggabungkan judul notifikasi dan isi teks agar regex parser dapat membaca nama merchant, jenis transfer, dan nominal secara lengkap.
> 3. Field `timestamp` memastikan waktu transaksi akurat sesuai saat notifikasi muncul di HP dan menjaga ketepatan deduplikasi meski ada antrean pengiriman ulang (retry).
> 4. Pastikan `X-API-KEY` menggunakan kombinasi string acak panjang yang unik di lingkungan produksi (bukan nilai contoh).

---

### C. Constraints (Batasan - Opsional)
Tidak diperlukan constraint khusus. Jika ingin mencegah trigger saat roaming atau tidak ada koneksi, MacroDroid secara otomatis akan gagal mengirim tanpa mengganggu ponsel.

---

## 3. Verifikasi & Pengujian Macro

1. Buka macro yang baru dibuat di MacroDroid.
2. Tekan menu titik tiga di kanan atas -> pilih **Test Actions**.
3. Buka tab **System Log** di MacroDroid untuk melihat status kode respons HTTP:
   - **HTTP 201**: Transaksi baru berhasil diterima dan dicatat ke Inbox.
   - **HTTP 200 (duplicate: true)**: Notifikasi ganda diabaikan oleh sistem deduplikasi.
   - **HTTP 401**: Header `X-API-KEY` salah atau belum terpasang.
   - **HTTP 400**: Format JSON keliru atau nilai `source_device` selain `suami`/`istri`.

---

## 4. Format Payload Pengujian Manual via cURL

Untuk menguji endpoint dari laptop/terminal sebelum macro diaktifkan:

```bash
curl -X POST "https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/webhook-transaction" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: kunci_rahasia_keluarga_123" \
  -d '{
    "source_device": "suami",
    "app_name": "Bank Jago",
    "raw_text": "Pembayaran QRIS Rp 45.000 di Kopi Kenangan berhasil."
  }'
```
