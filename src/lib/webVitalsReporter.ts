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
 * LCP / INP / CLS are persisted centrally (aggregate only, once per metric
 * lifecycle). FCP / TTFB stay local + consent-gated GA.
 *
 * Loaded lazily on idle so it never competes with hydration or the LCP paint.
 */

import type { Metric } from "web-vitals";
import { trackEvent, getCategoryConsent } from "@/lib/analytics";
import type { RecordWebVitalAggregateArgs } from "@/lib/webVitals/pendingSchema";
import {
  coarseDeviceClass,
  coarseNavigationType,
  coarseRouteGroup,
  isCoreMetric,
  isRating,
  isSaneValue,
  isValidRawValue,
  ratingForValue,
  toIntegerValue,
  type CoreMetric,
  type DeviceClass,
  type NavigationTypeClass,
  type RouteGroup,
} from "@/lib/webVitals/dimensions";

declare global {
  interface Window {
    /** Гард срещу двойно стартиране на репортера (HMR, повторен mount). */
    __lovableVitalsBooted?: boolean;
  }
}

const KEY = "dogovori:perf-log";
const MAX_ROWS = 100;

type Row = { name: string; value: number; rating: string; ts: number };

/** Минималният вид на метриката, който ни трябва от web-vitals. */
type MetricSample = Pick<Metric, "name" | "value"> & { rating: string };

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

/** Аргументите на типизирания RPC — точно това, което напуска браузъра. */
export type CentralArgs = RecordWebVitalAggregateArgs;

/**
 * Клиентска валидация, огледална на RPC-то: крайна неотрицателна стойност,
 * allow-list рейтинг, разумни граници и съответствие рейтинг ↔ стойност по
 * включителните прагове на Web Vitals. FAIL CLOSED — при каквото и да е
 * несъответствие връща null и навън не отива нищо.
 */
export function prepareCentralArgs(
  metric: CoreMetric,
  rating: unknown,
  value: number,
  ctx: PageLoadContext,
): CentralArgs | null {
  if (!isValidRawValue(value)) return null;
  const intValue = toIntegerValue(metric, value);
  if (!isSaneValue(metric, intValue)) return null;
  if (!isRating(rating) || ratingForValue(metric, intValue) !== rating) return null;
  return {
    _metric: metric,
    _rating: rating,
    _route_group: ctx.routeGroup,
    _device_class: ctx.deviceClass,
    _navigation_type: ctx.navigationType,
    _value: intValue,
  };
}

/** Fire-and-forget агрегиран запис. Никога не влияе на UX. */
async function recordCentral(args: CentralArgs): Promise<void> {
  try {
    const { webVitalsClient } = await import("@/lib/webVitals/pendingSchema");
    await webVitalsClient.rpc("record_web_vital_aggregate", args);
  } catch {
    /* network/schema errors are non-critical */
  }
}

export function initWebVitalsReporter(): void {
  if (typeof window === "undefined") return;
  if (window.__lovableVitalsBooted) return;
  window.__lovableVitalsBooted = true;

  const ctx = capturePageLoadContext();
  const sentCentral = new Set<CoreMetric>();

  const boot = async (): Promise<void> => {
    try {
      const { onLCP, onCLS, onINP, onFCP, onTTFB } = await import("web-vitals");
      const handle = (m: MetricSample) => {
        // 1) Локална диагностика — винаги (включително за повредени проби).
        persist({ name: m.name, value: m.value, rating: m.rating, ts: Date.now() });

        // 2) Всичко навън изисква съгласие в момента на callback-а.
        if (!getCategoryConsent("analytics")) return;

        const name: string = m.name;
        const coreName: CoreMetric | null = isCoreMetric(name) ? name : null;

        if (coreName) {
          // FAIL CLOSED: невалидна стойност или рейтинг, който не съответства
          // на прага → пробата остава само локална диагностика.
          const args = prepareCentralArgs(coreName, m.rating, m.value, ctx);
          if (!args) return;
          trackEvent("web_vital", {
            metric: coreName,
            rating: args._rating,
            bucket: bucketize(coreName, m.value),
            route_group: ctx.routeGroup,
            device_class: ctx.deviceClass,
            navigation_type: ctx.navigationType,
            value: args._value,
          });
          // 3) LCP/INP/CLS — централно, най-много веднъж на метрика за това зареждане.
          if (!sentCentral.has(coreName)) {
            sentCentral.add(coreName);
            void recordCentral(args);
          }
          return;
        }

        // 4) FCP/TTFB — само аналитика, и само при крайна неотрицателна
        //    стойност и рейтинг от allow-list-а.
        if (!isValidRawValue(m.value) || !isRating(m.rating)) return;
        trackEvent("web_vital", {
          metric: name,
          rating: m.rating,
          bucket: bucketize(name, m.value),
          route_group: ctx.routeGroup,
          device_class: ctx.deviceClass,
          navigation_type: ctx.navigationType,
          value: Math.round(m.value),
        });
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

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => void boot(), { timeout: 5000 });
  } else {
    setTimeout(() => void boot(), 2500);
  }
}

type Bucket = "good" | "ni" | "poor" | "n/a";

/** Прагове за неосновните метрики — включителни („<=“), както при core. */
const AUX_THRESHOLDS: Record<string, readonly [number, number]> = {
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/**
 * Кофа за аналитиката. За LCP/INP/CLS използва същите включителни прагове
 * като централния запис, така че точно 2500 ms / 200 ms / 0.100 са "good".
 * Невалидна стойност (NaN, ±Infinity, отрицателна) или непозната метрика
 * дават "n/a" — никога "good".
 */
export function bucketize(name: string, value: number): Bucket {
  if (!isValidRawValue(value)) return "n/a";
  if (isCoreMetric(name)) {
    const r = ratingForValue(name, toIntegerValue(name, value));
    return r === "needs-improvement" ? "ni" : r;
  }
  const t = AUX_THRESHOLDS[name];
  if (!t) return "n/a";
  if (value <= t[0]) return "good";
  if (value <= t[1]) return "ni";
  return "poor";
}
