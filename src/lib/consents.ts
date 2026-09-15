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

/**
 * Record one or more consents for the currently logged-in user.
 * Silently no-ops when not authenticated (anonymous browsing).
 */
export async function recordConsents(records: ConsentRecord[]) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "no-user" as const };

    const rows = records.map((r) => ({
      user_id: user.id,
      consent_type: r.consent_type,
      document_version: CONSENT_VERSIONS[r.consent_type],
      granted: r.granted,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
      metadata: (r.metadata ?? null) as any,
    }));

    const { error } = await supabase.from("user_consents").insert(rows);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
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

/**
 * Flush consents stashed at signup (`pending_consents` in sessionStorage) to
 * the server on first authenticated session. Runs once per browser — the
 * stash is removed before the request so a failure cannot double-record.
 *
 * Marketing is recorded only on an explicit signal:
 *  - `marketing === true`         → granted = true (opt-in);
 *  - `marketing_refused === true` → granted = false (explicit opt-out,
 *    shown as „−" in the admin panel; everyone without such a record is „+").
 */
export async function flushPendingConsents() {
  try {
    const raw = sessionStorage.getItem("pending_consents");
    if (!raw) return;
    sessionStorage.removeItem("pending_consents");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const records: ConsentRecord[] = [
      { consent_type: "terms", granted: true },
      { consent_type: "privacy", granted: true },
      { consent_type: "age_18", granted: true },
      { consent_type: "operational_notifications", granted: data.operational_notifications !== false },
    ];
    if (data.marketing === true) records.push({ consent_type: "marketing", granted: true });
    if (data.marketing_refused === true) records.push({ consent_type: "marketing", granted: false });
    await recordConsents(records);
  } catch { /* storage unavailable or malformed payload — ignore */ }
}

/* Note: anonymous AI-disclaimer persistence is handled by
 * lib/aiDisclaimerGate via sessionStorage. Authenticated acceptance
 * is recorded server-side via recordConsents() above. */
