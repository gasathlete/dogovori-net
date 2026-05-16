// Helpers for recording user consents (GDPR art. 7 evidence).
// Document versions are bumped whenever a policy text materially changes.

import { supabase } from "@/integrations/supabase/client";

export const CONSENT_VERSIONS = {
  terms: "2026-05-16",
  privacy: "2026-05-16",
  marketing: "2026-05-16",
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
      metadata: r.metadata ?? null,
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

/* Local-only persistence for AI disclaimer & cookie preferences,
 * so anonymous visitors aren't nagged on every visit. */
const AI_DISCLAIMER_KEY = `ai-disclaimer-v${CONSENT_VERSIONS.ai_disclaimer}`;

export function hasAIDisclaimerLocal(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AI_DISCLAIMER_KEY) === "accepted";
}

export function setAIDisclaimerLocal() {
  if (typeof window === "undefined") return;
  localStorage.setItem(AI_DISCLAIMER_KEY, "accepted");
}
