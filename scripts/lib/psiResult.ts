/**
 * Classification helpers for scripts/pagespeed-check.ts.
 *
 * Distinguishes "provider unavailable" (429 quota, 5xx, network) from a real
 * measured score. Unavailable runs carry NO scores — they are never reported
 * as 0 or compared to thresholds.
 */

export type PsiOutcome =
  | { kind: "measured"; json: unknown }
  | { kind: "unavailable"; reason: string; status?: number }
  | { kind: "error"; reason: string; status?: number };

export const MAX_ATTEMPTS = 3;
export const MAX_RETRY_AFTER_MS = 30_000;

/** Parses Retry-After (seconds or HTTP date). Returns ms clamped to [0, max], or null. */
export function parseRetryAfter(value: string | null, now = Date.now(), maxMs = MAX_RETRY_AFTER_MS): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Math.min(Number(v) * 1000, maxMs);
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.min(t - now, maxMs));
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

/** Backoff delay for attempt n (1-based): Retry-After if given, else 2s, 4s… capped. */
export function backoffMs(attempt: number, retryAfter: number | null): number {
  if (retryAfter != null) return retryAfter;
  return Math.min(2000 * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS);
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; statusText?: string; headers: { get(n: string): string | null }; json(): Promise<unknown> }>;

/** Bounded fetch: at most MAX_ATTEMPTS, only on retryable statuses/network errors. */
export async function fetchPsi(
  endpoint: string,
  fetcher: Fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxAttempts = MAX_ATTEMPTS,
): Promise<PsiOutcome> {
  let last: PsiOutcome = { kind: "unavailable", reason: "no attempt made" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetcher(endpoint);
      if (res.ok) return { kind: "measured", json: await res.json() };
      if (!isRetryableStatus(res.status)) {
        return { kind: "error", reason: `HTTP ${res.status} ${res.statusText ?? ""}`.trim(), status: res.status };
      }
      last = {
        kind: "unavailable",
        reason: res.status === 429 ? "PSI quota/rate limit (HTTP 429)" : `PSI provider unavailable (HTTP ${res.status})`,
        status: res.status,
      };
      if (attempt < maxAttempts) await sleep(backoffMs(attempt, parseRetryAfter(res.headers.get("retry-after"))));
    } catch (e) {
      last = { kind: "unavailable", reason: `network error: ${(e as Error).message}` };
      if (attempt < maxAttempts) await sleep(backoffMs(attempt, null));
    }
  }
  return last;
}

/** Returns category scores 0–100 or null when the category is missing (never invents 0). */
export function extractScores(json: unknown): Record<string, number | null> {
  const cats = (json as { lighthouseResult?: { categories?: Record<string, { score?: number | null }> } })
    ?.lighthouseResult?.categories ?? {};
  const out: Record<string, number | null> = {};
  for (const k of ["performance", "seo", "accessibility", "best-practices"]) {
    const s = cats[k]?.score;
    out[k] = typeof s === "number" ? Math.round(s * 100) : null;
  }
  return out;
}
