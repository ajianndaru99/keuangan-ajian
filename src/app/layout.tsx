import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dashboard Keuangan Keluarga | Notifikasi Otomatis',
  description: 'Rekap & pemetaan pengeluaran digital (bank + e-wallet) otomatis berbasis notifikasi MacroDroid untuk suami dan istri.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#4f46e5',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans selection:bg-indigo-500 selection:text-white">
        <div className="mx-auto max-w-md md:max-w-2xl min-h-screen flex flex-col shadow-2xl bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
          {children}
        </div>
      </body>
    </html>
  );
}
