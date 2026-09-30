# Dashboard Keuangan Keluarga (Otomatisasi Notifikasi MacroDroid)

Sistem pencatatan dan pemetaan pengeluaran keuangan digital keluarga (Bank & E-Wallet) berbasis notifikasi Android otomatis via MacroDroid ke Supabase Webhook.

---

## Arsitektur & Tech Stack
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Supabase Auth)
- **Webhook**: Supabase Edge Functions (Deno / TypeScript)
- **Frontend**: Next.js App Router (TypeScript, Tailwind CSS)
- **Charts**: Recharts
- **Automasi**: MacroDroid (Android) -> HTTP Request POST (X-API-KEY)

---

## Struktur Folder
```
dashboard-keuangan-keluarga/
├── supabase/
│   ├── migrations/
│   │   └── 20260928000000_init_schema.sql  # Skema tabel, indeks, RLS & triggers
│   ├── seed.sql                            # Data awal akun keluarga
│   └── functions/
│       └── webhook-transaction/            # Supabase Edge Function
│           ├── index.ts
│           └── parsers/                    # Parser notifikasi per bank
│               ├── types.ts
│               ├── utils.ts
│               ├── bca.ts
│               ├── mandiri.ts
│               ├── bri.ts
│               ├── jago.ts
│               ├── gopay.ts
│               ├── shopeepay.ts
│               ├── dana.ts
│               ├── ovo.ts
│               ├── generic.ts
│               └── index.ts
├── tests/
│   ├── parsers.test.ts                     # 35 unit test format notifikasi
│   └── webhook-flow.test.ts                # 6 integration test HTTP flow
├── scripts/
│   └── serve-webhook-mock.ts               # Mock server lokal untuk test curl
├── .env.example
├── .gitignore
└── package.json
```

---

## Pengujian Lokal (Unit Tests)

Jalankan test runner native Node.js (tanpa dependensi eksternal):
```bash
npm test
```

Menjalankan mock server webhook lokal:
```bash
npm run serve:mock
```

---

## Lisensi
MIT
