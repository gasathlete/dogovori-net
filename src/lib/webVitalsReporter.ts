/**
 * Lightweight global Web Vitals collector.
 *
 * Records LCP / INP / CLS / FCP / TTFB on every page load and persists the
 * latest 100 samples to `localStorage` under the same key used by the
 * `/admin/perf` dashboard. Loaded lazily (idle callback) so it never competes
 * with hydration or the LCP paint.
 *
 * Also fires a `plausible("web_vital", { props: { name, rating } })` custom
 * event when Plausible is present, so we get aggregate field data without a
 * dedicated backend table.
 */

const KEY = "dogovori:perf-log";
const MAX_ROWS = 100;

type Row = { name: string; value: number; rating: string; ts: number };

function persist(row: Row) {
  try {
    const prev: Row[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    const next = [row, ...prev].slice(0, MAX_ROWS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode — ignore */
  }
}

export function initWebVitalsReporter(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__lovableVitalsBooted) return;
  (window as any).__lovableVitalsBooted = true;

  const boot = async () => {
    try {
      const { onLCP, onCLS, onINP, onFCP, onTTFB } = await import("web-vitals");
      const handle = (m: { name: string; value: number; rating: string }) => {
        const row: Row = { name: m.name, value: m.value, rating: m.rating, ts: Date.now() };
        persist(row);
        const p = (window as any).plausible as
          | ((event: string, opts?: { props?: Record<string, string> }) => void)
          | undefined;
        if (typeof p === "function") {
          p("web_vital", {
            props: {
              metric: m.name,
              rating: m.rating,
              // bucket values to keep cardinality bounded
              bucket: bucketize(m.name, m.value),
            },
          });
        }
      };
      onLCP(handle);
      onCLS(handle);
      onINP(handle);
      onFCP(handle);
      onTTFB(handle);
    } catch {
      /* web-vitals failed to load — non-critical */
    }
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(boot, { timeout: 5000 });
  } else {
    setTimeout(boot, 2500);
  }
}

function bucketize(name: string, value: number): string {
  if (name === "CLS") {
    if (value < 0.1) return "good";
    if (value < 0.25) return "ni";
    return "poor";
  }
  // millisecond metrics
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000],
    INP: [200, 500],
    FCP: [1800, 3000],
    TTFB: [800, 1800],
  };
  const t = thresholds[name];
  if (!t) return "n/a";
  if (value < t[0]) return "good";
  if (value < t[1]) return "ni";
  return "poor";
}
