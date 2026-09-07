/**
 * Чисти функции за обобщаване на агрегираните полеви данни (web_vitals_daily).
 *
 * От агрегати не може да се изчисли точен p75, затова връщаме БАНД според
 * кумулативните рейтинги (правилото на CrUX):
 *   good >= 75%                 → Good
 *   good + needs-improvement >= 75% → Needs improvement
 *   иначе                        → Poor
 */

import type { CoreMetric, DeviceClass, RatingClass } from "./dimensions";

export interface DailyRow {
  metric: string;
  rating: string;
  device_class: string;
  sample_count: number;
  value_sum: number;
}

export type P75Band = "good" | "needs-improvement" | "poor" | "unknown";

export interface MetricSummary {
  metric: CoreMetric;
  samples: number;
  /** Нормализирана средна стойност: ms за LCP/INP, безразмерна за CLS. */
  average: number | null;
  goodRate: number | null;
  p75Band: P75Band;
  byDevice: Record<DeviceClass, { samples: number; goodRate: number | null }>;
}

const RATINGS: RatingClass[] = ["good", "needs-improvement", "poor"];

/**
 * Първият UTC ден (ISO yyyy-mm-dd) на прозорец от `days` дни, който ВКЛЮЧВА
 * днешния ден: 7 → днес + предходните 6 UTC дати, 30 → днес + предходните 29.
 * Колоната `day` се пише в UTC, затова и тук смятаме само в UTC.
 */
export function windowStartDay(days: number, now: number = Date.now()): string {
  const span = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (span - 1));
  return d.toISOString().slice(0, 10);
}

/** ms за LCP/INP; CLS се дели на 1000 обратно към оригиналната скала. */
export function denormalize(metric: CoreMetric, intValue: number): number {
  return metric === "CLS" ? intValue / 1000 : intValue;
}

export function p75Band(counts: Record<RatingClass, number>): P75Band {
  const total = RATINGS.reduce((s, r) => s + (counts[r] || 0), 0);
  if (total <= 0) return "unknown";
  const good = (counts.good || 0) / total;
  if (good >= 0.75) return "good";
  const ni = good + (counts["needs-improvement"] || 0) / total;
  if (ni >= 0.75) return "needs-improvement";
  return "poor";
}

export function summarizeMetric(rows: DailyRow[], metric: CoreMetric): MetricSummary {
  const mine = rows.filter((r) => r.metric === metric);
  const counts: Record<RatingClass, number> = { good: 0, "needs-improvement": 0, poor: 0 };
  const byDevice: MetricSummary["byDevice"] = {
    mobile: { samples: 0, goodRate: null },
    tablet: { samples: 0, goodRate: null },
    desktop: { samples: 0, goodRate: null },
  };
  const deviceGood: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 };

  let samples = 0;
  let sum = 0;
  for (const r of mine) {
    const n = Number(r.sample_count) || 0;
    if (n <= 0) continue;
    samples += n;
    sum += Number(r.value_sum) || 0;
    if (r.rating === "good" || r.rating === "needs-improvement" || r.rating === "poor") {
      counts[r.rating] += n;
    }
    const d = r.device_class;
    if (d === "mobile" || d === "tablet" || d === "desktop") {
      byDevice[d].samples += n;
      if (r.rating === "good") deviceGood[d] += n;
    }
  }

  for (const d of ["mobile", "tablet", "desktop"] as DeviceClass[]) {
    byDevice[d].goodRate = byDevice[d].samples > 0 ? deviceGood[d] / byDevice[d].samples : null;
  }

  return {
    metric,
    samples,
    average: samples > 0 ? denormalize(metric, sum / samples) : null,
    goodRate: samples > 0 ? counts.good / samples : null,
    p75Band: p75Band(counts),
  byDevice,
  };
}

export function formatMetricValue(metric: CoreMetric, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return metric === "CLS" ? value.toFixed(3) : `${Math.round(value)} ms`;
}
