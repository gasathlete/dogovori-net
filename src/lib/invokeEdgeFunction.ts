/**
 * Thin wrapper around `supabase.functions.invoke` that unwraps
 * `FunctionsHttpError` and returns the response body under `data`, so
 * callers see the same shape whether the function replied 200 or 4xx/5xx.
 *
 * Without this, invoking an edge function that returns e.g. a 429
 * with `{ error: "…" , code: "rate_limited" }` bubbles up the generic
 * `"Edge Function returned a non-2xx status code"` error and the useful
 * message never reaches the UI.
 */
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";

export interface InvokeResult<T = unknown> {
  data: T | null;
  error: { message: string; status?: number; correlationId?: string } | null;
  /** Correlation ID, изпратен със заявката — за проследяване в логовете. */
  correlationId: string;
}

/** Създава correlation ID за една заявка към edge function. */
function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Пауза между опитите (експоненциална). */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Съобщения за мрежов срив, при които опитът се повтаря.
 * Safari връща само „Load failed", Chrome — „Failed to fetch",
 * supabase-js — „Failed to send a request to the Edge Function".
 */
const TRANSIENT_RE =
  /failed to send|failed to fetch|load failed|networkerror|network error|network|relay|timeout|timed out|aborted|abort|connection|econnreset|socket|502|503|504/i;

/** Преходни HTTP статуси — има смисъл от повторен опит. */
const TRANSIENT_STATUS = new Set([408, 425, 500, 502, 503, 504]);

export function isTransientEdgeError(err: InvokeResult<unknown>["error"], data: unknown): boolean {
  if (!err) return false;
  if (err.status !== undefined) return TRANSIENT_STATUS.has(err.status) && data === null;
  return TRANSIENT_RE.test(err.message ?? "");
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string>; retries?: number } = {},
): Promise<InvokeResult<T>> {
  const maxRetries = options.retries ?? 2;
  let last: InvokeResult<T> | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    last = await invokeOnce<T>(name, options);
    // Retry само при мрежов/relay срив — не при валиден 4xx отговор с тяло.
    if (!isTransientEdgeError(last.error, last.data)) return last;
    if (attempt < maxRetries) {
      console.warn(`edge function ${name}: мрежов срив, повторен опит ${attempt + 1}/${maxRetries}`);
      // Експоненциален backoff с малък jitter.
      await delay(800 * 2 ** attempt + Math.round(Math.random() * 300));
    }
  }
  return (
    last ?? {
      data: null,
      error: { message: "Няма връзка със сървъра.", correlationId: "" },
      correlationId: "",
    }
  );
}


async function invokeOnce<T = unknown>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<InvokeResult<T>> {

  const correlationId = options.headers?.["x-correlation-id"] || newCorrelationId();
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, {
      ...options,
      headers: { ...(options.headers ?? {}), "x-correlation-id": correlationId },
    });
    if (error) {
      // Try to enrich with response body if available (FunctionsHttpError case).
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          const bodyCid = (body as { correlation_id?: string })?.correlation_id;
          const cid = error.context.headers?.get?.("x-correlation-id") || bodyCid || correlationId;
          console.error(`edge function ${name} failed [cid=${cid}]`, error.context.status);
          return {
            data: (body as T) ?? null,
            error: { message: (body as { error?: string })?.error || error.message, status: error.context.status, correlationId: cid },
            correlationId: cid,
          };
        } catch {
          return { data: null, error: { message: error.message, status: error.context.status, correlationId }, correlationId };
        }
      }
      if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
        return { data: null, error: { message: error.message, correlationId }, correlationId };
      }
      return { data: null, error: { message: (error as Error).message ?? String(error), correlationId }, correlationId };
    }
    return { data: (data as T) ?? null, error: null, correlationId };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e), correlationId }, correlationId };
  }
}
