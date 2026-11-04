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
  // 1. Ambil resolusi gambar tertinggi (elemen terakhir pada array photo)
  const targetPhoto = photoList[photoList.length - 1];
  if (!targetPhoto) return;

  // 2. Unduh gambar dari server Telegram
  const fileData = await downloadTelegramFileAsBase64(targetPhoto.file_id);
  if (!fileData) {
    await sendTelegramMessage(
      chatId,
      '⚠️ *Gagal Mengunduh Gambar*\nTidak dapat mengambil foto dari server Telegram. Silakan coba kirim ulang.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 3. Proses gambar dengan Google Gemini Vision
  const vision = await analyzeReceiptWithVision(
    Buffer.from(fileData.base64, 'base64'),
    fileData.mimeType
  );

  // 4. Validasi Ketat: Tolak foto buram, gelap, gagal, atau bukan transaksi finansial
  if (!vision.isValidReceipt || vision.totalAmount <= 0) {
    await sendTelegramMessage(
      chatId,
      '⚠️ *Foto Tidak Terbaca atau Bukan Struk Transaksi*\n\nSistem hanya memproses bukti transaksi atau struk belanja yang jelas, tegak lurus, dan berstatus *Berhasil*.\n\nSilakan kirimkan foto ulang yang lebih terang dan fokus.',
      { reply_to_message_id: messageId }
    );
    return;
  }

  // 5. Cari atau Petakan Akun Bank / E-Wallet
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('household_id', householdId)
    .eq('is_active', true);

  let accountId: string | null = null;
  let accountName = vision.accountName;

  if (accounts && accounts.length > 0) {
    const matched = accounts.find((a) =>
      a.name.toLowerCase().includes(vision.accountName.toLowerCase()) ||
      vision.accountName.toLowerCase().includes(a.name.toLowerCase())
    );
    if (matched) {
      accountId = matched.id;
      accountName = matched.name;
    } else {
      accountId = accounts[0].id;
      accountName = accounts[0].name;
    }
  }

  // 6. Rekomendasi Kategori Otomatis berdasarkan Merchant
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('household_id', householdId);

  const suggestedCategoryId = categories
    ? suggestCategoryForMerchant(vision.merchant, categories)
    : null;

  const matchedCat = (categories || []).find((c) => c.id === suggestedCategoryId);
  const categoryName = matchedCat?.name || 'Lainnya';

  // 7. Cegah Transaksi Dobel dengan Dedupe Hash
  const dedupeHash = await generateScreenshotDedupeHash(
    'telegram_photo',
    accountName,
    vision.referenceNumber,
    vision.totalAmount,
    vision.transactionDate
  );

  // 8. Simpan Transaksi ke Database
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
      source_device: 'telegram',
      transaction_date: vision.transactionDate,
      status: 'pending',
      dedupe_hash: dedupeHash,
      needs_review: (vision.confidenceScore ?? 1) < 0.7,
    })
    .select('id')
    .single();

  // Tangani jika bukti foto sudah pernah dicatat sebelumnya
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

  // 9. Kirim Notifikasi Sukses dengan Tombol Konfirmasi
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
