import { analyticsLocation, analyticsPath, analyticsReferrer } from "@/lib/analyticsUrl";
// Google Analytics 4 wrapper with GDPR-friendly Consent Mode v2.
// GA is only loaded and allowed to store data AFTER the user grants the
// "analytics" cookie category via the cookie banner (CJEU Planet49 compliant).

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    // Legacy Plausible shim — some call sites still invoke window.plausible(...).
    // Kept as a forwarder to gtag so nothing breaks.
    plausible?: (event: string, options?: { props?: Record<string, unknown>; callback?: () => void }) => void;
  }
}

export const GA_MEASUREMENT_ID = "G-1LV139YG8J";

/* -------------------- Public event API -------------------- */

export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    if (!getCategoryConsent("analytics")) return;
    window.gtag?.("event", name, props ?? {});
  } catch {
    // never break the app
  }
}

export function trackOutbound(url: string) {
  trackEvent("outbound_click", { url });
}

/* -------------------- Conversion funnel (Стълбове 1-6) -------------------- */

export type PillarKey =
  | "assistant"
  | "risk_analysis"
  | "bilingual"
  | "signing"
  | "kits"
  | "corrections";

/** Fired when a paywall overlay/lock becomes visible for a specific pillar. */
export function trackPillarView(pillar: PillarKey, extra?: Record<string, unknown>) {
  trackEvent("pillar_view", { pillar, ...(extra ?? {}) });
}

/** Fired when the user clicks the CTA in a pillar overlay / soft-cap panel. */
export function trackPillarCta(pillar: PillarKey, extra?: Record<string, unknown>) {
  trackEvent("pillar_cta_click", { pillar, ...(extra ?? {}) });
}

/** Fired when the user actually starts the upgrade flow (opens billing tab). */
export function trackUpgradeStarted(source: string, plan?: string) {
  trackEvent("upgrade_started", { source, plan: plan ?? "unknown" });
}

/** Fired when a subscription is successfully activated (called from CheckoutReturn). */
export function trackUpgradeCompleted(plan: string, billing: string) {
  trackEvent("upgrade_completed", { plan, billing });
}

export function gaPageview(rawPath: string) {
  if (typeof window === "undefined") return;
  try {
    if (!getCategoryConsent("analytics")) return;
    const path = analyticsPath(rawPath);
    const page_location = analyticsLocation(window.location.origin, path);
    // "set" persists, so automatic GA events also use the query-free location.
    window.gtag?.("set", { page_location, page_path: path });
    window.gtag?.("event", "page_view", {
      page_path: path,
      page_location,
      page_title: document.title,
    });
  } catch {
    // ignore
  }
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
const LEGACY_KEY = "cookie-consent";

export const COOKIE_POLICY_VERSION = "2026-05-16";

export function getCookiePrefs(): CookiePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as CookiePrefs;
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
  localStorage.setItem(LEGACY_KEY, full.analytics ? "granted" : "denied");
  window.dispatchEvent(new Event("dogovori:cookie-preferences-changed"));
  applyConsentMode(full);
  if (full.analytics) initAnalytics();
}

export function getCategoryConsent(c: CookieCategory): boolean {
  if (c === "necessary") return true;
  const p = getCookiePrefs();
  if (!p) return false;
  return !!p[c];
}

/* Back-compat */
export function getConsent(): "granted" | "denied" | null {
  const p = getCookiePrefs();
  if (!p) return null;
  return p.analytics ? "granted" : "denied";
}

export function setConsent(value: "granted" | "denied") {
  setCookiePrefs({ analytics: value === "granted", marketing: false });
}

/* -------------------- GA4 loader + Consent Mode v2 -------------------- */

function ensureGtagStub() {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    } as typeof window.gtag;
  }
}

function applyConsentMode(p: CookiePrefs | null) {
  ensureGtagStub();
  const analytics = p?.analytics ? "granted" : "denied";
  const marketing = p?.marketing ? "granted" : "denied";
  try {
    window.gtag?.("consent", "update", {
      analytics_storage: analytics,
      ad_storage: marketing,
      ad_user_data: marketing,
      ad_personalization: marketing,
    });
  } catch {
    // ignore
  }
}

// Set safe defaults for Consent Mode v2 as early as possible.
if (typeof window !== "undefined") {
  ensureGtagStub();
  try {
    window.gtag?.("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      security_storage: "granted",
      wait_for_update: 500,
    });
    // Legacy Plausible shim → forward to gtag so existing call sites keep working.
    if (!window.plausible) {
      window.plausible = (event, options) => {
        try {
          window.gtag?.("event", event, options?.props ?? {});
        } catch { /* ignore */ }
      };
    }
    // Apply current stored prefs (if any) — matters on subsequent page loads.
    applyConsentMode(getCookiePrefs());
  } catch { /* ignore */ }
}

const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

export function initAnalytics() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!getCategoryConsent("analytics")) return;
  ensureGtagStub();
  applyConsentMode(getCookiePrefs());
  if (document.querySelector(`script[src="${GTAG_SRC}"]`)) return;
  const s = document.createElement("script");
  s.src = GTAG_SRC;
  s.async = true;
  document.head.appendChild(s);
  window.gtag?.("js", new Date());
  window.gtag?.("config", GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    send_page_view: true,
    page_location: analyticsLocation(window.location.origin, window.location.pathname),
    page_path: analyticsPath(window.location.pathname),
    page_referrer: analyticsReferrer(document.referrer, window.location.origin) ?? "",
    transport_type: "beacon",
  });
}

export function revokeCookieConsent() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(LEGACY_KEY);
  applyConsentMode(null);
}
