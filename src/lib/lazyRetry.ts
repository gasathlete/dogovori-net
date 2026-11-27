import { lazy as reactLazy, type ComponentType } from "react";

const RELOAD_KEY = "lovable:chunk-reload";
const RETRY_DELAY_MS = 400;

function isChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("module script failed") ||
    msg.includes("Failed to load module script") ||
    msg.includes("Unable to preload CSS") ||
    msg.includes("Load failed")
  );
}

/** Hard reload with a cache-buster so the browser refetches index.html and the
 * fresh asset manifest instead of replaying stale hashed chunk references. */
function reloadFresh(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * React.lazy wrapper that survives stale-deploy chunk failures:
 * 1. retry the dynamic import once (transient network / just-swapped CDN file),
 * 2. otherwise hard-reload once with a cache-buster instead of showing a blank screen.
 */
export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return reactLazy(() =>
    factory()
      .then((mod) => {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {}
        return mod;
      })
      .catch(async (err) => {
        if (typeof window === "undefined" || !isChunkError(err)) throw err;
        try {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          return await factory();
        } catch (err2) {
          let reloaded = false;
          try {
            // Time-boxed guard: prevents reload loops, but still allows a fresh
            // recovery attempt later (a permanent flag left users on a blank screen).
            const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
            reloaded = Date.now() - last < 10_000;
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          } catch {}
          if (!reloaded) {
            reloadFresh();
            return new Promise<{ default: T }>(() => {});
          }
          throw err2;
        }
      }),
  );
}
