import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./fonts.ts";
import "./index.css";
import "./i18n";
import { initWebVitalsReporter } from "./lib/webVitalsReporter";

// Strip prerendered JSON-LD blocks before React/Helmet mounts its own copies.
// Without this, /shablon, /kategoria, /ai, /karta etc. would emit duplicate
// structured data (the SSG copy + the runtime copy) and Google Search Console
// flags it as "Duplicate field FAQPage" — disqualifying the page from rich results.
document
  .querySelectorAll('script[type="application/ld+json"][data-prerendered="true"]')
  .forEach((el) => el.remove());

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
  window.location.reload();
}
window.addEventListener("error", (e) => handleStaleChunk(e?.message));
window.addEventListener("unhandledrejection", (e) =>
  handleStaleChunk((e?.reason as { message?: string } | undefined)?.message),
);

createRoot(document.getElementById("root")!).render(<App />);

// Collect Web Vitals on every route — non-blocking, fires on idle.
initWebVitalsReporter();
