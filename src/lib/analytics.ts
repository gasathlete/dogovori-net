// Plausible Analytics wrapper. Cookieless, GDPR-friendly — no consent banner needed.
// Script tag is added in index.html with data-domain="dogovori.net".

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, unknown>; callback?: () => void }) => void;
  }
}

/**
 * Track a custom event in Plausible.
 * Examples:
 *   trackEvent("template_view", { slug: "dogovor-naem" })
 *   trackEvent("wizard_start", { sectorId: "real-estate" })
 *   trackEvent("checkout_start", { amount: 9.99 })
 *   trackEvent("purchase_complete", { amount: 9.99, currency: "BGN" })
 */
export function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.plausible?.(name, props ? { props } : undefined);
  } catch {
    // Silently swallow — analytics must never break the app.
  }
}

/**
 * Track outbound link clicks (e.g. lex.bg references).
 * Plausible auto-tracks these via the `outbound-links` extension if enabled in script src.
 * This helper exists for manual one-off tracking.
 */
export function trackOutbound(url: string) {
  trackEvent("Outbound Link: Click", { url });
}

const CONSENT_KEY = "cookie-consent";

export function getConsent(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

export function setConsent(value: "granted" | "denied") {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONSENT_KEY, value);
  if (value === "granted") initAnalytics();
}

export function initAnalytics() {
  /* Plausible loads via index.html; nothing extra to init */
}
