// Helpers for recording user consents (GDPR art. 7 evidence).
// Document versions are bumped whenever a policy text materially changes.

import { supabase } from "@/integrations/supabase/client";

export const CONSENT_VERSIONS = {
  terms: "2026-05-16",
  privacy: "2026-05-16",
  marketing: "2026-06-02",
  operational_notifications: "2026-09-15",
  ai_disclaimer: "2026-05-16",
  cookies: "2026-05-16",
  age_18: "2026-05-16",
} as const;

export type ConsentType = keyof typeof CONSENT_VERSIONS;

export interface ConsentRecord {
  consent_type: ConsentType;
  granted: boolean;
  metadata?: Record<string, unknown>;
}

export const PENDING_CONSENTS_KEY = "pending_consents";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newEventId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch { /* crypto unavailable */ }
  // Deterministic-length fallback; only used when crypto is missing.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * Record one or more consents for the currently logged-in user.
 *
 * The write is idempotent per (user, consent_type, consent_event_id): retrying
 * the same batch after a network failure cannot create a second consent event.
 * Failures are returned, never swallowed as success.
 */
export async function recordConsents(
  records: ConsentRecord[],
  options: { eventId?: string } = {},
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false as const, reason: "no-user" as const };
    if (records.length === 0) return { ok: true as const, eventId: options.eventId };

    const eventId = options.eventId && UUID_RE.test(options.eventId)
      ? options.eventId
      : newEventId();

    const rows = records.map((r) => ({
      user_id: user.id,
      consent_type: r.consent_type,
      consent_event_id: eventId,
      document_version: CONSENT_VERSIONS[r.consent_type],
      granted: r.granted,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      metadata: r.metadata ?? null,
    }));

    // `consent_event_id` is added by migration 0028; generated types are
    // regenerated with that migration, so the row shape is cast until then.
    const { error } = await supabase
      .from("user_consents")
      .upsert(rows as never, {
        onConflict: "user_id,consent_type,consent_event_id",
        ignoreDuplicates: true,
      });
    if (error) return { ok: false as const, reason: error.message, eventId };
    return { ok: true as const, eventId };
  } catch (e) {
    return { ok: false as const, reason: String(e) };
  }
}

/**
 * Has the current user already accepted a given consent (latest version)?
 */
export async function hasConsent(type: ConsentType): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from("user_consents")
      .select("granted")
      .eq("user_id", user.id)
      .eq("consent_type", type)
      .eq("document_version", CONSENT_VERSIONS[type])
      .eq("granted", true)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export interface PendingConsentPayload {
  event_id: string;
  operational_notifications?: boolean;
  marketing?: boolean;
  terms?: boolean;
  privacy?: boolean;
  age_18?: boolean;
  [key: string]: unknown;
}

/**
 * Strict validation of the signup evidence shape. A payload is accepted only
 * when every required flag is literally `true`; an empty or partially
 * corrupted object is malformed and must produce NO consent record at all.
 *
 * - terms / privacy / age_18 / operational_notifications: must be `true`
 * - marketing: `true`, `false` or absent
 * - event_id: a valid UUID, or absent for legacy payloads
 * - any other metadata (e.g. `ts`) is ignored, not rejected
 */
export function parsePending(raw: string): Record<string, unknown> | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;

  for (const key of ["terms", "privacy", "age_18", "operational_notifications"]) {
    if (obj[key] !== true) return null;
  }
  if (!(obj.marketing === true || obj.marketing === false || obj.marketing === undefined)) {
    return null;
  }
  if (obj.event_id !== undefined
      && !(typeof obj.event_id === "string" && UUID_RE.test(obj.event_id))) {
    return null;
  }
  return obj;
}

/**
 * Flush consents stashed at signup (`pending_consents` in sessionStorage) to
 * the server on first authenticated session.
 *
 * Durability rules:
 *  - the stash is removed ONLY after the server write succeeded, so a network
 *    or database failure leaves the evidence retryable;
 *  - the payload carries a stable `event_id`, so a retry writes the same
 *    consent event instead of a duplicate;
 *  - a malformed payload is discarded after strict validation — never turned
 *    into fabricated consent.
 *
 * Marketing is recorded ONLY as an explicit opt-in (`marketing === true`).
 * An unchecked box records nothing at all; a later unsubscribe action records
 * `granted = false`.
 */
export async function flushPendingConsents() {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_CONSENTS_KEY);
  } catch {
    return { ok: false as const, reason: "storage-unavailable" as const };
  }
  if (!raw) return { ok: true as const, reason: "nothing-pending" as const };

  const data = parsePending(raw);
  if (!data) {
    try { sessionStorage.removeItem(PENDING_CONSENTS_KEY); } catch { /* ignore */ }
    return { ok: false as const, reason: "malformed" as const };
  }

  // A stable batch id makes the retry idempotent. Persist the enriched payload
  // BEFORE the request, so a crash mid-flight still retries the same event.
  // If persisting the id fails we must NOT write: a reload would then mint a
  // second id and duplicate the consent event.
  let eventId = typeof data.event_id === "string" ? data.event_id : null;
  if (!eventId) {
    eventId = newEventId();
    try {
      sessionStorage.setItem(
        PENDING_CONSENTS_KEY,
        JSON.stringify({ ...data, event_id: eventId }),
      );
    } catch {
      return { ok: false as const, reason: "storage-unavailable" as const };
    }
  }

  const records: ConsentRecord[] = [
    { consent_type: "terms", granted: true },
    { consent_type: "privacy", granted: true },
    { consent_type: "age_18", granted: true },
    { consent_type: "operational_notifications", granted: true },
  ];
  // Explicit opt-in only. No record means no marketing consent.
  if (data.marketing === true) records.push({ consent_type: "marketing", granted: true });

  const result = await recordConsents(records, { eventId });
  if (!result.ok) return result;

  try { sessionStorage.removeItem(PENDING_CONSENTS_KEY); } catch { /* ignore */ }
  return { ok: true as const, eventId };
}

/* Note: anonymous AI-disclaimer persistence is handled by
 * lib/aiDisclaimerGate via sessionStorage. Authenticated acceptance
 * is recorded server-side via recordConsents() above. */
