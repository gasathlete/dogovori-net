// Shared rate-limiter за edge функции.
// Използва Postgres таблицата `public.rate_limit_buckets` за споделено състояние
// между всички инстанции на функцията.
//
// Употреба:
//   import { checkRateLimit } from "../_shared/rate-limit.ts";
//   const rl = await checkRateLimit(`fn:${userId}`, 10, 60); // 10 заявки / 60 сек
//   if (!rl.ok) return new Response("...", { status: 429 });

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (_admin) return _admin;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retry_after_s: number;
}

/**
 * Token-bucket rate-limit. `key` идентифицира bucket-а (напр. user_id+route).
 * `max` = максимум заявки в `window_s` секунди.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  window_s: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin().rpc("rate_limit_check", {
      _key: key, _max: max, _window_s: window_s,
    });
    if (error) {
      // Fail-open за да не блокираме потребителя при проблем с DB.
      return { ok: true, remaining: max, retry_after_s: 0 };
    }
    const row = (data as { ok: boolean; remaining: number; retry_after_s: number } | null) ?? null;
    return row ?? { ok: true, remaining: max, retry_after_s: 0 };
  } catch {
    return { ok: true, remaining: max, retry_after_s: 0 };
  }
}

export interface StrictRateLimitResult {
  /** true само при ДОКАЗАНО свободен слот. */
  ok: boolean;
  remaining: number;
  retry_after_s: number;
  /** Инфраструктурен отказ: НЕ е „изчерпан лимит" и не е разрешение. */
  unavailable?: boolean;
}

/**
 * FAIL-CLOSED вариант. Ползва се там, където лимитът е гаранция за
 * еднократност (напр. консумация на nonce), а не удобство: при проблем с
 * базата НЕ се разрешава действие.
 */
export async function checkRateLimitStrict(
  key: string,
  max: number,
  window_s: number,
): Promise<StrictRateLimitResult> {
  try {
    const { data, error } = await admin().rpc("rate_limit_check", {
      _key: key, _max: max, _window_s: window_s,
    });
    if (error) return { ok: false, remaining: 0, retry_after_s: 5, unavailable: true };
    const row = (data as { ok: boolean; remaining: number; retry_after_s: number } | null) ?? null;
    if (!row) return { ok: false, remaining: 0, retry_after_s: 5, unavailable: true };
    return { ok: row.ok === true, remaining: row.remaining ?? 0, retry_after_s: row.retry_after_s ?? 0 };
  } catch {
    return { ok: false, remaining: 0, retry_after_s: 5, unavailable: true };
  }
}

