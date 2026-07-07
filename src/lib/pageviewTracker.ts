// First-party pageview tracker. Sends to the `track-pageview` edge function on
// every SPA route change. Gated by the existing analytics cookie consent.
import { gaPageview, getCategoryConsent } from "@/lib/analytics";

const SESSION_KEY = "pv-session-id";
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-pageview`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function uuid(): string {
  // crypto.randomUUID is fine in modern browsers
  return (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now();
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) { id = uuid(); sessionStorage.setItem(SESSION_KEY, id); }
  return id;
}

let currentPath: string | null = null;
let currentStart = 0;

async function send(body: Record<string, unknown>, useBeacon = false) {
  if (!getCategoryConsent("analytics")) return;
  const payload = JSON.stringify({ session_id: getSessionId(), ...body });
  try {
    if (useBeacon && "sendBeacon" in navigator) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(FN_URL, blob);
      return;
    }
    await fetch(FN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON },
      body: payload,
      keepalive: true,
    });
  } catch { /* ignore */ }
}

function flushDuration(beacon = false) {
  if (!currentPath || !currentStart) return;
  const duration_ms = Date.now() - currentStart;
  send({ event: "duration_update", path: currentPath, duration_ms, is_bounce: duration_ms < 10_000 }, beacon);
}

export function trackPageview(path: string) {
  // Flush previous page duration first
  flushDuration(false);
  currentPath = path;
  currentStart = Date.now();
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  send({
    event: "pageview",
    path,
    referrer: document.referrer || null,
    utm_source: utm,
  });
}

let installed = false;
export function installPageviewLifecycleHooks() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onHide = () => { if (document.visibilityState === "hidden") flushDuration(true); };
  window.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flushDuration(true));
}
