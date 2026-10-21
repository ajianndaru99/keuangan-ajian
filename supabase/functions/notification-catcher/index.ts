import { createClient } from 'npm:@supabase/supabase-js@2.48.1';
import { matchesAny, SENSITIVE_PATTERNS } from '../_shared/parsers/rules.ts';
import { normalizeText, parseReceivedAt } from '../_shared/parsers/fields.ts';
import { analyzeNotificationWithGemini } from '../_shared/parsers/gemini-text.ts';
import { processNotification } from '../_shared/parsers/classify.ts';

interface ClientInfo {
  device_id: string;
  household_id?: string;
  role?: string;
}

const API_KEYS: Record<string, ClientInfo> = JSON.parse(Deno.env.get('API_KEYS_JSON') || '{}');
const MAX_BYTES = 102400; // 100KB limit

/** Membaca body request stream dengan batas ukuran maksimal. */
async function readBodyText(req: Request): Promise<string | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      receivedBytes += value.length;
      if (receivedBytes > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/** Menghitung SHA-256 dedupe_hash untuk transaksi agar idempotent. */
async function computeDedupeHash(seed: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(seed));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = req.headers.get('x-api-key') || '';
  if (!apiKey || typeof apiKey !== 'string') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const isDev = Deno.env.get('ENVIRONMENT') === 'development';
  if (!isDev) {
    if (apiKey.startsWith('mock_dev_key') || apiKey.startsWith('test_random')) {
      return new Response(JSON.stringify({ error: 'Dev key not allowed in production' }), { status: 403 });
    }
    if (apiKey.length < 32) {
      return new Response(JSON.stringify({ error: 'API key too short' }), { status: 403 });
    }
  }

  if (!Object.hasOwn(API_KEYS, apiKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const clientInfo = API_KEYS[apiKey];
  const contentType = req.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const isForm = contentType.includes('application/x-www-form-urlencoded');

  if (!isJson && !isForm) {
    return new Response(
      JSON.stringify({ error: 'Unsupported Media Type. Gunakan application/json atau application/x-www-form-urlencoded' }),
      { status: 415 },
    );
  }

  try {
    const textBody = await readBodyText(req);
    if (textBody === null) {
      return new Response(JSON.stringify({ error: 'Payload too large atau kosong' }), { status: 413 });
    }

    let app_name = '';
    let title = '';
    let content = '';
    let received_at_raw = '';

    if (isJson) {
      try {
        const jsonBody = JSON.parse(textBody) as Record<string, unknown>;
        app_name = String(jsonBody.app_name || jsonBody.packageName || '').trim();
        title = String(jsonBody.title || '').trim();
        content = String(jsonBody.content || jsonBody.text || '').trim();
        received_at_raw = jsonBody.received_at !== undefined ? String(jsonBody.received_at) : '';
      } catch {
        return new Response(JSON.stringify({ error: 'Format JSON tidak valid' }), { status: 400 });
      }
    } else {
      const parsedBody = new URLSearchParams(textBody);
      app_name = parsedBody.get('app_name') || '';
      title = parsedBody.get('title') || '';
      content = parsedBody.get('content') || parsedBody.get('text') || '';
      received_at_raw = parsedBody.get('received_at') || '';
    }

    if (!app_name || (!title && !content)) {
      return new Response(JSON.stringify({ error: 'Payload tidak lengkap' }), { status: 400 });
    }

    const normalizedCombined = normalizeText(`${title} ${content}`).toLowerCase();
    const isSensitive = matchesAny(normalizedCombined, SENSITIVE_PATTERNS);
    if (isSensitive) {
      title = '[REDACTED]';
      content = '[REDACTED]';
    }

    const contentPoints = Array.from(content);
    if (contentPoints.length > 2000) {
      content = contentPoints.slice(0, 1997).join('') + '...';
    }

    const receivedAtParsed = parseReceivedAt(received_at_raw);
    const received_at_epoch = receivedAtParsed.iso ? new Date(receivedAtParsed.iso).getTime() : null;

    // Orkestrasi: Regex lokal -> Gemini AI jika diperlukan -> Klasifikasi
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY');
    const aiCaller = geminiApiKey
      ? (app: string, t: string, c: string) => analyzeNotificationWithGemini(app, t, c, geminiApiKey)
      : undefined;

    const { classification } = await processNotification({
      appName: app_name,
      title,
      content,
      receivedAtRaw: received_at_raw,
      receivedAtIso: receivedAtParsed.iso,
      isSensitive,
      aiCaller,
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    const householdId = clientInfo.household_id || Deno.env.get('DEFAULT_HOUSEHOLD_ID');
    if (!householdId) {
      return new Response(JSON.stringify({ error: 'Household ID tidak dikonfigurasi pada API Key' }), { status: 400 });
    }

    const { error: insertError } = await supabase
      .from('raw_notifications')
      .insert({
        device_id: clientInfo.device_id,
        household_id: householdId,
        source: 'notification',
        app_name,
        title,
        content,
        received_at_raw,
        received_at: received_at_epoch,
        server_received_at: new Date().toISOString(),
        outcome: classification.outcome,
        reasons: classification.reasons,
        parser_version: classification.parserVersion,
        sensitive: isSensitive,
        ai_label: classification.aiLabel,
        ai_confidence: classification.aiConfidence,
        ai_reason: classification.aiReason,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return new Response(JSON.stringify({ status: 'duplicate', message: 'Notifikasi redundan (idempotent)' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.error('Database insert error:', insertError.message);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    if (classification.outcome !== 'ignored') {
      const rawRole = (clientInfo.role || clientInfo.device_id || 'suami').toLowerCase();
      const sourceDevice: 'suami' | 'istri' = rawRole.includes('istri') ? 'istri' : 'suami';
      const targetBank = classification.bank || classification.accountName || app_name;

      const { data: matchedAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('household_id', householdId)
        .eq('owner', sourceDevice)
        .ilike('name', `%${targetBank}%`)
        .limit(1)
        .maybeSingle();

      let accountId = matchedAcc?.id || null;
      if (!accountId) {
        const { data: fallbackAcc } = await supabase
          .from('accounts')
          .select('id')
          .eq('household_id', householdId)
          .eq('owner', sourceDevice)
          .limit(1)
          .maybeSingle();
        accountId = fallbackAcc?.id || null;
      }

      if (!accountId) {
        const { data: anyAcc } = await supabase
          .from('accounts')
          .select('id')
          .eq('household_id', householdId)
          .limit(1)
          .maybeSingle();
        accountId = anyAcc?.id || null;
      }

      if (accountId) {
        const txAmount = classification.amount || 0;
        const txDirection = classification.direction === 'in' ? 'in' : 'out';
        const txMerchant = classification.merchant || classification.bank || app_name;
        const txDate = classification.transactionDate || (receivedAtParsed.iso ? receivedAtParsed.iso : new Date().toISOString());

        const rawSeed = `notif:${clientInfo.device_id}:${app_name}:${received_at_raw || Date.now()}:${txAmount}:${classification.reference || ''}`;
        const dedupeHash = await computeDedupeHash(rawSeed);

        const { error: txError } = await supabase
          .from('transactions')
          .upsert({
            household_id: householdId,
            account_id: accountId,
            amount: txAmount,
            direction: txDirection,
            merchant: txMerchant,
            raw_notification: `[Notifikasi ${classification.bank || app_name}] ${title}: ${content}`,
            source_device: sourceDevice,
            transaction_date: txDate,
            status: 'pending',
            dedupe_hash: dedupeHash,
            needs_review: classification.outcome === 'needs_review' || txAmount === 0,
            parse_method: classification.parseMethod,
          }, { onConflict: 'dedupe_hash', ignoreDuplicates: true });

        if (txError) {
          console.error('Database transaction insert error:', txError.message);
        }
      }
    }

    return new Response(JSON.stringify({ status: 'success', message: 'Notifikasi dicatat.' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error('Processing error:', errMessage);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
