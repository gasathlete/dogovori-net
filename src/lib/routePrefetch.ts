/**
 * Hover/focus prefetch for lazy route chunks.
 *
 * Each path maps to a dynamic `import()` factory matching the corresponding
 * lazy declaration in `src/App.tsx`. Calling `prefetchRoute("/catalog")` from
 * `onMouseEnter` / `onFocus` warms the chunk so the subsequent click feels
 * instant, without bloating the initial entry bundle.
 *
 * Cached set ensures we only kick off each import once per session.
 */

const fired = new Set<string>();

/**
 * Speculative loading is a luxury — it must never compete with the critical
 * path. Skip it on data-saver, slow networks and low-memory devices.
 */
export function shouldPrefetch(): boolean {
  if (typeof window === "undefined") return false;
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (/(^|-)(2g|slow-2g|3g)$/.test(String(conn?.effectiveType ?? ""))) return false;
  if (typeof conn?.downlink === "number" && conn.downlink > 0 && conn.downlink < 3) return false;
  const mem = (navigator as any).deviceMemory;
  if (typeof mem === "number" && mem > 0 && mem < 4) return false;
  return true;
}

const FACTORIES: Record<string, () => Promise<unknown>> = {
  "/produkti": () => import("@/pages/Products.tsx"),
  "/build": () => import("@/pages/BuildContract.tsx"),
  "/catalog": () => import("@/pages/Catalog.tsx"),
  "/blog": () => import("@/pages/Blog.tsx"),
  "/plans": () => import("@/pages/Plans.tsx"),
  "/auth": () => import("@/pages/Auth.tsx"),
  "/account": () => import("@/pages/Account.tsx"),
  "/assistant": () => import("@/pages/Assistant.tsx"),
  "/komplekti": () => import("@/pages/Kits.tsx"),
  "/console": () => import("@/pages/Console.tsx"),
  "/tools": () => import("@/pages/Tools.tsx"),
};

export function prefetchRoute(path: string): void {
  if (!shouldPrefetch()) return;
  // Match longest prefix — handles paths like "/blog/something" -> "/blog".
  const key = FACTORIES[path]
    ? path
    : Object.keys(FACTORIES).find((p) => path === p || path.startsWith(p + "/"));
  if (!key || fired.has(key)) return;
  fired.add(key);
  try {
    void FACTORIES[key]();
  } catch {
    /* ignore — navigation will retry */
  }
}

/** Convenience: bind to a JSX element. */
export const prefetchHandlers = (path: string) => ({
  onMouseEnter: () => prefetchRoute(path),
  onFocus: () => prefetchRoute(path),
  onTouchStart: () => prefetchRoute(path),
});

/**
 * Warms the most likely next route(s) when the main thread is idle.
 *
 * Skipped on data-saver / slow connections, so мобилните потребители с лимит
 * не плащат за спекулативен трафик. Връща cleanup функция.
 */
export function prefetchOnIdle(paths: string[], delay = 3000): () => void {
  if (!shouldPrefetch()) return () => {};

  let cancelled = false;
  const timers: number[] = [];

  const run = () => {
    if (cancelled) return;
    const ric =
      (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, delay));
    // Warm one route per idle slot so a burst of chunk downloads never starves
    // the interactions the user is actually performing.
    const queue = [...paths];
    const step = () => {
      if (cancelled) return;
      const next = queue.shift();
      if (!next) return;
      prefetchRoute(next);
      const h = ric(step, { timeout: 4000 });
      timers.push(h as unknown as number);
    };
    const h = ric(step, { timeout: delay + 2000 });
    timers.push(h as unknown as number);
  };

  // Never start before the page has fully loaded, then wait out `delay`.
  const start = () => timers.push(window.setTimeout(run, delay));
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  return () => {
    cancelled = true;
    const cic = (window as any).cancelIdleCallback;
    timers.forEach((h) => {
      if (cic) cic(h);
      clearTimeout(h);
    });
  };
}
