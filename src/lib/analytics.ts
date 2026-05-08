// Lightweight GA4 wrapper. Activates only if VITE_GA4_ID is set AND consent given.
// Consent stored in localStorage as "analytics-consent" = "granted" | "denied".

const CONSENT_KEY = "analytics-consent";

export function getConsent(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

export function setConsent(v: "granted" | "denied") {
  localStorage.setItem(CONSENT_KEY, v);
  if (v === "granted") initAnalytics();
}

let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === "undefined") return;
  const id = import.meta.env.VITE_GA4_ID as string | undefined;
  if (!id) return;
  if (getConsent() !== "granted") return;
  initialized = true;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);

  // @ts-expect-error global gtag
  window.dataLayer = window.dataLayer || [];
  // @ts-expect-error
  window.gtag = function () { window.dataLayer.push(arguments); };
  // @ts-expect-error
  window.gtag("js", new Date());
  // @ts-expect-error
  window.gtag("config", id, { anonymize_ip: true });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (getConsent() !== "granted") return;
  // @ts-expect-error
  if (typeof window.gtag === "function") window.gtag("event", name, params ?? {});
}
