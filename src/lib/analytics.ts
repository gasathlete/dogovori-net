// Plausible Analytics wrapper. Cookieless, GDPR-friendly.
// We additionally store granular cookie-category preferences for compliance
// with CJEU Planet49 (active opt-in per category).

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, unknown>; callback?: () => void }) => void;
  }
}

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (getCategoryConsent("analytics")) {
      window.plausible?.(name, props ? { props } : undefined);
    }
  } catch {
    // never break the app
  }
}

export function trackOutbound(url: string) {
  trackEvent("Outbound Link: Click", { url });
}

/* -------------------- Cookie categories (granular consent) -------------------- */

export type CookieCategory = "necessary" | "analytics" | "marketing";

export interface CookiePrefs {
  necessary: true; // always on
  analytics: boolean;
  marketing: boolean;
  version: string;
  decided_at: string;
}

const PREFS_KEY = "cookie-prefs-v2";
// Legacy single-value key (kept for backward compatibility)
const LEGACY_KEY = "cookie-consent";

export const COOKIE_POLICY_VERSION = "2026-05-16";

export function getCookiePrefs(): CookiePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as CookiePrefs;
    // Migrate legacy "granted/denied" → all-in / necessary-only
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === "granted" || legacy === "denied") {
      const migrated: CookiePrefs = {
        necessary: true,
        analytics: legacy === "granted",
        marketing: false,
        version: COOKIE_POLICY_VERSION,
        decided_at: new Date().toISOString(),
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

export function setCookiePrefs(p: Omit<CookiePrefs, "necessary" | "version" | "decided_at">) {
  if (typeof window === "undefined") return;
  const full: CookiePrefs = {
    necessary: true,
    analytics: p.analytics,
    marketing: p.marketing,
    version: COOKIE_POLICY_VERSION,
    decided_at: new Date().toISOString(),
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(full));
  // keep legacy key in sync for any old code paths
  localStorage.setItem(LEGACY_KEY, full.analytics ? "granted" : "denied");
  if (full.analytics) initAnalytics();
}

export function getCategoryConsent(c: CookieCategory): boolean {
  if (c === "necessary") return true;
  const p = getCookiePrefs();
  if (!p) return false;
  return !!p[c];
}

/* Back-compat exports (other files import these) */
export function getConsent(): "granted" | "denied" | null {
  const p = getCookiePrefs();
  if (!p) return null;
  return p.analytics ? "granted" : "denied";
}

export function setConsent(value: "granted" | "denied") {
  setCookiePrefs({ analytics: value === "granted", marketing: false });
}

export function initAnalytics() {
  /* Plausible loads via index.html; nothing extra to init */
}

export function revokeCookieConsent() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(LEGACY_KEY);
}
