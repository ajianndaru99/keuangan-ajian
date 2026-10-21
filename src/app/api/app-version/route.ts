// ==============================================================================
// API ROUTE: src/app/api/app-version/route.ts
// Endpoint informasi versi resmi aplikasi Android Keuangan Keluarga
// Mendukung pengecekan pembaruan otomatis (In-App Auto Updater)
// Menggunakan standar Web Fetch API Response (native Node & Next.js)
// ==============================================================================

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export async function OPTIONS() {
  return new Response('ok', { headers: corsHeaders });
}

interface RemoteVersionJson {
  versionCode?: number;
  versionName?: string;
  releaseNotes?: string;
  apkUrl?: string;
}

export async function GET() {
  // Nilai default cadangan jika server GitHub belum merespons
  const defaultVersion = {
    versionCode: 1,
    versionName: '1.0.1',
    releaseNotes: 'Rilis resmi aplikasi Keuangan Keluarga dengan fitur sinkronisasi otomatis dan sistem pembaruan in-app.',
    apkUrl: 'https://github.com/ajianndaru99/keuangan-ajian/releases/latest/download/KeuanganKeluarga-Release.apk',
    fallbackApkUrl: 'https://github.com/ajianndaru99/keuangan-ajian/releases/latest/download/app-release.apk',
    forceUpdate: false,
    publishedAt: new Date().toISOString(),
  };

  try {
    // Coba baca rilis versi dinamis dari GitHub Release asset jika tersedia
    const remoteUrl = 'https://github.com/ajianndaru99/keuangan-ajian/releases/latest/download/version.json';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const remoteRes = await fetch(remoteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KeuanganKeluarga-App-Version-Fetcher',
      },
      next: { revalidate: 60 },
    });
    clearTimeout(timeoutId);

    if (remoteRes.ok) {
      const data: RemoteVersionJson = await remoteRes.json();
      if (data && typeof data.versionCode === 'number' && data.versionCode > 0) {
        return Response.json({
          versionCode: data.versionCode,
          versionName: data.versionName || `1.0.${data.versionCode}`,
          releaseNotes: data.releaseNotes || defaultVersion.releaseNotes,
          apkUrl: data.apkUrl || defaultVersion.apkUrl,
          fallbackApkUrl: defaultVersion.fallbackApkUrl,
          forceUpdate: false,
          publishedAt: new Date().toISOString(),
        }, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        });
      }
    }
  } catch {
    // Gunakan nilai default cadangan jika jaringan GitHub lambat atau belum ada version.json
  }

  return Response.json(defaultVersion, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
