import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dashboard Keuangan Keluarga',
  description: 'Rekap & pemetaan pengeluaran digital otomatis keluarga.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('theme');
                if (saved === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-100/70 dark:bg-[#070a11] text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
        <div className="mx-auto max-w-md md:max-w-xl min-h-screen flex flex-col bg-slate-50/50 dark:bg-[#0b0f19] border-x border-slate-200/80 dark:border-slate-800/80 shadow-sm">
          {children}
        </div>
      </body>
    </html>
  );
}
