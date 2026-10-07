# Panduan Konfigurasi MacroDroid Android (Screenshot ke Dashboard Keuangan)

Dokumen ini memandu langkah demi langkah pemasangan otomasi di ponsel Android menggunakan aplikasi **MacroDroid**.

Setelah dikonfigurasi, setiap kali Anda mengambil screenshot bukti transaksi perbankan atau e-wallet (tekan tombol Power + Volume Bawah), data transaksi akan otomatis terkirim dan dicatat ke sistem dalam hitungan 2–3 detik tanpa membuka aplikasi apa pun lagi.

---

## 1. Prasyarat

1. Ponsel Android dengan aplikasi **MacroDroid** (dapat diunduh gratis di Google Play Store).
2. URL Endpoint sistem Anda:
   * **Jika menggunakan hosting Vercel/Next.js:**
     `https://<DOMAIN_ANDA>/api/screenshot`
   * **Jika menggunakan Supabase Edge Function:**
     `https://<REF_SUPABASE>.supabase.co/functions/v1/screenshot-transaction`
   * **Jika pengujian lokal dalam satu jaringan WiFi:**
     `http://<IP_KOMPUTER_LOKAL>:3001/api/screenshot`
3. Kunci Rahasia API (`WEBHOOK_API_KEY` dari file `.env.local` atau Supabase Secrets).

---

## 2. Langkah Pembuatan Makro di MacroDroid

Buka aplikasi **MacroDroid** di HP Android Anda, lalu ikuti langkah berikut:

### Langkah A: Tambah Makro Baru
1. Di layar utama MacroDroid, ketuk tombol **Add Macro** (+ Tambah Makro).
2. Beri nama makro: `Auto Send Screenshot Finance`.

### Langkah B: Menentukan Trigger (Pemicu)
Pemicu menentukan kapan makro harus berjalan.
1. Di bilah merah **Triggers**, ketuk ikon tanda tambah (**+**).
2. Pilih kategori **Screen & Speaker** (Layar & Speaker) -> pilih **Screen Shot Taken** (Tangkapan Layar Dibuat).
   *(Alternatif jika HP Anda merek Xiaomi/Oppo/Samsung tertentu: gunakan trigger **File** -> **File Added** -> arahkan ke folder `/DCIM/Screenshots/`)*.
3. Berikan izin akses penyimpanan jika MacroDroid memintanya.

### Langkah C: Menentukan Action (Tindakan Kirim Gambar)
Tindakan ini bertugas mengirimkan file screenshot yang baru saja diambil ke endpoint sistem Anda.
1. Di bilah biru **Actions**, ketuk ikon tanda tambah (**+**).
2. Pilih kategori **Connectivity** (Konektivitas) -> pilih **HTTP Request** (Permintaan HTTP).
3. Atur parameter HTTP Request sebagai berikut:
   * **Request Method:** Pilih `POST`
   * **URL:** Masukkan URL endpoint sistem Anda, contoh:
     `https://dashboard-keuangan.vercel.app/api/screenshot`
   * **Content Type:** Pilih `multipart/form-data`
   * **Headers (Header Permintaan):**
     * Tambahkan baris baru:
       * **Header Name:** `X-API-KEY`
       * **Header Value:** `kunci_rahasia_keluarga_123` *(sesuaikan dengan nilai WEBHOOK_API_KEY Anda)*
   * **Form / Body Fields:**
     * Field 1:
       * **Name:** `source_device`
       * **Value:** `suami` *(atau `istri` pada HP pasangan)*
     * Field 2 (File Lampiran):
       * **Name:** `image`
       * **File Attachment:** Ketuk ikon tiga titik / tag `[last_screenshot]` atau arahkan ke variabel file screenshot terakhir.
4. Simpan konfigurasi HTTP Request.

### Langkah D: Menambahkan Notifikasi Konfirmasi (Opsional tapi Nyaman)
Agar Anda tahu transaksi sudah berhasil dikirim tanpa harus mengecek dashboard:
1. Di bilah biru **Actions**, ketuk tanda tambah (**+**).
2. Pilih **Notification** -> **Display Notification** atau **Notification Toast**.
3. Isi teks pesan: *"📸 Bukti transfer terkirim ke dashboard keuangan"*.
4. Tambahkan getaran singkat: Pilih **Device Actions** -> **Vibrate**.

### Langkah E: Simpan Makro
Ketuk ikon centang di pojok kanan bawah untuk menyimpan makro. Pastikan sakelar makro dalam posisi **Aktif (ON)**.

---

## 3. Uji Coba Lapangan

1. Buka aplikasi m-banking Anda (BCA, Livin Mandiri, BRImo, Jago) atau e-wallet (GoPay, OVO, DANA, ShopeePay).
2. Lakukan transaksi pembayaran atau transfer seperti biasa hingga muncul layar bukti **"Transaksi Berhasil"**.
3. Ambil tangkapan layar (screenshot) menggunakan kombinasi tombol fisik HP Anda.
4. Anda akan melihat notifikasi toast singkat muncul di layar ponsel.
5. Buka dashboard web di komputer atau browser HP Anda pada menu **Inbox**.
6. Transaksi akan langsung muncul di daftar pending dengan nominal, nama toko/penerima, dan rekening yang telah diekstrak secara tepat oleh Vision AI.

---

## 4. Catatan Penting & Tips Optimasi Android

* **Hemat Daya / Battery Optimization:** 
  Masuk ke Pengaturan HP -> *Aplikasi* -> *MacroDroid* -> *Penggunaan Baterai*, lalu ubah menjadi **Tidak Dibatasi (Unrestricted)** agar Android tidak mematikan service MacroDroid di latar belakang.
* **Privasi & Keamanan:** 
  Sistem hanya memproses gambar yang dikirimkan ke endpoint terproteksi `X-API-KEY`. Gambar screenshot non-keuangan (misal chat WhatsApp) yang terkirim tidak sengaja akan otomatis ditolak oleh Vision AI dengan status gagal validasi struk.
* **Pengguna iOS (iPhone):**
  Untuk pengguna iPhone, buat automasi di aplikasi **Shortcuts (Pintasan)** -> tab *Automation* -> *When I Take a Screenshot* -> aksi *Get Contents of URL* (POST ke endpoint yang sama).
