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
  error: { message: string; status?: number } | null;
}

export async function invokeEdgeFunction<T = unknown>(
  name: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<InvokeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, options);
    if (error) {
      // Try to enrich with response body if available (FunctionsHttpError case).
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          return { data: (body as T) ?? null, error: { message: (body as { error?: string })?.error || error.message, status: error.context.status } };
        } catch {
          return { data: null, error: { message: error.message, status: error.context.status } };
        }
      }
      if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
        return { data: null, error: { message: error.message } };
      }
      return { data: null, error: { message: (error as Error).message ?? String(error) } };
    }
    return { data: (data as T) ?? null, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}
