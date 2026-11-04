// ==============================================================================
// TELEGRAM BOT CLIENT: src/lib/telegram/bot.ts
// Native Fetch Client untuk Komunikasi dengan Telegram Bot API
// ==============================================================================

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineKeyboardButton[][];
  force_reply?: boolean;
}

export interface TelegramSendMessageOptions {
  parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
  reply_markup?: TelegramReplyMarkup;
}

export interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Memeriksa apakah token bot Telegram telah disetel di environment
 */
export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim().length > 0);
}

/**
 * Mendapatkan daftar ID chat yang diizinkan (whitelist) dari environment
 */
export function getAllowedChatIds(): string[] {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS || '';
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Memvalidasi apakah chatId termasuk dalam daftar yang diizinkan
 */
export function isChatIdAllowed(chatId: string | number): boolean {
  const allowed = getAllowedChatIds();
  // Jika whitelist kosong, tolak secara fail-closed demi keamanan finansial keluarga
  if (allowed.length === 0) return false;
  return allowed.includes(String(chatId));
}

/**
 * Mengirim pesan ke Telegram menggunakan fetch native (tanpa dependensi eksternal)
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: TelegramSendMessageOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN belum disetel.' };
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: options.parse_mode || 'Markdown',
    disable_web_page_preview: options.disable_web_page_preview ?? true,
    ...(options.reply_to_message_id ? { reply_to_message_id: options.reply_to_message_id } : {}),
    ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: TelegramApiResponse = await response.json().catch(() => ({ ok: false, description: 'Respon JSON invalid' }));

    if (!response.ok || !data.ok) {
      const errMsg = `[Telegram API Error ${response.status}] ${data.description || 'Gagal mengirim pesan'}`;
      console.warn(errMsg);
      return { success: false, error: errMsg };
    }

    return { success: true };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Telegram Network Error]:', errMsg);
    return { success: false, error: errMsg };
  }
}

/**
 * Mengirim pesan ke SELURUH chat ID keluarga yang terdaftar di whitelist
 */
export async function broadcastToAllowedChats(
  text: string,
  options: TelegramSendMessageOptions = {}
): Promise<{ sentCount: number; errors: string[] }> {
  const chatIds = getAllowedChatIds();
  let sentCount = 0;
  const errors: string[] = [];

  for (const chatId of chatIds) {
    const res = await sendTelegramMessage(chatId, text, options);
    if (res.success) {
      sentCount++;
    } else if (res.error) {
      errors.push(`Chat ${chatId}: ${res.error}`);
    }
  }

  return { sentCount, errors };
}

/**
 * Mengubah isi pesan teks yang sudah terkirim (misal setelah tombol inline diklik)
 */
export async function editTelegramMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  options: TelegramSendMessageOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN belum disetel.' };

  const endpoint = `https://api.telegram.org/bot${token}/editMessageText`;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: options.parse_mode || 'Markdown',
    disable_web_page_preview: options.disable_web_page_preview ?? true,
    ...(options.reply_markup ? { reply_markup: options.reply_markup } : {}),
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: TelegramApiResponse = await response.json().catch(() => ({ ok: false }));
    if (!response.ok || !data.ok) {
      return { success: false, error: data.description || 'Gagal mengubah pesan' };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Merespons interaksi callback query dari tombol inline (menghilangkan status loading tombol di Telegram)
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, error: 'TELEGRAM_BOT_TOKEN belum disetel.' };

  const endpoint = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const payload = {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: TelegramApiResponse = await response.json().catch(() => ({ ok: false }));
    return { success: Boolean(data.ok) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Mendapatkan URL unduh file gambar dari Telegram API
 */
export async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
    }
  } catch (err) {
    console.warn('[Telegram getFile error]:', err);
  }
  return null;
}

/**
 * Mengunduh file dari Telegram sebagai Base64 string untuk diproses oleh Vision AI
 */
export async function downloadTelegramFileAsBase64(fileId: string): Promise<{ base64: string; mimeType: string } | null> {
  const fileUrl = await getTelegramFileUrl(fileId);
  if (!fileUrl) return null;

  try {
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return { base64, mimeType };
  } catch (err) {
    console.warn('[Telegram downloadFile error]:', err);
    return null;
  }
}

