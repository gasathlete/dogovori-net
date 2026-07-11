// First-party pageview tracker. Batches events client-side and flushes to the
// `track-pageview` edge function on a short interval or when the tab hides.
// Reduces the DB write rate ~10× under normal browsing (single HTTP request
// carrying up to 20 events instead of one request per SPA route change).
import { gaPageview, getCategoryConsent } from "@/lib/analytics";

const SESSION_KEY = "pv-session-id";
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-pageview`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 20;

function uuid(): string {
  return (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now();
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) { id = uuid(); sessionStorage.setItem(SESSION_KEY, id); }
  return id;
}

type PVEvent = Record<string, unknown>;

let queue: PVEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush(false);
  }, FLUSH_INTERVAL_MS);
}

async function flush(useBeacon: boolean) {
  if (queue.length === 0) return;
  if (!getCategoryConsent("analytics")) { queue = []; return; }
  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({ session_id: getSessionId(), events });
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

function enqueue(ev: PVEvent) {
  if (!getCategoryConsent("analytics")) return;
  queue.push(ev);
  if (queue.length >= MAX_BATCH) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    void flush(false);
  } else {
    scheduleFlush();
  }
}

let currentPath: string | null = null;
let currentStart = 0;

function flushDuration(beacon = false) {
  if (!currentPath || !currentStart) return;
  const duration_ms = Date.now() - currentStart;
  enqueue({
    event: "duration_update",
    path: currentPath,
    duration_ms,
    is_bounce: duration_ms < 10_000,
  });
  if (beacon) void flush(true);
}

export function trackPageview(path: string) {
  flushDuration(false);
  currentPath = path;
  currentStart = Date.now();
  const utm = new URLSearchParams(window.location.search).get("utm_source");
  enqueue({
    event: "pageview",
    path,
    referrer: document.referrer || null,
    utm_source: utm,
  });
  gaPageview(path);
}

let installed = false;
export function installPageviewLifecycleHooks() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const onHide = () => { if (document.visibilityState === "hidden") flushDuration(true); };
  window.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flushDuration(true));
}
