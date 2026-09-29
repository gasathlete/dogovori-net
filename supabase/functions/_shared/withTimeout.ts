/**
 * Shared edge-function helpers: AbortController-based timeout + unified error
 * envelope so the frontend `useApiError` hook can map every backend error to a
 * single Bulgarian toast.
 *
 * Usage:
 *
 *   import { withTimeout, errorResponse, jsonResponse } from "../_shared/withTimeout.ts";
 *
 *   try {
 *     const data = await withTimeout(
 *       (signal) => fetch(url, { signal }).then((r) => r.json()),
 *       25_000,
 *     );
 *     return jsonResponse(data, 200);
 *   } catch (e) {
 *     return errorResponse(e, corsHeaders);
 *   }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export class TimeoutError extends Error {
  readonly code = "timeout";
  readonly status = 504;
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    /** Optional retry hint in seconds. */
    retry_after?: number;
  };
}

/**
 * Run `fn(signal)` and abort it after `ms` milliseconds.
 * The inner function should pass `signal` to fetch/SDK calls.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number = 25_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...Object.fromEntries(new Headers(extraHeaders).entries()) },
  });
}

/**
 * Map any thrown value to the unified `{ error: { code, message } }` envelope.
 * The frontend `useApiError` hook reads this shape directly.
 */
export function errorResponse(
  err: unknown,
  _cors: HeadersInit = corsHeaders,
  fallbackStatus = 500,
): Response {
  if (err instanceof TimeoutError) {
    return jsonResponse(
      { error: { code: "timeout", message: "Заявката отне твърде дълго. Опитайте отново." } } satisfies ErrorEnvelope,
      err.status,
    );
  }

  const anyErr = err as any;
  const status = typeof anyErr?.status === "number" ? anyErr.status : fallbackStatus;
  const code = typeof anyErr?.code === "string" ? anyErr.code : `http_${status}`;
  const message =
    typeof anyErr?.message === "string" && anyErr.message.length < 300
      ? anyErr.message
      : "Възникна грешка. Опитайте отново.";

  const envelope: ErrorEnvelope = { error: { code, message } };
  if (typeof anyErr?.retry_after === "number") envelope.error.retry_after = anyErr.retry_after;

  return jsonResponse(envelope, status >= 400 && status < 600 ? status : fallbackStatus);
}
