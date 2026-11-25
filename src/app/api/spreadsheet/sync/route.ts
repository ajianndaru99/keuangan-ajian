// ==============================================================================
// API ROUTE: src/app/api/spreadsheet/sync/route.ts
// Sinkronisasi manual / paksa baris transaksi ke Google Spreadsheet
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { syncTransactionsToSpreadsheet } from '@/lib/spreadsheet/sheets-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const providerToken = body.providerToken ? String(body.providerToken).trim() : undefined;
    const transactionIds = Array.isArray(body.transactionIds) ? body.transactionIds.map(String) : undefined;

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

    const householdId =
      profile?.household_id ||
      (await admin.from('profiles').select('household_id').limit(1).maybeSingle()).data?.household_id;

    if (!householdId) {
      return NextResponse.json({ error: 'Household tidak ditemukan.' }, { status: 404 });
    }

    const syncRes = await syncTransactionsToSpreadsheet(admin, householdId, transactionIds, providerToken);
    if (!syncRes.success) {
      return NextResponse.json({ error: syncRes.error || 'Sync gagal' }, { status: 502 });
    }

    return NextResponse.json({
      status: 'success',
      synced_count: syncRes.syncedCount,
      skipped: Boolean(syncRes.skipped),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync exception' },
      { status: 500 }
    );
  }
}
