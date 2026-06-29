/**
 * Lightweight error reporter.
 *
 * Logs client errors to the `audit_log` table without PII (no message bodies,
 * no user input — only scope, error code, route and the authenticated user_id
 * if present). Batched + debounced to avoid hammering the API on error storms.
 *
 * Intentionally non-blocking: every call is fire-and-forget. Failures to
 * report are swallowed; we never want telemetry to mask the original error.
 */
import { supabase } from "@/integrations/supabase/client";

interface ErrorPayload {
  scope: string;
  code: string;
  /** SHORT message — already user-facing, safe to log. No raw user input. */
  message?: string;
  retryAfterSec?: number;
}

interface QueuedEvent {
  scope: string;
  code: string;
  message?: string;
  retry_after?: number;
  route: string;
  ts: string;
}

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_QUEUE = 25;
const FLUSH_DELAY_MS = 1500;

function getRoute(): string {
  if (typeof window === "undefined") return "";
  // Strip query/hash to avoid leaking tokens or search terms.
  return window.location.pathname;
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  flushTimer = null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const rows = batch.map((e) => ({
      action: `client.error.${e.scope}`,
      meta: {
        code: e.code,
        message: e.message?.slice(0, 200),
        route: e.route,
        retry_after: e.retry_after,
        ts: e.ts,
      },
      user_id: user?.id ?? null,
    }));

    // Best-effort — ignore failures (e.g. offline, RLS).
    await supabase.from("audit_log").insert(rows as any);
  } catch {
    /* swallow */
  }
}

function schedule(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, FLUSH_DELAY_MS);
}

export function reportError(payload: ErrorPayload): void {
  if (typeof window === "undefined") return;

  queue.push({
    scope: payload.scope,
    code: payload.code,
    message: payload.message,
    retry_after: payload.retryAfterSec,
    route: getRoute(),
    ts: new Date().toISOString(),
  });

  if (queue.length > MAX_QUEUE) {
    // Drop oldest to bound memory.
    queue.splice(0, queue.length - MAX_QUEUE);
  }

  schedule();
}

/** Flush pending events immediately — useful before navigation/unload. */
export function flushErrors(): void {
  void flush();
}

// Auto-flush on page hide to avoid losing the last batch.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flush(), { capture: true });
}
