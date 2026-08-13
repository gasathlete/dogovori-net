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

const FACTORIES: Record<string, () => Promise<unknown>> = {
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
  if (typeof window === "undefined") return;
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
export function prefetchOnIdle(paths: string[], delay = 2000): () => void {
  if (typeof window === "undefined") return () => {};
  const conn = (navigator as any).connection;
  if (conn?.saveData) return () => {};
  if (/(^|-)(2g|slow-2g)$/.test(String(conn?.effectiveType ?? ""))) return () => {};

  const ric =
    (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, delay));
  const handle = ric(() => paths.forEach(prefetchRoute), { timeout: delay + 2000 });
  return () => {
    const cic = (window as any).cancelIdleCallback;
    if (cic) cic(handle);
    else clearTimeout(handle as any);
  };
}

