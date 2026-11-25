// ==============================================================================
// API ROUTE: src/app/api/spreadsheet/provision/route.ts
// Provisioning Google Spreadsheet otomatis untuk email login Suami & sync awal
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { provisionSpreadsheetForEmail, syncTransactionsToSpreadsheet } from '@/lib/spreadsheet/sheets-sync';
import { isTelegramConfigured, broadcastToAllowedChats } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const providerToken = String(body.providerToken || '').trim();
    const providerRefreshToken = body.providerRefreshToken ? String(body.providerRefreshToken).trim() : null;
    const email = String(body.email || user.email || '').trim();

    if (!providerToken) {
      return NextResponse.json(
        { error: 'Token akses Google Drive/Sheets tidak tersedia. Login ulang dengan Google OAuth atau atur via Telegram /pengaturan.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Konfigurasi server belum lengkap.' }, { status: 500 });
    }

    const admin = createSupabaseAdmin(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from('profiles')
      .select('household_id')
      .eq('id', user.id)
      .maybeSingle();

    let householdId = profile?.household_id;
    if (!householdId) {
      const { data: fallbackProfile } = await admin
        .from('profiles')
        .select('household_id')
        .limit(1)
        .maybeSingle();
      householdId = fallbackProfile?.household_id;
    }

    if (!householdId) {
      return NextResponse.json({ error: 'Household tidak ditemukan.' }, { status: 404 });
    }

    const provisionRes = await provisionSpreadsheetForEmail({
      supabase: admin,
      householdId,
      email: email || 'suami@keluarga',
      providerToken,
      providerRefreshToken,
    });

    if (!provisionRes.success) {
      return NextResponse.json({ error: provisionRes.error || 'Gagal membuat Spreadsheet' }, { status: 502 });
    }

    // Backfill transaksi terbaru menggunakan providerToken aktif
    const syncRes = await syncTransactionsToSpreadsheet(admin, householdId, undefined, providerToken);

    if (isTelegramConfigured() && provisionRes.spreadsheetUrl) {
      try {
        await broadcastToAllowedChats(
          `*[SPREADSHEET TERHUBUNG]*\nEmail: \`${email}\`\nSinkron awal: *${syncRes.syncedCount} transaksi*\nLink Spreadsheet:\n${provisionRes.spreadsheetUrl}`
        );
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({
      status: 'success',
      spreadsheet_id: provisionRes.spreadsheetId,
      spreadsheet_url: provisionRes.spreadsheetUrl,
      synced_count: syncRes.syncedCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Provisioning exception' },
      { status: 500 }
    );
  }
}
