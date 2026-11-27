import { useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { reportError } from "@/lib/errorReporter";

/**
 * Unified API/edge-function error handler.
 *
 * Maps technical errors (Supabase PostgrestError, edge function envelopes,
 * fetch failures, AbortError) to a single Bulgarian user-facing message and
 * reports the original error for diagnostics — without leaking PII.
 *
 * Usage:
 *   const handle = useApiError();
 *   try { await mutate(); } catch (e) { handle(e, { scope: "save_document" }); }
 */
export type ApiErrorScope =
  | "auth"
  | "ai_generate"
  | "ai_analyze"
  | "ai_assistant"
  | "checkout"
  | "save_document"
  | "upload"
  | "download"
  | "signing"
  | "generic";

export interface ApiErrorContext {
  scope?: ApiErrorScope;
  /** Optional override for the toast title. */
  title?: string;
  /** Suppress the toast — only log. */
  silent?: boolean;
}

interface ParsedError {
  code: string;
  message: string;
  retryAfterSec?: number;
}

function parseError(err: unknown): ParsedError {
  // AbortError
  if (err instanceof DOMException && err.name === "AbortError") {
    return { code: "aborted", message: "Заявката беше отказана." };
  }

  // Network/offline
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return {
      code: "network",
      message: "Няма връзка с интернет. Проверете мрежата и опитайте отново.",
    };
  }

  const anyErr = err as any;

  // Supabase edge function envelope: { error: { code, message, retry_after } }
  if (anyErr?.error && typeof anyErr.error === "object") {
    const inner = anyErr.error;
    return {
      code: String(inner.code ?? "unknown"),
      message: String(inner.message ?? "Възникна грешка. Опитайте отново."),
      retryAfterSec: typeof inner.retry_after === "number" ? inner.retry_after : undefined,
    };
  }

  // Supabase PostgrestError
  if (anyErr?.code && anyErr?.message) {
    if (anyErr.code === "PGRST301" || anyErr.code === "42501") {
      return { code: anyErr.code, message: "Нямате достъп до тази операция." };
    }
    if (anyErr.code === "23505") {
      return { code: anyErr.code, message: "Този запис вече съществува." };
    }
    if (anyErr.code === "23503") {
      return { code: anyErr.code, message: "Свързан запис липсва или е изтрит." };
    }
  }

  // HTTP 429
  if (anyErr?.status === 429) {
    const retry = Number(anyErr?.headers?.get?.("retry-after")) || undefined;
    return {
      code: "rate_limited",
      message: "Твърде много заявки. Опитайте отново след малко.",
      retryAfterSec: retry,
    };
  }

  // HTTP 5xx
  if (typeof anyErr?.status === "number" && anyErr.status >= 500) {
    return { code: `http_${anyErr.status}`, message: "Сървърна грешка. Опитваме отново скоро." };
  }

  const msg = typeof err === "string" ? err : anyErr?.message;
  return {
    code: "unknown",
    message: msg && typeof msg === "string" ? msg : "Възникна грешка. Опитайте отново.",
  };
}

const SCOPE_TITLES: Record<ApiErrorScope, string> = {
  auth: "Грешка при вход",
  ai_generate: "Грешка при генериране",
  ai_analyze: "Грешка при анализ",
  ai_assistant: "Грешка в AI асистента",
  checkout: "Грешка при плащане",
  save_document: "Грешка при запазване",
  upload: "Грешка при качване",
  download: "Грешка при сваляне",
  signing: "Грешка при подпис",
  generic: "Грешка",
};

export function useApiError() {
  return useCallback((err: unknown, ctx: ApiErrorContext = {}) => {
    const parsed = parseError(err);
    const scope = ctx.scope ?? "generic";

    // Fire-and-forget telemetry (no PII).
    void reportError({
      scope,
      code: parsed.code,
      message: parsed.message,
      retryAfterSec: parsed.retryAfterSec,
    });

    if (ctx.silent) return parsed;

    const desc = parsed.retryAfterSec
      ? `${parsed.message} (опитайте след ~${parsed.retryAfterSec}s)`
      : parsed.message;

    toast({
      title: ctx.title ?? SCOPE_TITLES[scope],
      description: desc,
      variant: "destructive",
    });

    return parsed;
  }, []);
}
