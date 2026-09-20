/**
 * Operation session helpers — drive "session-scoped free reuse" of the quota.
 *
 * Concept:
 * - Each browser TAB gets a stable `op_session_id` (UUID) stored in sessionStorage.
 * - For each user-facing document (slug / id / hash), we send `(session_id, doc_key)`
 *   to the edge functions so the server can recognise repeat actions on the same
 *   document within the same session and skip the quota charge.
 *
 * Scoring rules implemented server-side via `consume_quota_session`:
 *   - First contract/template/analysis for a (session_id, doc_key) → charges 1 op.
 *   - Any subsequent action with the same key in the same tab → free.
 *
 * For batch corrections the equivalent helper is `getOpBatchId()` — generates a
 * fresh UUID per "wave" of corrections so each batch counts as exactly 1 op even
 * if it contains many recommendations.
 */

const SESSION_KEY = "op_session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback for older browsers.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

/** Stable per-tab UUID. Created lazily on first call. */
export function getOpSessionId(): string {
  try {
    let v = sessionStorage.getItem(SESSION_KEY);
    if (!v) {
      v = uuid();
      sessionStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    // sessionStorage unavailable (SSR / private mode) — generate ephemeral.
    return uuid();
  }
}

/** Normalises a document key (slug / id / hash). Empty input → empty string. */
export function getOpDocKey(input: string | undefined | null): string {
  if (!input) return "";
  return String(input).trim().toLowerCase().slice(0, 200);
}

/** Generates a fresh batch id (e.g. for a wave of auto-corrections). */
export function newOpBatchId(): string {
  return uuid();
}

/**
 * СТАБИЛЕН КЛЮЧ НА ЕДНА ЗАЯВКА.
 *
 * Един и същ ключ трябва да се използва при повторен опит, двойно натискане,
 * загубена връзка И презареждане на страницата — иначе сървърът вижда нова
 * заявка и таксува втори път. Затова ключът се пази в sessionStorage (същия
 * таб), а не само в паметта на текущия JS живот.
 * Ключът се освобождава едва когато заявката е приключила успешно.
 */
const stableKeys = new Map<string, string>();
const STABLE_PREFIX = "op_stable_key:";

export function getStableOpKey(scope: string): string {
  const storageKey = `${STABLE_PREFIX}${scope}`;
  const cached = stableKeys.get(scope);
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      stableKeys.set(scope, stored);
      return stored;
    }
  } catch { /* sessionStorage недостъпен */ }
  const v = uuid();
  stableKeys.set(scope, v);
  try {
    sessionStorage.setItem(storageKey, v);
  } catch { /* ignore */ }
  return v;
}

/** Освобождава ключа след доказано успешен изход. */
export function releaseStableOpKey(scope: string): void {
  stableKeys.delete(scope);
  try {
    sessionStorage.removeItem(`${STABLE_PREFIX}${scope}`);
  } catch { /* ignore */ }
}

