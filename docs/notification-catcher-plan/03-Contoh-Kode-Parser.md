# Modul Parser Teks Regex

Sistem *Notification Catcher Parser* (V5) memiliki arsitektur mandiri dengan kerangka pengujian komprehensif (84 unit test parser via vitest + 21 integration test via node:test, total 105 tests lulus) yang hidup di dalam `supabase/functions/_shared/parsers/`. Seluruh pengujian dapat diverifikasi langsung melalui `npm test` atau `npm run test:parsers`.

## Struktur Engine Parser Baru

Arsitektur Parser dibagi ke dalam beberapa layer *Separation of Concerns* (SoC):
1. **types.ts**: Mendefinisikan kontrak interface `Direction`, `Outcome`, dan struktur `ParseResult`.
2. **rules.ts**: Berisi array *Regex* global untuk bahasa Indonesia. Mencakup deteksi `OTP` (Sensitif Data yang dipersempit agar tidak memotong transaksi sah), Promo, Kegagalan, Refund, Pending, dan Sukses. Modul Webhook mengekspor `matchesAny(teks, SENSITIVE_PATTERNS)` dari sini untuk memblokir teks OTP sebelum dicatat/dilog ke sistem.
3. **fields.ts**: Menangani utilitas ekstraksi. Termasuk manipulasi NFKC (menangani zero-width space dan karakter full-width), menghapus spasi non-breaking, dan ekstraksi Counterparty / Merchant (memotong string di titik singkatan `PT.`, menolak kata *self* "rekening Anda", dll), serta validasi `parseReceivedAt` (memberikan epoch millisecond yang tangguh, mencegah manipulasi tahun depan/janggal).
4. **amount.ts**: Parsing ekstraksi numerik yang ketat. Semua angka diurai menjadi `Number` (safe integer Rupiah), nominal lebih dari 1 angka akan diurai lalu dipisah berdasarkan letak kata kuncinya (saldo vs fee vs transfer), serta tidak lagi tertipu dengan format ganda "50,000" dan "1.500.000".
5. **engine.ts**: Otak operasi *pipelining* yang menggabungkan rules dan amount untuk diubah menjadi struktur keluaran `{ outcome, direction, amount, merchant, reasons, parserVersion }`.
6. **livin.ts**: Konfigurasi profil bank spesifik.

**PERHATIAN:**
Saat ini (selama periode berjalannya Fase 0), profil *Livin* yang ada di dalam `supabase/functions/_shared/parsers/livin.ts` hanyalah menggunakan kosa kata umum perbankan (Sintetis / Hipotesis) dan bersifat *sengaja dibuat gagal (needsReview)* bila kosa kata tidak cocok persis. 

Setelah Fase 0 selesai dan set data `raw_notifications` riil milik pengguna sudah terhimpun secara ekstensif, file profil ini akan diperbarui dengan data konkret, lalu status `parserVersion` akan dinaikkan (*bump version*).
