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
  themeColor: '#38bdf8',
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
      <body className="min-h-screen text-slate-900 dark:text-slate-100 font-sans selection:bg-sky-400 selection:text-white antialiased">
        <div className="mx-auto max-w-md md:max-w-xl min-h-screen flex flex-col bg-white/50 dark:bg-slate-950/60 backdrop-blur-2xl border-x border-white/70 dark:border-white/10 shadow-[0_0_40px_rgba(100,116,139,0.06)]">
          {children}
        </div>
      </body>
    </html>
  );
}
