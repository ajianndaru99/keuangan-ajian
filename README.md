# Dashboard Keuangan Keluarga (Screenshot & Vision AI Ingestion)

Sistem pencatatan dan pemetaan pengeluaran keuangan digital keluarga (Bank & E-Wallet) berbasis ekstraksi multimodal otomatis bukti transfer / QRIS (Screenshot) menggunakan Google Gemini Flash Vision AI ke Supabase.

---

## Arsitektur & Tech Stack
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Ingestion**: 
  - **Android Automasi**: MacroDroid (Trigger: *Screenshot Taken* -> HTTP POST)
  - **iOS Automasi**: Apple Shortcuts (Trigger: *When I take a screenshot* -> HTTP POST)
  - **Web Dashboard**: Area Unggah Drag & Drop, Akses Kamera HP, dan Keyboard Paste (`Ctrl + V`)
- **Vision AI Engine**: Google Gemini Flash API (Multimodal JSON extraction untuk m-banking BCA, Livin Mandiri, BRImo, Jago, GoPay, ShopeePay, DANA, OVO, QRIS, dan struk kasir)
- **Backend Ingestion**: Next.js API Route (`/api/screenshot`) & Supabase Edge Function (`screenshot-transaction`)
- **Frontend Dashboard**: Next.js App Router (TypeScript, Tailwind CSS)
- **Visualisasi & Analisis**: Recharts

---

## Struktur Folder
```
dashboard-keuangan-keluarga/
├── supabase/
│   ├── migrations/
│   │   ├── 20260928000000_init_schema.sql         # Skema tabel, indeks, RLS & triggers
│   │   ├── 20260928000001_phase3_and_phase4.sql   # RPC ringkasan akun dan rekap
│   │   └── 20261005000000_security_fixes.sql      # Keamanan RLS & RPC
│   ├── seed.sql                                   # Data awal akun keluarga
│   └── functions/
│       └── screenshot-transaction/                # Supabase Edge Function Screenshot Ingestion
│           └── index.ts
├── src/                                           # Aplikasi Frontend Next.js
│   ├── app/
│   │   ├── api/screenshot/route.ts                # API Route penerima screenshot
│   │   ├── accounts/page.tsx                      # Manajemen Rekening & Saldo
│   │   ├── budget/page.tsx                        # Alokasi & Budgeting
│   │   ├── inbox/page.tsx                         # Verifikasi & Inbox Transaksi
│   │   ├── login/page.tsx                         # Autentikasi Pengguna
│   │   └── rekap/page.tsx                         # Rekap Mingguan & Bulanan
│   ├── components/                                # Komponen UI
│   │   └── inbox/RealtimeToast.tsx                # Notifikasi Pop-up Halus Transaksi Realtime
│   └── lib/
│       └── vision/gemini.ts                       # Core Vision AI Multimodal Extractor
├── scripts/
│   └── serve-webhook-mock.ts                      # Mock server lokal untuk test curl
├── tests/
│   ├── screenshot-vision.test.ts                  # Unit test ekstraksi Vision AI & dedupe
│   └── screenshot-flow.test.ts                    # Integration test alur HTTP endpoint
├── docs/
│   └── macrodroid-screenshot-setup.md             # Panduan automasi MacroDroid Android
├── .env.example
├── .gitignore
└── package.json
```

---

## Pengujian Lokal (Quality Gates)

Jalankan test runner native Node.js:
```bash
npm test
```

Validasi type check TypeScript:
```bash
npx tsc --noEmit
```

Build aplikasi Next.js untuk produksi:
```bash
npm run build
```

Menjalankan server mock webhook lokal:
```bash
npm run serve:mock
```

Menjalankan server frontend lokal:
```bash
npm run dev
```

---

## Lisensi
MIT
