// ==============================================================================
// CRON ROUTE: src/app/api/cron/daily-reconcile/route.ts
// Endpoint Cron Otomatis Setiap Jam 23:00 WIB (16:00 UTC)
// Terjadwal otomatis via Vercel Cron / external scheduler
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { POST as runReconcilePost } from '@/app/api/ai/daily-reconcile/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null;

  // Jika CRON_SECRET dikonfigurasi, lakukan verifikasi
  if (cronSecret && token !== cronSecret) {
    return NextResponse.json(
      { error: 'Unauthorized: CRON_SECRET tidak valid.' },
      { status: 401 }
    );
  }

  // Panggil eksekusi rekonsiliasi harian dengan mode cron
  const forwardUrl = new URL(req.url);
  forwardUrl.pathname = '/api/ai/daily-reconcile';
  forwardUrl.searchParams.set('cron', 'true');

  const proxyReq = new NextRequest(forwardUrl.toString(), {
    method: 'POST',
    headers: req.headers,
  });

  const response = await runReconcilePost(proxyReq);
  return response;
}
