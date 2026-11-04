// ==============================================================================
// TELEGRAM BOT CLIENT: src/lib/telegram/bot.ts
// Native Fetch Client untuk Komunikasi dengan Telegram Bot API
// ==============================================================================

export interface TelegramSendMessageOptions {
  parse_mode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
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

