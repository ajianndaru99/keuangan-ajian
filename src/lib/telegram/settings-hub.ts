// ==============================================================================
// TELEGRAM SETTINGS HUB: src/lib/telegram/settings-hub.ts
// Pusat Komando Seluruh Pengaturan Finansial Keluarga via Telegram
// Menangani Menu Interaktif: Kelola Rekening, Pagu Anggaran, Gajian, & Filter Spam
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  sendTelegramMessage,
  editTelegramMessageText,
  answerCallbackQuery,
} from './bot.ts';
import { formatRupiah } from '../utils.ts';
import { TARGET_BUDGET_CATEGORIES } from '../budget/budget-guard.ts';
import { getMonthlyRange, getBudgetPeriodKey } from '../date-utils.ts';
import { syncAccountBalance, syncAllHouseholdAccountBalances } from '../account-balance.ts';
import { parseNominal } from './nlp-chat.ts';
import { buildDaily11AMReportText } from './commands.ts';
import { syncTransactionsToSpreadsheet } from '../spreadsheet/sheets-sync.ts';

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number | string;
    };
    text?: string;
  };
  data?: string;
}

/**
 * Format Pesan Menu Utama Pengaturan Hub
 */
export function formatSettingsHubMenuText(): string {
  return `*[PENGATURAN] PUSAT KENDALI KEUANGAN KELUARGA*

Seluruh konfigurasi sistem dikendalikan penuh dari Telegram ini:

- *Rekening & Saldo:* Cek, tambah, nonaktifkan, atau ubah saldo
- *Pagu Anggaran:* Atur kuota belanja 9 kategori utama
- *Tanggal Gajian:* Sinkronisasi siklus finansial bulanan
- *Filter Spam & Promo:* Kelola kata kunci blokir otomatis
- *Google Spreadsheet:* Hubungkan link/webhook & paksa sinkronisasi
- *Notif Penuh:* Toggle tampilan teks notifikasi lengkap di Telegram
- *Laporan 11:00 WIB & Sampah:* Ringkasan harian serta pembersihan log

_Pilih menu di bawah ini:_`;
}

export function getSettingsHubInlineKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Rekening', callback_data: 'cfg:acc' },
        { text: 'Anggaran', callback_data: 'cfg:bg' },
      ],
      [
        { text: 'Tgl Gajian', callback_data: 'cfg:pay' },
        { text: 'Filter Spam', callback_data: 'cfg:spam' },
      ],
      [
        { text: 'Spreadsheet', callback_data: 'cfg:sheet' },
        { text: 'Notif Penuh', callback_data: 'cfg:notif' },
      ],
      [
        { text: 'Laporan 11:00', callback_data: 'cfg:report11' },
        { text: 'Hapus Sampah', callback_data: 'cfg:clean' },
      ],
      [
        { text: 'Tutup', callback_data: 'cfg:close' },
      ],
    ],
  };
}

/**
 * Mengirim Menu Pengaturan Utama ke Chat
 */
export async function sendSettingsHubMenu(
  chatId: number | string,
  replyToMessageId?: number
): Promise<void> {
  await sendTelegramMessage(chatId, formatSettingsHubMenuText(), {
    reply_to_message_id: replyToMessageId,
    reply_markup: getSettingsHubInlineKeyboard(),
  });
}

/**
 * Menangani Sub-Menu Kelola Rekening
 */
async function handleAccountSettingsMenu(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const syncedAccounts = await syncAllHouseholdAccountBalances(supabase, householdId);

  const activeAccounts = syncedAccounts.filter((a) => a.is_active);
  const totalKas = activeAccounts.reduce((sum, a) => sum + Number(a.current_balance || 0), 0);

  const accLines = activeAccounts.map(
    (a) => `- *${a.name}:* \`${formatRupiah(Number(a.current_balance || 0))}\``
  );

  const text = `*[REKENING] KELOLA REKENING & SALDO SUAMI*

*Total Kas Siap Pakai:* \`${formatRupiah(totalKas)}\`

Daftar rekening aktif terdaftar:
${accLines.join('\n') || '- Belum ada rekening aktif -'}

*Panduan Perintah Cepat:*
- Ketik \`total kas ganti 1jt\` untuk sinkronisasi kas
- Ketik \`set saldo dana 2jt\` untuk ubah saldo rekening
- Ketik \`tambah akun <nama> <saldo>\` untuk buat rekening baru
- Ketik \`nonaktifkan akun <nama>\` untuk menutup rekening lama`;

  const buttons = activeAccounts.map((a) => [
    {
      text: `Ubah Saldo: ${a.name}`,
      callback_data: `cfg:abaledit:${a.id.slice(0, 8)}`,
    },
  ]);

  buttons.push([
    { text: '+ Tambah Rekening', callback_data: 'cfg:aadd' },
    { text: 'Sederhanakan Akun', callback_data: 'cfg:asimp' },
  ]);
  buttons.push([
    { text: 'Kembali', callback_data: 'cfg:menu' },
  ]);

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Menampilkan Pilihan Nominal Baru saat Pengguna Menekan "✏️ Ubah Saldo: <Nama Akun>"
 */
async function handleAccountBalanceEditMenu(
  chatId: number | string,
  messageId: number,
  shortAccId: string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const syncedAccounts = await syncAllHouseholdAccountBalances(supabase, householdId);
  const target = syncedAccounts.find((a) => a.id === shortAccId || a.id.startsWith(shortAccId));

  if (!target) {
    await handleAccountSettingsMenu(chatId, messageId, supabase, householdId);
    return;
  }

  const currentBal = Number(target.current_balance || 0);
  const shortId = target.id.slice(0, 8);
  const plus100k = currentBal + 100000;
  const minus100k = Math.max(0, currentBal - 100000);

  const text = `*[UBAH SALDO] ${target.name.toUpperCase()}*

*Saldo Saat Ini:* \`${formatRupiah(currentBal)}\`

Pilih nominal saldo baru secara instan di bawah ini, atau ketik nominal bebas di chat dengan format:
\`set saldo ${target.name.toLowerCase()} 750rb\``;

  const buttons = [
    [
      { text: '+Rp 100rb', callback_data: `sask:${shortId}:${plus100k}` },
      { text: '-Rp 100rb', callback_data: `sask:${shortId}:${minus100k}` },
    ],
    [
      { text: 'Rp 250 Ribu', callback_data: `sask:${shortId}:250000` },
      { text: 'Rp 500 Ribu', callback_data: `sask:${shortId}:500000` },
    ],
    [
      { text: 'Rp 1 Juta', callback_data: `sask:${shortId}:1000000` },
      { text: 'Rp 2 Juta', callback_data: `sask:${shortId}:2000000` },
    ],
    [
      { text: 'Rp 5 Juta', callback_data: `sask:${shortId}:5000000` },
      { text: 'Rp 7,6 Juta', callback_data: `sask:${shortId}:7600000` },
    ],
    [
      { text: 'Kembali ke Rekening', callback_data: 'cfg:acc' },
    ],
  ];

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Konfirmasi Penyederhanaan Akun
 */
async function promptSimplifyAccountsConfirmation(
  chatId: number | string,
  messageId: number
): Promise<void> {
  const text = `*[KONFIRMASI] PENYEDERHANAAN REKENING*

Tindakan ini akan menyatukan seluruh rekening aktif ke *1 Akun Utama (Dana Suami)* beserta total saldonya secara aman tanpa menghapus riwayat transaksi.

Apakah Anda yakin ingin melanjutkan?`;

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Ya, Sederhanakan Sekarang', callback_data: 'cfg:asimp_ok' },
          { text: 'Batal', callback_data: 'cfg:acc' },
        ],
      ],
    },
  });
}

/**
 * Eksekusi Penyederhanaan Akun Menjadi Dana Suami & Dana Istri
 */
async function executeSimplifyAccounts(
  chatId: number | string,
  messageId: number,
  userName: string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('household_id', householdId);

  const totalKas = (accounts || []).reduce(
    (sum, acc) => sum + Number(acc.balance ?? acc.initial_balance ?? 0),
    0
  );

  let accSuami = (accounts || []).find((a) => a.name === 'Dana Suami' && a.owner === 'suami');
  if (!accSuami) {
    const { data: newSuami } = await supabase
      .from('accounts')
      .insert({
        household_id: householdId,
        name: 'Dana Suami',
        type: 'bank',
        owner: 'suami',
        initial_balance: totalKas,
        balance: totalKas,
        is_active: true,
      })
      .select()
      .single();
    accSuami = newSuami;
  } else {
    await supabase
      .from('accounts')
      .update({ initial_balance: totalKas, balance: totalKas, is_active: true })
      .eq('id', accSuami.id);
  }

  const otherAccounts = (accounts || []).filter((a) => a.id !== accSuami?.id);
  for (const oldAcc of otherAccounts) {
    if (accSuami?.id) {
      await supabase
        .from('transactions')
        .update({ account_id: accSuami.id })
        .eq('account_id', oldAcc.id)
        .eq('household_id', householdId);
    }
    await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', oldAcc.id);
  }

  if (accSuami?.id) await syncAccountBalance(supabase, accSuami.id);

  const successText = `*[BERHASIL] REKENING BERHASIL DISATUKAN*

Rekening tunggal aktif kini siap dipakai:
- *Dana Suami:* \`${formatRupiah(totalKas)}\`

Seluruh transaksi historis telah dialihkan secara aman.
Diselaraskan oleh: *${userName}*`;

  await editTelegramMessageText(chatId, messageId, successText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Rekening', callback_data: 'cfg:acc' }],
        [{ text: 'Menu Utama', callback_data: 'cfg:menu' }],
      ],
    },
  });
}

/**
 * Menampilkan Menu Pilihan 8 Pos Kategori Anggaran
 */
async function handleBudgetSettingsMenu(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: settingData } = await supabase
    .from('settings')
    .select('month_start_day')
    .eq('household_id', householdId)
    .maybeSingle();

  const monthStartDay = settingData?.month_start_day || 1;
  const now = new Date();
  const periodMonthKey = getBudgetPeriodKey(now, monthStartDay);

  const { data: dbBudgets } = await supabase
    .from('category_budgets')
    .select('category_id, limit_amount')
    .eq('household_id', householdId)
    .eq('period_month', periodMonthKey);

  const budgetMap: Record<string, number> = {};
  (dbBudgets || []).forEach((b) => {
    budgetMap[b.category_id] = Number(b.limit_amount || 0);
  });

  const lines = TARGET_BUDGET_CATEGORIES.map((c) => {
    const limit = budgetMap[c.id] || 0;
    return `- *${c.name}:* ${limit > 0 ? `\`${formatRupiah(limit)}\`` : '_Belum diset_'}`;
  });

  const text = `*[ANGGARAN] ATUR PAGU ANGGARAN KELUARGA*

Pagu anggaran aktif bulan ini:
${lines.join('\n')}

_Pilih pos kategori di bawah untuk mengatur batas pagu:_`;

  // Grid tombol 2 kolom untuk 8 kategori
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < TARGET_BUDGET_CATEGORIES.length; i += 2) {
    const row: Array<{ text: string; callback_data: string }> = [];
    const cat1 = TARGET_BUDGET_CATEGORIES[i];
    row.push({ text: cat1.name, callback_data: `cfg:bpos:${cat1.id}` });

    if (i + 1 < TARGET_BUDGET_CATEGORIES.length) {
      const cat2 = TARGET_BUDGET_CATEGORIES[i + 1];
      row.push({ text: cat2.name, callback_data: `cfg:bpos:${cat2.id}` });
    }
    buttons.push(row);
  }

  buttons.push([{ text: '+ Tambah Kata Blokir', callback_data: 'cfg:sadd' }]);
  buttons.push([{ text: 'Kembali', callback_data: 'cfg:menu' }]);

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Pilihan Cepat Nominal Pagu untuk Kategori Tertentu
 */
async function handleCategoryBudgetQuickSelect(
  chatId: number | string,
  messageId: number,
  catId: string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const cat = TARGET_BUDGET_CATEGORIES.find((c) => c.id === catId);
  if (!cat) return;

  const { data: settingData } = await supabase
    .from('settings')
    .select('month_start_day')
    .eq('household_id', householdId)
    .maybeSingle();

  const monthStartDay = settingData?.month_start_day || 1;
  const periodMonthKey = getBudgetPeriodKey(new Date(), monthStartDay);

  const { data: existingBudget } = await supabase
    .from('category_budgets')
    .select('limit_amount')
    .eq('household_id', householdId)
    .eq('category_id', cat.id)
    .eq('period_month', periodMonthKey)
    .maybeSingle();

  const currentLimit = Number(existingBudget?.limit_amount || 0);

  const text = `*[ATUR PAGU] ${cat.name.toUpperCase()}*

Pagu saat ini: \`${formatRupiah(currentLimit)}\`

_Pilih nominal pagu baru cepat di bawah ini atau ketik langsung:_
\`set anggaran ${cat.name.toLowerCase()} 1,5jt\``;

  const buttons = [
    [
      { text: 'Rp 500 Ribu', callback_data: `cfg:bset:${cat.id}:500000` },
      { text: 'Rp 1 Juta', callback_data: `cfg:bset:${cat.id}:1000000` },
    ],
    [
      { text: 'Rp 1.5 Juta', callback_data: `cfg:bset:${cat.id}:1500000` },
      { text: 'Rp 2 Juta', callback_data: `cfg:bset:${cat.id}:2000000` },
    ],
    [
      { text: 'Rp 2.5 Juta', callback_data: `cfg:bset:${cat.id}:2500000` },
      { text: 'Rp 3 Juta', callback_data: `cfg:bset:${cat.id}:3000000` },
    ],
    [
      { text: 'Nominal Bebas', callback_data: `cfg:bcustom:${cat.id}` },
      { text: 'Pos Lain', callback_data: 'cfg:bg' },
    ],
  ];

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Simpan Nilai Pagu Anggaran
 */
async function handleApplyBudgetLimit(
  chatId: number | string,
  messageId: number,
  catId: string,
  amount: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const cat = TARGET_BUDGET_CATEGORIES.find((c) => c.id === catId);
  if (!cat) return;

  const { data: settingData } = await supabase
    .from('settings')
    .select('month_start_day')
    .eq('household_id', householdId)
    .maybeSingle();

  const monthStartDay = settingData?.month_start_day || 1;
  const now = new Date();
  const periodMonthKey = getBudgetPeriodKey(now, monthStartDay);
  const dateRange = getMonthlyRange(0, monthStartDay);

  let { error: upsertErr } = await supabase.from('category_budgets').upsert(
    {
      household_id: householdId,
      category_id: cat.id,
      category_name: cat.name,
      limit_amount: amount,
      period_month: periodMonthKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_id,category_id,period_month' }
  );

  if (upsertErr && (upsertErr.code === '42703' || upsertErr.message?.includes('updated_at'))) {
    const retry = await supabase.from('category_budgets').upsert(
      {
        household_id: householdId,
        category_id: cat.id,
        category_name: cat.name,
        limit_amount: amount,
        period_month: periodMonthKey,
      },
      { onConflict: 'household_id,category_id,period_month' }
    );
    upsertErr = retry.error;
  }

  if (upsertErr) {
    console.error('[SettingsHub Budget Upsert Error]:', upsertErr.message);
  }

  const text = `*[BERHASIL] PAGU ANGGARAN DIPERBARUI*

Pos: *${cat.name}*
Pagu Baru: \`${formatRupiah(amount)}\`
Periode Finansial: *${dateRange.label}*

_Batas anggaran telah diselaraskan dengan kalkulasi sisa dan alert harian._`;

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Pos Lain', callback_data: 'cfg:bg' }],
        [{ text: 'Menu Utama', callback_data: 'cfg:menu' }],
      ],
    },
  });
}

/**
 * Menu Pengaturan Tanggal Siklus Gajian
 */
async function handlePaydaySettingsMenu(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: settingData } = await supabase
    .from('settings')
    .select('month_start_day')
    .eq('household_id', householdId)
    .maybeSingle();

  const currentDay = settingData?.month_start_day || 1;
  const dateRange = getMonthlyRange(0, currentDay);

  const text = `*[SIKLUS GAJIAN] ATUR TANGGAL SIKLUS GAJIAN*

Tanggal gajian aktif saat ini: *Tanggal ${currentDay} setiap bulan*
Rentang Siklus Finansial: *${dateRange.label}*

_Pilih opsi tanggal gajian keluarga di bawah ini, atau ketik:_
\`set gajian <1-28>\``;

  const buttons = [
    [
      { text: currentDay === 1 ? '[Aktif] Tgl 1' : 'Tgl 1 (Awal Bln)', callback_data: 'cfg:pset:1' },
      { text: currentDay === 15 ? '[Aktif] Tgl 15' : 'Tgl 15 (Tengah Bln)', callback_data: 'cfg:pset:15' },
    ],
    [
      { text: currentDay === 25 ? '[Aktif] Tgl 25' : 'Tgl 25 (BUMN/Swasta)', callback_data: 'cfg:pset:25' },
      { text: currentDay === 28 ? '[Aktif] Tgl 28' : 'Tgl 28 (Akhir Bln)', callback_data: 'cfg:pset:28' },
    ],
    [{ text: 'Tanggal Bebas (1-28)', callback_data: 'cfg:pcustom' }],
    [{ text: 'Kembali', callback_data: 'cfg:menu' }],
  ];

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Simpan Tanggal Gajian
 */
async function handleApplyPayday(
  chatId: number | string,
  messageId: number,
  day: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  await supabase
    .from('settings')
    .upsert(
      {
        household_id: householdId,
        month_start_day: day,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' }
    );

  const dateRange = getMonthlyRange(0, day);
  const text = `*[BERHASIL] TANGGAL GAJIAN DIPERBARUI*

Tanggal Gajian Baru: *Tanggal ${day} setiap bulan*
Siklus Finansial Aktif: *${dateRange.label}*

_Kalkulasi sisa waktu, rekap bulanan, dan batas aman harian kini otomatis diselaraskan._`;

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Menu Utama', callback_data: 'cfg:menu' }],
      ],
    },
  });
}

/**
 * Menu Filter Spam & Promo AI
 */
async function handleSpamFilterMenu(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: rules } = await supabase
    .from('learned_promo_rules')
    .select('id, keyword, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(8);

  const ruleLines = (rules || []).map(
    (r, i) => `${i + 1}. \`${r.keyword}\``
  );

  const text = `*[FILTER SPAM] FILTER SPAM & PROMO AI (CLOSED-LOOP)*

Sistem AI secara mandiri mempelajari teks notifikasi marketing dan otomatis memblokirnya agar tidak mencemari kas keluarga.

Kata kunci blokir aktif (${rules?.length || 0} aturan terakhir):
${ruleLines.join('\n') || '_Belum ada aturan yang dipelajari._'}

_Setiap kali Anda menolak mutasi dengan alasan "Promo" atau reply "Itu spam", AI langsung mengingatnya._`;

  const buttons = (rules || []).slice(0, 4).map((r) => [
    {
      text: `Hapus Blokir: ${r.keyword.slice(0, 18)}`,
      callback_data: `cfg:sdel:${r.id.slice(0, 8)}`,
    },
  ]);

  buttons.push([{ text: '+ Tambah Kata Blokir', callback_data: 'cfg:sadd' }]);
  buttons.push([{ text: 'Kembali', callback_data: 'cfg:menu' }]);

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

/**
 * Hapus Aturan Blokir Promo
 */
async function handleDeleteSpamRule(
  chatId: number | string,
  messageId: number,
  shortRuleId: string,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { data: allRules } = await supabase
    .from('learned_promo_rules')
    .select('id, keyword')
    .eq('household_id', householdId);

  const target = (allRules || []).find((r) => r.id === shortRuleId || r.id.startsWith(shortRuleId));
  if (target) {
    await supabase
      .from('learned_promo_rules')
      .delete()
      .eq('id', target.id)
      .eq('household_id', householdId);
  }

  await handleSpamFilterMenu(chatId, messageId, supabase, householdId);
}

/**
 * Menu Pembersihan Sampah Promo / Log yang Diabaikan
 */
async function handleCleanIgnoredMenu(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .eq('status', 'ignored');

  const text = `*[PEMBERSIHAN] BERSIHKAN LOG TRANSAKSI SAMPAH*

Saat ini tersimpan *${count || 0} transaksi diabaikan/promo* di database yang ditolak oleh sistem atau Anda batalkan.

Membersihkan data ini akan mengosongkan riwayat mutasi yang tidak valid tanpa mempengaruhi saldo kas atau pembukuan resmi keluarga.

Lanjutkan pembersihan?`;

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: `Bersihkan (${count || 0} Data)`, callback_data: 'cfg:clean_ok' },
          { text: 'Batal', callback_data: 'cfg:menu' },
        ],
      ],
    },
  });
}

/**
 * Eksekusi Pembersihan Sampah
 */
async function executeCleanIgnored(
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('household_id', householdId)
    .eq('status', 'ignored');

  const text = error
    ? `[ERROR] Gagal membersihkan sampah: ${error.message}`
    : `*[BERHASIL] LOG SAMPAH PROMO BERHASIL DIBERSIHKAN*\n\nSeluruh data transaksi yang diabaikan telah dihapus dari database. Database kini bersih dan optimal.`;

  await editTelegramMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Menu Utama', callback_data: 'cfg:menu' }],
      ],
    },
  });
}

/**
 * MAIN DISPATCHER: Menangani Seluruh Tombol Callback Prefix "cfg:"
 */
export async function handleSettingsHubCallback(
  cq: TelegramCallbackQuery,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const data = cq.data || '';
  if (!data.startsWith('cfg:')) return false;

  const message = cq.message;
  if (!message) {
    await answerCallbackQuery(cq.id);
    return true;
  }

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const userName = cq.from.first_name || 'Keluarga';

  await answerCallbackQuery(cq.id);

  // 1. Menu Utama
  if (data === 'cfg:menu') {
    await editTelegramMessageText(chatId, messageId, formatSettingsHubMenuText(), {
      reply_markup: getSettingsHubInlineKeyboard(),
    });
    return true;
  }

  // 2. Tutup Menu
  if (data === 'cfg:close') {
    await editTelegramMessageText(
      chatId,
      messageId,
      `*[DITUTUP] Menu Pengaturan Ditutup*\nKetik \`/pengaturan\` kapan saja untuk membuka kembali pusat kendali ini.`,
      { reply_markup: { inline_keyboard: [] } }
    );
    return true;
  }

  // 2.5. Laporan Harian Pukul 11:00 WIB (Cuaca Yogyakarta, Libur Pemerintah & Motivasi)
  if (data === 'cfg:report11') {
    const { data: settingData } = await supabase
      .from('settings')
      .select('month_start_day')
      .eq('household_id', householdId)
      .maybeSingle();
    const monthStartDay = settingData?.month_start_day || 1;
    const reportText = await buildDaily11AMReportText(supabase, householdId, monthStartDay);
    await editTelegramMessageText(chatId, messageId, reportText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Kembali', callback_data: 'cfg:menu' }],
        ],
      },
    });
    return true;
  }

  // 3. Modul Rekening & Saldo
  if (data === 'cfg:acc') {
    await handleAccountSettingsMenu(chatId, messageId, supabase, householdId);
    return true;
  }

  if (data.startsWith('cfg:abaledit:')) {
    const shortAccId = data.replace('cfg:abaledit:', '').trim();
    await handleAccountBalanceEditMenu(chatId, messageId, shortAccId, supabase, householdId);
    return true;
  }

  if (data === 'cfg:asimp') {
    await promptSimplifyAccountsConfirmation(chatId, messageId);
    return true;
  }

  if (data === 'cfg:asimp_ok') {
    await executeSimplifyAccounts(chatId, messageId, userName, supabase, householdId);
    return true;
  }

  // 4. Modul Pagu Anggaran
  if (data === 'cfg:bg') {
    await handleBudgetSettingsMenu(chatId, messageId, supabase, householdId);
    return true;
  }

  if (data.startsWith('cfg:bpos:')) {
    const catId = data.replace('cfg:bpos:', '').trim();
    await handleCategoryBudgetQuickSelect(chatId, messageId, catId, supabase, householdId);
    return true;
  }

  if (data.startsWith('cfg:bset:')) {
    const parts = data.replace('cfg:bset:', '').split(':');
    const catId = parts[0];
    const amount = Number(parts[1] || 0);
    await handleApplyBudgetLimit(chatId, messageId, catId, amount, supabase, householdId);
    return true;
  }

  // 5. Modul Siklus Tanggal Gajian
  if (data === 'cfg:pay') {
    await handlePaydaySettingsMenu(chatId, messageId, supabase, householdId);
    return true;
  }

  if (data.startsWith('cfg:pset:')) {
    const day = parseInt(data.replace('cfg:pset:', ''), 10) || 1;
    await handleApplyPayday(chatId, messageId, day, supabase, householdId);
    return true;
  }

  // 6. Modul Filter Spam & Promo AI
  if (data === 'cfg:spam') {
    await handleSpamFilterMenu(chatId, messageId, supabase, householdId);
    return true;
  }

  if (data.startsWith('cfg:sdel:')) {
    const shortRuleId = data.replace('cfg:sdel:', '').trim();
    await handleDeleteSpamRule(chatId, messageId, shortRuleId, supabase, householdId);
    return true;
  }

  // 7. Modul Pembersihan Log Sampah
  if (data === 'cfg:clean') {
    await handleCleanIgnoredMenu(chatId, messageId, supabase, householdId);
    return true;
  }

  if (data === 'cfg:clean_ok') {
    await executeCleanIgnored(chatId, messageId, supabase, householdId);
    return true;
  }

  // 8. Menu Google Spreadsheet & Sync
  if (data === 'cfg:sheet') {
    const [{ data: settingRow }, { data: integ }] = await Promise.all([
      supabase
        .from('settings')
        .select('spreadsheet_url, spreadsheet_owner_email, spreadsheet_auto_sync')
        .eq('household_id', householdId)
        .maybeSingle(),
      supabase
        .from('spreadsheet_integrations')
        .select('webhook_url, spreadsheet_id, last_synced_at, last_error')
        .eq('household_id', householdId)
        .maybeSingle(),
    ]);

    const status = integ?.webhook_url || integ?.spreadsheet_id ? 'Terhubung' : 'Belum terhubung';
    const text = `*[SPREADSHEET] INTEGRASI GOOGLE SPREADSHEET*

Status: *${status}*
Email: ${settingRow?.spreadsheet_owner_email ? `\`${settingRow.spreadsheet_owner_email}\`` : '_Belum diset_'}
Auto-Sync: *${settingRow?.spreadsheet_auto_sync !== false ? 'AKTIF' : 'NONAKTIF'}*
Link Sheet: ${settingRow?.spreadsheet_url || '_Login Google di Website atau tempel URL Apps Script/Sheet_'}
${integ?.last_error ? `\nCatatan Terakhir: _${integ.last_error}_` : ''}`;

    await editTelegramMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Sync Sekarang', callback_data: 'cfg:sheet_sync' },
            { text: 'Set URL/Webhook', callback_data: 'cfg:sheet_set' },
          ],
          [
            { text: 'Toggle Auto-Sync', callback_data: 'cfg:sheet_toggle' },
            { text: 'Kembali', callback_data: 'cfg:menu' },
          ],
        ],
      },
    });
    return true;
  }

  if (data === 'cfg:sheet_sync') {
    const res = await syncTransactionsToSpreadsheet(supabase, householdId);
    const msg = res.success
      ? `*[BERHASIL] SPREADSHEET TERSINKRON*\nJumlah baris dikirim: *${res.syncedCount}*`
      : `*[PERHATIAN] SINKRONISASI GAGAL*\nAlasan: _${res.error || 'Integrasi belum terpasang'}_`;
    await editTelegramMessageText(chatId, messageId, msg, {
      reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'cfg:sheet' }]] },
    });
    return true;
  }

  if (data === 'cfg:sheet_toggle') {
    const { data: curr } = await supabase
      .from('settings')
      .select('spreadsheet_auto_sync')
      .eq('household_id', householdId)
      .maybeSingle();
    const nextVal = curr?.spreadsheet_auto_sync === false;
    await supabase.from('settings').update({ spreadsheet_auto_sync: nextVal }).eq('household_id', householdId);
    await editTelegramMessageText(
      chatId,
      messageId,
      `*[SPREADSHEET] AUTO-SYNC ${nextVal ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}*`,
      { reply_markup: { inline_keyboard: [[{ text: 'Kembali', callback_data: 'cfg:sheet' }]] } }
    );
    return true;
  }

  if (data === 'cfg:sheet_set') {
    await sendTelegramMessage(
      chatId,
      'Balas pesan ini dengan *URL Web App Apps Script* (`https://script.google.com/...`), *Link Google Spreadsheet*, atau *Secret Sync*:\n`#CFG_SHEET`',
      { reply_markup: { force_reply: true, selective: true } }
    );
    return true;
  }

  // 9. Toggle Isi Notifikasi Lengkap di Alert Telegram
  if (data === 'cfg:notif') {
    const { data: curr } = await supabase
      .from('settings')
      .select('show_full_notification_telegram')
      .eq('household_id', householdId)
      .maybeSingle();
    const currentVal = curr?.show_full_notification_telegram !== false;
    await editTelegramMessageText(
      chatId,
      messageId,
      `*[NOTIFIKASI PENUH]*\n\nSaat ini isi teks asli notifikasi bank di alert Telegram: *${currentVal ? 'AKTIF (Ditampilkan)' : 'NONAKTIF'}*.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: currentVal ? 'Matikan Notif Penuh' : 'Aktifkan Notif Penuh', callback_data: 'cfg:notif_toggle' }],
            [{ text: 'Kembali', callback_data: 'cfg:menu' }],
          ],
        },
      }
    );
    return true;
  }

  if (data === 'cfg:notif_toggle') {
    const { data: curr } = await supabase
      .from('settings')
      .select('show_full_notification_telegram')
      .eq('household_id', householdId)
      .maybeSingle();
    const nextVal = curr?.show_full_notification_telegram === false;
    await supabase
      .from('settings')
      .update({ show_full_notification_telegram: nextVal })
      .eq('household_id', householdId);
    await editTelegramMessageText(
      chatId,
      messageId,
      `*[BERHASIL] NOTIFIKASI PENUH ${nextVal ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}*`,
      { reply_markup: { inline_keyboard: [[{ text: 'Menu Utama', callback_data: 'cfg:menu' }]] } }
    );
    return true;
  }

  // 10. Prompt Force Reply untuk Tambah Akun, Budget Bebas, Gajian Bebas, & Filter Spam
  if (data === 'cfg:aadd') {
    await sendTelegramMessage(
      chatId,
      'Balas pesan ini dengan `<Nama Rekening> <Saldo Awal>` (contoh: `SeaBank 1,5jt`):\n`#CFG_AADD`',
      { reply_markup: { force_reply: true, selective: true } }
    );
    return true;
  }

  if (data.startsWith('cfg:bcustom:')) {
    const catId = data.replace('cfg:bcustom:', '').trim();
    const catName = TARGET_BUDGET_CATEGORIES.find((c) => c.id === catId)?.name || catId;
    await sendTelegramMessage(
      chatId,
      `Balas pesan ini dengan nominal pagu baru untuk *${catName}* (contoh: \`750rb\` atau \`1,2jt\`):\n\`#CFG_BSET:${catId}\``,
      { reply_markup: { force_reply: true, selective: true } }
    );
    return true;
  }

  if (data === 'cfg:pcustom') {
    await sendTelegramMessage(
      chatId,
      'Balas pesan ini dengan angka tanggal gajian (1 s.d. 28):\n`#CFG_PSET`',
      { reply_markup: { force_reply: true, selective: true } }
    );
    return true;
  }

  if (data === 'cfg:sadd') {
    await sendTelegramMessage(
      chatId,
      'Balas pesan ini dengan kata/frasa promo yang ingin diblokir otomatis (contoh: `spin & win`):\n`#CFG_SADD`',
      { reply_markup: { force_reply: true, selective: true } }
    );
    return true;
  }

  return true;
}

/**
 * Handler Perintah Tambah / Nonaktifkan Rekening via Chat
 * Contoh: "tambah akun Tabungan BCA suami 5jt" atau "nonaktifkan akun Gopay"
 */
export async function handleAccountTextCommands(
  rawText: string,
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<boolean> {
  const clean = rawText.trim();

  // 1. Tambah Rekening: "tambah akun <nama> [suami/istri] [saldo]" (disimpan ke akun Suami)
  const addMatch = clean.match(/^tambah\s+akun\s+([a-zA-Z0-9\s]+?)(?:\s+(?:suami|istri))?(?:\s+(?:rp|idr)?\.?\s*([0-9.,]+(?:\s*(?:rb|ribu|k|jt|juta))?))?$/i);
  if (addMatch) {
    const accountName = addMatch[1].trim();
    const owner: 'suami' = 'suami';
    const initialAmount = addMatch[2] ? parseNominal(addMatch[2]) : 0;

    const { data: newAcc, error } = await supabase.from('accounts').insert({
      household_id: householdId,
      name: accountName,
      owner,
      type: /dana|gopay|ovo|shopeepay|linkaja/i.test(accountName) ? 'ewallet' : 'bank',
      initial_balance: initialAmount,
      balance: initialAmount,
      is_active: true,
    }).select().single();

    if (error || !newAcc) {
      await sendTelegramMessage(chatId, `[ERROR] Gagal menambah rekening: ${error?.message || 'Terjadi kesalahan'}`, { reply_to_message_id: messageId });
      return true;
    }

    await sendTelegramMessage(
      chatId,
      `*[BERHASIL] REKENING BERHASIL DITAMBAHKAN*\n\nNama: *${accountName}*\nSaldo Awal: \`${formatRupiah(initialAmount)}\`\n\n_Rekening siap digunakan dan otomatis disinkronkan ke rekap kas._`,
      { reply_to_message_id: messageId }
    );
    return true;
  }

  // 2. Nonaktifkan / Hapus Rekening: "nonaktifkan akun <nama>" atau "hapus akun <nama>"
  const delMatch = clean.match(/^(?:nonaktifkan|hapus)\s+akun\s+([a-zA-Z0-9\s]+)$/i);
  if (delMatch) {
    const query = delMatch[1].trim().toLowerCase();
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, owner, balance')
      .eq('household_id', householdId)
      .eq('is_active', true);

    const target = (accounts || []).find((a) =>
      a.name.toLowerCase().includes(query) || query.includes(a.name.toLowerCase())
    );

    if (!target) {
      await sendTelegramMessage(chatId, `[PERHATIAN] Rekening *"${delMatch[1]}"* tidak ditemukan di daftar aktif.`, { reply_to_message_id: messageId });
      return true;
    }

    await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', target.id)
      .eq('household_id', householdId);

    await sendTelegramMessage(
      chatId,
      `*[DINONAKTIFKAN] REKENING DINONAKTIFKAN*\n\nAkun *${target.name}* kini telah dinonaktifkan.\nRiwayat transaksi masa lalu tetap tersimpan utuh di sistem.`,
      { reply_to_message_id: messageId }
    );
    return true;
  }

  return false;
}

