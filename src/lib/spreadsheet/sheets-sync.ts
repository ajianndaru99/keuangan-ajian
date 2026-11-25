// ==============================================================================
// GOOGLE SPREADSHEET SYNC ENGINE: src/lib/spreadsheet/sheets-sync.ts
// Mendukung dua jalur cepat:
// 1. Google Sheets API v4 (OAuth token dari Login Google Email)
// 2. Google Apps Script Webhook (Code.gs) sebagai alternatif bebas kredensial OAuth server
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SheetTransactionRow {
  tx_id: string;
  tanggal_wib: string;
  waktu_wib: string;
  akun: string;
  arah: 'Masuk' | 'Keluar' | 'Transfer Internal';
  nominal: number;
  merchant: string;
  kategori: string;
  status: string;
  catatan: string;
  sumber: string;
  raw_notification: string;
}

interface SpreadsheetIntegrationRecord {
  household_id: string;
  spreadsheet_id: string | null;
  sheet_name: string | null;
  webhook_url: string | null;
  sync_secret: string | null;
  google_refresh_token: string | null;
  last_synced_at: string | null;
  last_error: string | null;
}

const HEADER_COLUMNS = [
  'ID Transaksi',
  'Tanggal (WIB)',
  'Waktu (WIB)',
  'Akun',
  'Arah',
  'Nominal (Rp)',
  'Merchant / Keterangan',
  'Kategori',
  'Status',
  'Catatan',
  'Sumber',
  'Isi Notifikasi Lengkap',
];

// Cache token akses sementara di memori untuk menghindari round-trip OAuth berulang
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Mengubah timestamp ISO ke tanggal & jam WIB (UTC+7)
 */
export function formatWibDateParts(isoDate?: string | null): { tanggal: string; waktu: string } {
  const date = isoDate ? new Date(isoDate) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const wibMs = safeDate.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const d = String(wib.getUTCDate()).padStart(2, '0');
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return { tanggal: `${y}-${m}-${d}`, waktu: `${hh}:${mm}` };
}

/**
 * Mengonversi baris transaksi DB menjadi payload standar baris Spreadsheet
 */
export function buildSheetTransactionRow(tx: {
  id: string;
  transaction_date?: string | null;
  account_name?: string | null;
  direction?: string | null;
  amount?: number | null;
  merchant?: string | null;
  category_name?: string | null;
  status?: string | null;
  notes?: string | null;
  parse_method?: string | null;
  raw_notification?: string | null;
}): SheetTransactionRow {
  const { tanggal, waktu } = formatWibDateParts(tx.transaction_date);
  const merchantText = tx.merchant || '-';
  const isTransfer = /^transfer\s*internal/i.test(merchantText);
  const arah: SheetTransactionRow['arah'] = isTransfer
    ? 'Transfer Internal'
    : tx.direction === 'in'
      ? 'Masuk'
      : 'Keluar';

  return {
    tx_id: tx.id,
    tanggal_wib: tanggal,
    waktu_wib: waktu,
    akun: tx.account_name || '-',
    arah,
    nominal: Math.round(Number(tx.amount || 0)),
    merchant: merchantText,
    kategori: isTransfer ? 'Transfer Internal' : tx.category_name || (arah === 'Masuk' ? 'Gaji/Pemasukan' : 'Lainnya'),
    status: tx.status || 'pending',
    catatan: tx.notes || '',
    sumber: tx.parse_method || 'regex',
    raw_notification: (tx.raw_notification || '').slice(0, 800),
  };
}

function rowToSheetValues(row: SheetTransactionRow): Array<string | number> {
  return [
    row.tx_id,
    row.tanggal_wib,
    row.waktu_wib,
    row.akun,
    row.arah,
    row.nominal,
    row.merchant,
    row.kategori,
    row.status,
    row.catatan,
    row.sumber,
    row.raw_notification,
  ];
}

async function getAccessTokenFromRefresh(householdId: string, refreshToken: string): Promise<string | null> {
  const cached = accessTokenCache.get(householdId);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(4000),
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;

    const expiresInSec = Number(data.expires_in || 3500);
    accessTokenCache.set(householdId, {
      token: String(data.access_token),
      expiresAt: Date.now() + expiresInSec * 1000,
    });
    return String(data.access_token);
  } catch {
    return null;
  }
}

async function syncRowsViaWebhook(
  webhookUrl: string,
  secret: string | null,
  rows: SheetTransactionRow[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4500),
      body: JSON.stringify({
        action: rows.length === 1 ? 'upsert' : 'upsert_batch',
        secret: secret || '',
        headers: HEADER_COLUMNS,
        row: rows.length === 1 ? rows[0] : undefined,
        rows: rows.length > 1 ? rows : undefined,
      }),
    });
    if (!res.ok) {
      return { success: false, error: `Webhook HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Timeout webhook Sheets' };
  }
}

async function syncRowsViaGoogleApi(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rows: SheetTransactionRow[]
): Promise<{ success: boolean; error?: string }> {
  if (rows.length === 0) return { success: true };
  const safeSheet = sheetName || 'Transaksi';

  try {
    // Ambil kolom A (tx_id) untuk upsert idempoten tanpa duplikasi baris
    const colRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${safeSheet}!A1:A2000`)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(4500),
      }
    );

    if (!colRes.ok) {
      return { success: false, error: `Sheets read HTTP ${colRes.status}` };
    }

    const colData = await colRes.json();
    const existingColA: string[][] = Array.isArray(colData.values) ? colData.values : [];
    const rowIndexByTxId = new Map<string, number>();
    existingColA.forEach((cell, idx) => {
      const val = String(cell?.[0] || '').trim();
      if (val && idx > 0) rowIndexByTxId.set(val, idx + 1);
    });

    // Tulis header bila sheet masih kosong
    if (existingColA.length === 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${safeSheet}!A1:L1`)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(4000),
          body: JSON.stringify({ values: [HEADER_COLUMNS] }),
        }
      );
    }

    const updates: Array<{ range: string; values: Array<Array<string | number>> }> = [];
    const appends: Array<Array<string | number>> = [];

    for (const r of rows) {
      const vals = rowToSheetValues(r);
      const existingRow = rowIndexByTxId.get(r.tx_id);
      if (existingRow) {
        updates.push({ range: `${safeSheet}!A${existingRow}:L${existingRow}`, values: [vals] });
      } else {
        appends.push(vals);
      }
    }

    if (updates.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(4500),
          body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: updates }),
        }
      );
    }

    if (appends.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${safeSheet}!A:L`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(4500),
          body: JSON.stringify({ values: appends }),
        }
      );
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Google Sheets API error' };
  }
}

/**
 * Membuat Google Spreadsheet baru langsung di akun Google user & menyimpannya ke DB
 */
export async function provisionSpreadsheetForEmail(params: {
  supabase: SupabaseClient;
  householdId: string;
  email: string;
  providerToken: string;
  providerRefreshToken?: string | null;
}): Promise<{ success: boolean; spreadsheetId?: string; spreadsheetUrl?: string; error?: string }> {
  const { supabase, householdId, email, providerToken, providerRefreshToken } = params;

  try {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        properties: {
          title: `Dashboard Keuangan Keluarga (${email})`,
          locale: 'id_ID',
          timeZone: 'Asia/Jakarta',
        },
        sheets: [{ properties: { title: 'Transaksi' } }],
      }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => '');
      return { success: false, error: `Gagal membuat Spreadsheet (${createRes.status}): ${errBody.slice(0, 120)}` };
    }

    const created = await createRes.json();
    const spreadsheetId = String(created.spreadsheetId || '');
    const spreadsheetUrl =
      String(created.spreadsheetUrl || '') ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    if (!spreadsheetId) {
      return { success: false, error: 'Google API tidak mengembalikan spreadsheetId.' };
    }

    // Isi baris header kolom A1:L1
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent('Transaksi!A1:L1')}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({ values: [HEADER_COLUMNS] }),
      }
    );

    await supabase.from('spreadsheet_integrations').upsert({
      household_id: householdId,
      spreadsheet_id: spreadsheetId,
      sheet_name: 'Transaksi',
      google_refresh_token: providerRefreshToken || null,
      last_error: null,
      updated_at: new Date().toISOString(),
    });

    await supabase
      .from('settings')
      .update({
        spreadsheet_url: spreadsheetUrl,
        spreadsheet_owner_email: email,
        spreadsheet_auto_sync: true,
      })
      .eq('household_id', householdId);

    return { success: true, spreadsheetId, spreadsheetUrl };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Gagal menghubungi Google Sheets API',
    };
  }
}

/**
 * Menyinkronkan satu atau banyak transaksi ke Google Spreadsheet tanpa memblokir proses utama terlalu lama.
 */
export async function syncTransactionsToSpreadsheet(
  supabase: SupabaseClient,
  householdId: string,
  transactionIds?: string[],
  overrideAccessToken?: string
): Promise<{ success: boolean; syncedCount: number; skipped?: boolean; error?: string }> {
  if (!householdId) return { success: false, syncedCount: 0, error: 'household_id kosong' };

  try {
    const [{ data: settingRow }, { data: integration }] = await Promise.all([
      supabase
        .from('settings')
        .select('spreadsheet_auto_sync, spreadsheet_url')
        .eq('household_id', householdId)
        .maybeSingle(),
      supabase
        .from('spreadsheet_integrations')
        .select('household_id, spreadsheet_id, sheet_name, webhook_url, sync_secret, google_refresh_token, last_synced_at, last_error')
        .eq('household_id', householdId)
        .maybeSingle(),
    ]);

    const integ = integration as SpreadsheetIntegrationRecord | null;
    if (!integ || (!integ.webhook_url && !integ.spreadsheet_id)) {
      return { success: true, syncedCount: 0, skipped: true };
    }

    // Jika auto-sync dimatikan dan bukan panggilan sinkronisasi manual (transactionIds kosong)
    if (settingRow?.spreadsheet_auto_sync === false && transactionIds && transactionIds.length > 0) {
      return { success: true, syncedCount: 0, skipped: true };
    }

    let query = supabase
      .from('transactions')
      .select('id, transaction_date, amount, direction, merchant, status, notes, parse_method, raw_notification, accounts(name), categories(name)')
      .eq('household_id', householdId)
      .order('transaction_date', { ascending: false });

    if (transactionIds && transactionIds.length > 0) {
      query = query.in('id', transactionIds);
    } else {
      query = query.neq('status', 'ignored').limit(200);
    }

    const { data: txRows, error: txErr } = await query;
    if (txErr || !txRows || txRows.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    const formattedRows = txRows.map((t) => {
      const accRel = t.accounts as unknown as { name?: string } | Array<{ name?: string }> | null;
      const catRel = t.categories as unknown as { name?: string } | Array<{ name?: string }> | null;
      const accountName = Array.isArray(accRel) ? accRel[0]?.name : accRel?.name;
      const categoryName = Array.isArray(catRel) ? catRel[0]?.name : catRel?.name;
      return buildSheetTransactionRow({
        id: String(t.id),
        transaction_date: t.transaction_date,
        account_name: accountName,
        direction: t.direction,
        amount: t.amount,
        merchant: t.merchant,
        category_name: categoryName,
        status: t.status,
        notes: t.notes,
        parse_method: t.parse_method,
        raw_notification: t.raw_notification,
      });
    });

    let result: { success: boolean; error?: string } = { success: false, error: 'Tidak ada kredensial sync aktif' };

    if (integ.webhook_url) {
      result = await syncRowsViaWebhook(integ.webhook_url, integ.sync_secret, formattedRows);
    } else if (integ.spreadsheet_id) {
      const token =
        overrideAccessToken ||
        (integ.google_refresh_token ? await getAccessTokenFromRefresh(householdId, integ.google_refresh_token) : null);

      if (!token) {
        result = { success: false, error: 'Token Google Sheets kedaluwarsa; sambungkan ulang Google / Apps Script.' };
      } else {
        result = await syncRowsViaGoogleApi(token, integ.spreadsheet_id, integ.sheet_name || 'Transaksi', formattedRows);
      }
    }

    await supabase
      .from('spreadsheet_integrations')
      .update({
        last_synced_at: result.success ? new Date().toISOString() : integ.last_synced_at,
        last_error: result.success ? null : (result.error || 'Sync gagal'),
        updated_at: new Date().toISOString(),
      })
      .eq('household_id', householdId);

    return {
      success: result.success,
      syncedCount: result.success ? formattedRows.length : 0,
      error: result.error,
    };
  } catch (err: unknown) {
    return {
      success: false,
      syncedCount: 0,
      error: err instanceof Error ? err.message : 'Sync exception',
    };
  }
}
