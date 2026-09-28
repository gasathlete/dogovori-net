import { startTransition } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.ts";
import "./index.css";
import "./i18n";
import { initWebVitalsReporter } from "./lib/webVitalsReporter";
import { applyAbOverridesFromUrl } from "./lib/ab";

// Strip ALL prerendered route-specific head metadata before React/Helmet mounts
// its own copies: meta description/robots, canonical, og:*, twitter:* and route
// JSON-LD. Raw static HTML keeps exactly one crawlable set; the hydrated DOM
// keeps exactly one Helmet-owned set. Global JSON-LD (Organization, WebSite,
// LegalService, SoftwareApplication) is NOT marked and therefore stays.
document.querySelectorAll("[data-prerendered='true']").forEach((el) => el.remove());


// Auto-recover from stale chunk references after a new deploy.
// When the build hash changes, previously-loaded HTML points to JS chunks
// that no longer exist on the CDN — reload once to fetch the fresh manifest.
const STALE_RELOAD_KEY = "__stale_chunk_reloaded_at";
function isChunkLoadError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("module script failed") ||
    message.includes("Failed to load module script") ||
    message.includes("Unable to preload CSS")
  );
}
function handleStaleChunk(message: string | undefined) {
  if (!isChunkLoadError(message)) return;
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || "0");
    if (Date.now() - last < 10_000) return; // avoid reload loops
    sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
  } catch {}
  // Cache-bust so the browser refetches index.html and picks up the new
  // asset manifest, instead of replaying the stale hashed chunk references.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}
window.addEventListener("error", (e) => handleStaleChunk(e?.message));
window.addEventListener("unhandledrejection", (e) =>
  handleStaleChunk((e?.reason as { message?: string } | undefined)?.message),
);

// A/B форсиране от URL се прилага ПРЕДИ първия render: hook-ове като
// useActivationDraft четат варианта още при mount, така че ?ab_<test>=variant
// трябва да е записан преди това (иначе се хваща едва при следващо зареждане).
applyAbOverridesFromUrl(window.location.search);

// The prerendered Header + Hero are already painted; rendering the app in a
// transition lets React yield between chunks instead of one long blocking task.
const root = createRoot(document.getElementById("root")!);
startTransition(() => root.render(<App />));

// Collect Web Vitals on every route — non-blocking, fires on idle.
initWebVitalsReporter();

// Funnel identity: attaches user_id to every funnel event from the first
// authenticated moment and records `signup_completed` once per new account.
// Lazy-loaded on idle so it never competes with first paint.
const scheduleIdle = (cb: () => void) =>
  "requestIdleCallback" in window ? (window as Window).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500);
scheduleIdle(() => {
  void import("./lib/funnel").then((m) => m.initFunnelIdentity()).catch(() => undefined);
});
