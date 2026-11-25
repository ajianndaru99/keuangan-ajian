// ==============================================================================
// AUTH CALLBACK ROUTE: src/app/auth/callback/route.ts
// Menangani penukaran kode OAuth / Magic Link Email & auto-provisioning Google Sheets
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { provisionSpreadsheetForEmail, syncTransactionsToSpreadsheet } from '@/lib/spreadsheet/sheets-sync';
import { isTelegramConfigured, broadcastToAllowedChats } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/';

  const supabase = await createServerClient();
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      const userEmail = data.session.user?.email || '';
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      // Jika login via Google OAuth membawa token Drive/Sheets, siapkan Spreadsheet otomatis
      if (providerToken && userEmail) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && serviceKey) {
          try {
            const admin = createSupabaseAdmin(supabaseUrl, serviceKey);
            const { data: profile } = await admin
              .from('profiles')
              .select('household_id')
              .limit(1)
              .maybeSingle();

            if (profile?.household_id) {
              // Pastikan user Google juga terikat ke household yang sama jika belum punya profil
              const { data: existingOwnProfile } = await admin
                .from('profiles')
                .select('id')
                .eq('id', data.session.user.id)
                .maybeSingle();

              if (!existingOwnProfile) {
                await admin.from('profiles').insert({
                  id: data.session.user.id,
                  household_id: profile.household_id,
                  display_name: 'Kepala Keluarga (Suami)',
                  role: 'suami',
                });
              }

              // Cek apakah sudah pernah punya spreadsheet_id
              const { data: existingInteg } = await admin
                .from('spreadsheet_integrations')
                .select('spreadsheet_id')
                .eq('household_id', profile.household_id)
                .maybeSingle();

              if (!existingInteg?.spreadsheet_id) {
                const prov = await provisionSpreadsheetForEmail({
                  supabase: admin,
                  householdId: profile.household_id,
                  email: userEmail,
                  providerToken,
                  providerRefreshToken,
                });

                if (prov.success) {
                  const syncRes = await syncTransactionsToSpreadsheet(
                    admin,
                    profile.household_id,
                    undefined,
                    providerToken
                  );
                  if (isTelegramConfigured() && prov.spreadsheetUrl) {
                    await broadcastToAllowedChats(
                      `*[SPREADSHEET OTOMATIS SIAP]*\nEmail: \`${userEmail}\`\nTersinkron: *${syncRes.syncedCount} transaksi*\nLink:\n${prov.spreadsheetUrl}`
                    ).catch(() => undefined);
                  }
                }
              } else if (providerRefreshToken) {
                await admin
                  .from('spreadsheet_integrations')
                  .update({ google_refresh_token: providerRefreshToken })
                  .eq('household_id', profile.household_id);
              }
            }
          } catch {
            // Non-blocking: user tetap masuk ke dashboard meskipun provisioning sheet gagal
          }
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
