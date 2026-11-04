// ==============================================================================
// TELEGRAM PHOTO HANDLER: src/lib/telegram/photo-handler.ts
// Menangani Pemindaian Foto Struk / Bukti Transfer via Multimodal Vision AI
// ==============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  downloadTelegramFileAsBase64,
  sendTelegramMessage,
} from './bot.ts';
import { formatReceiptScanSuccessMessage } from './formatters.ts';
import {
  analyzeReceiptWithVision,
  generateScreenshotDedupeHash,
  suggestCategoryForMerchant,
} from '../vision/gemini.ts';

export interface TelegramPhotoItem {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

/**
 * Memproses foto yang dikirimkan ke bot Telegram
 */
export async function handleTelegramPhotoMessage(
  photoList: TelegramPhotoItem[],
  chatId: number | string,
  messageId: number,
  supabase: SupabaseClient,
  householdId: string
): Promise<void> {
  // 1. Validasi Ketersediaan API Key di Lingkungan Produksi
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey && process.env.NODE_ENV === 'production') {
    await sendTelegramMessage(
      chatId,
      '⚠️ *Fitur Vision AI Belum Dikonfigurasi*\nKunci API Google Gemini (`GEMINI_API_KEY`) belum terpasang di server dasbor. Silakan hubungi admin.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 2. Ambil resolusi gambar tertinggi (elemen terakhir pada array photo)
  const targetPhoto = photoList[photoList.length - 1];
  if (!targetPhoto) return;

  // 3. Unduh gambar dari server Telegram
  const fileData = await downloadTelegramFileAsBase64(targetPhoto.file_id);
  if (!fileData) {
    await sendTelegramMessage(
      chatId,
      '⚠️ *Gagal Mengunduh Gambar*\nTidak dapat mengambil foto dari server Telegram. Silakan coba kirim ulang foto yang jelas.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 4. Proses gambar dengan Google Gemini Vision
  const vision = await analyzeReceiptWithVision(
    Buffer.from(fileData.base64, 'base64'),
    fileData.mimeType
  );

  // 5. Validasi Ketat: Tolak foto buram, gelap, gagal, atau bukan transaksi finansial
  if (!vision.isValidReceipt || vision.totalAmount <= 0) {
    await sendTelegramMessage(
      chatId,
      '⚠️ *Foto Tidak Terbaca atau Bukan Struk Transaksi*\n\nSistem hanya mencatat bukti transfer atau struk belanja yang jelas, tegak lurus, dan berstatus *Berhasil*.\n\nSilakan kirimkan foto ulang yang lebih terang dan fokus.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 6. Cari atau Petakan Akun Bank / E-Wallet
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name, owner')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (accErr) {
    console.error('[Telegram Photo Account Fetch Error]:', accErr.message);
  }

  let accountId: string | null = null;
  let accountName = vision.accountName;
  let accountOwner: 'suami' | 'istri' = 'suami';

  if (accounts && accounts.length > 0) {
    const matched = accounts.find((a) =>
      a.name.toLowerCase().includes(vision.accountName.toLowerCase()) ||
      vision.accountName.toLowerCase().includes(a.name.toLowerCase())
    );
    if (matched) {
      accountId = matched.id;
      accountName = matched.name;
      accountOwner = matched.owner === 'istri' ? 'istri' : 'suami';
    } else {
      // Prioritaskan akun Dana Suami atau akun aktif pertama
      const defaultAcc = accounts.find((a) => a.owner === 'suami') || accounts[0];
      accountId = defaultAcc.id;
      accountName = defaultAcc.name;
      accountOwner = defaultAcc.owner === 'istri' ? 'istri' : 'suami';
    }
  }

  // 7. Rekomendasi Kategori Otomatis berdasarkan Merchant
  const { data: categories, error: catErr } = await supabase
    .from('categories')
    .select('id, name')
    .eq('household_id', householdId);

  if (catErr) {
    console.error('[Telegram Photo Category Fetch Error]:', catErr.message);
  }

  const suggestedCategoryId = categories
    ? suggestCategoryForMerchant(vision.merchant, categories)
    : null;

  const matchedCat = (categories || []).find((c) => c.id === suggestedCategoryId);
  const categoryName = matchedCat?.name || 'Lainnya';

  // 8. Cegah Transaksi Dobel dengan Dedupe Hash
  const dedupeHash = await generateScreenshotDedupeHash(
    accountOwner,
    accountName,
    vision.referenceNumber,
    vision.totalAmount,
    vision.transactionDate
  );

  // 9. Simpan Transaksi ke Database (gunakan source_device yang valid untuk constraint)
  const { data: newTx, error: txError } = await supabase
    .from('transactions')
    .insert({
      household_id: householdId,
      account_id: accountId,
      category_id: suggestedCategoryId,
      amount: vision.totalAmount,
      direction: vision.direction,
      merchant: vision.merchant,
      raw_notification: `[Foto Telegram] ${vision.rawSummary} (Ref: ${vision.referenceNumber || '-'})`,
      source_device: accountOwner,
      transaction_date: vision.transactionDate,
      status: 'pending',
      dedupe_hash: dedupeHash,
      needs_review: (vision.confidenceScore ?? 1) < 0.7,
    })
    .select('id')
    .single();

  // Tangani jika bukti foto sudah pernah dicatat sebelumnya (Unique Violation 23505)
  if (txError) {
    if ((txError as { code?: string }).code === '23505') {
      await sendTelegramMessage(
        chatId,
        'ℹ️ *Struk Sudah Pernah Dicatat*\n\nBukti transaksi ini sebelumnya telah tersimpan di dasbor keluarga dan tidak dicatat dobel.',
        { reply_to_message_id: messageId }
      );
      return;
    }
    console.error('[Telegram Photo Insert Error]:', txError);
    await sendTelegramMessage(
      chatId,
      '⚠️ *Gagal Menyimpan Data Struk*\nTerjadi kesalahan saat menyimpan catatan ke database.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 10. Kirim Notifikasi Sukses dengan Tombol Konfirmasi
  const messageText = formatReceiptScanSuccessMessage({
    merchant: vision.merchant,
    amount: vision.totalAmount,
    categoryName,
    accountName,
  });

  await sendTelegramMessage(chatId, messageText, {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Benar & Sesuai', callback_data: `tx_ok:${newTx.id}` },
          { text: '❌ Salah / Bukan Belanja', callback_data: `tx_wrong_menu:${newTx.id}` },
        ],
      ],
    },
  });
}
