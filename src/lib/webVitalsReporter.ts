/**
 * Lightweight global Web Vitals collector.
 *
 * Two independent sinks:
 *  1. Local diagnostics — always on: keeps the latest 100 samples in
 *     `localStorage` for the current browser (used by `/admin/perf`).
 *  2. Central + GA4 — ONLY when the visitor granted the "analytics" cookie
 *     category at the moment the metric fires. GA goes through the canonical
 *     `trackEvent` wrapper (single owner of Consent Mode behaviour) and the
 *     central sink is a privacy-minimal aggregate RPC (no identifiers, no raw
 *     path). Nothing is queued before consent.
 *
 * LCP / INP / CLS are persisted centrally (aggregate only).
 * FCP / TTFB stay local + consent-gated GA.
 *
 * Loaded lazily on idle so it never competes with hydration or the LCP paint.
 */

import { trackEvent, getCategoryConsent } from "@/lib/analytics";
import {
  coarseDeviceClass,
  coarseNavigationType,
  coarseRouteGroup,
  isCoreMetric,
  isSaneValue,
  toIntegerValue,
  type CoreMetric,
  type DeviceClass,
  type NavigationTypeClass,
  type RouteGroup,
} from "@/lib/webVitals/dimensions";

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

/** Контекстът на ЗАРЕЖДАНЕТО, а не на текущата SPA навигация. */
export interface PageLoadContext {
  routeGroup: RouteGroup;
  deviceClass: DeviceClass;
  navigationType: NavigationTypeClass;
}

function capturePageLoadContext(): PageLoadContext {
  let navType: string | undefined;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | (PerformanceNavigationTiming & { type?: string })
      | undefined;
    navType = nav?.type;
  } catch {
    /* ignore */
  }
  return {
    routeGroup: coarseRouteGroup(typeof location !== "undefined" ? location.pathname : "/"),
    deviceClass: coarseDeviceClass(typeof window !== "undefined" ? window.innerWidth : undefined),
    navigationType: coarseNavigationType(navType),
  };
}

/** Fire-and-forget агрегиран запис. Никога не влияе на UX. */
async function recordCentral(
  metric: CoreMetric,
  rating: string,
  value: number,
  ctx: PageLoadContext,
): Promise<void> {
  const intValue = toIntegerValue(metric, value);
  if (!isSaneValue(metric, intValue)) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.rpc("record_web_vital_aggregate", {
      _metric: metric,
      _rating: rating,
      _route_group: ctx.routeGroup,
      _device_class: ctx.deviceClass,
      _navigation_type: ctx.navigationType,
      _value: intValue,
    });
  } catch {
    /* network/schema errors are non-critical */
  }
}

export function initWebVitalsReporter(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__lovableVitalsBooted) return;
  (window as any).__lovableVitalsBooted = true;

  const ctx = capturePageLoadContext();
  const sentCentral = new Set<string>();

  const boot = async () => {
    try {
      const { onLCP, onCLS, onINP, onFCP, onTTFB } = await import("web-vitals");
      const handle = (m: { name: string; value: number; rating: string }) => {
        // 1) Локална диагностика — винаги.
        persist({ name: m.name, value: m.value, rating: m.rating, ts: Date.now() });

        // 2) Всичко навън изисква съгласие в момента на callback-а.
        if (!getCategoryConsent("analytics")) return;

        trackEvent("web_vital", {
          metric: m.name,
          rating: m.rating,
          bucket: bucketize(m.name, m.value),
          route_group: ctx.routeGroup,
          device_class: ctx.deviceClass,
          navigation_type: ctx.navigationType,
          value: Math.round(m.name === "CLS" ? m.value * 1000 : m.value),
        });

        if (isCoreMetric(m.name) && !sentCentral.has(m.name)) {
          sentCentral.add(m.name);
          void recordCentral(m.name, m.rating, m.value, ctx);
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
