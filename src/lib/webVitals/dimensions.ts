/**
 * Чисти помощни функции за privacy-minimal измерения на Web Vitals.
 *
 * Никога не пропускаме суров pathname, идентификатори, токени или query
 * параметри навън: всичко се свежда до груби, неидентифициращи категории.
 */

export const CORE_METRICS = ["LCP", "INP", "CLS"] as const;
export type CoreMetric = (typeof CORE_METRICS)[number];

export const ROUTE_GROUPS = [
  "home",
  "template",
  "blog",
  "category",
  "sector",
  "tool",
  "wizard",
  "start",
  "auth",
  "plans",
  "legal",
  "other",
] as const;
export type RouteGroup = (typeof ROUTE_GROUPS)[number];

export type DeviceClass = "mobile" | "tablet" | "desktop";
export type NavigationTypeClass = "navigate" | "reload" | "back-forward" | "prerender" | "other";

const LEGAL_PATHS = new Set([
  "/legal",
  "/terms",
  "/privacy",
  "/cookies",
  "/refund",
  "/contacts",
  "/provider-info",
  "/withdrawal-form",
  "/dpa",
]);

/** true за метрика, която пазим централно (агрегирано). */
export function isCoreMetric(name: string): name is CoreMetric {
  return (CORE_METRICS as readonly string[]).includes(name);
}

/**
 * Свежда pathname до груба кофа. Всичко лично/динамично
 * (/document/:id, /share/:token, /sign/:token, /uploaded/:id, account,
 * admin, console, team, workspace ...) отива в "other".
 */
export function coarseRouteGroup(rawPath: string | undefined | null): RouteGroup {
  if (!rawPath || typeof rawPath !== "string") return "other";
  // Отрязваме query/hash и езиковия префикс.
  let p = rawPath.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/^\/en(?=\/|$)/, "") || "/";
  const lower = p.toLowerCase().replace(/\/+$/, "") || "/";

  if (lower === "/") return "home";
  if (LEGAL_PATHS.has(lower) || lower.startsWith("/legal/")) return "legal";
  if (lower === "/start") return "start";
  if (lower === "/auth" || lower === "/reset-password") return "auth";
  if (lower === "/plans") return "plans";
  if (lower.startsWith("/shablon/")) return "template";
  if (lower.startsWith("/blog")) return "blog";
  if (lower === "/catalog" || lower.startsWith("/kategoria/")) return "category";
  if (lower.startsWith("/sektor/")) return "sector";
  if (lower === "/tools" || lower.startsWith("/tools/") || lower.startsWith("/kalkulator")) return "tool";
  if (lower.startsWith("/wizard") || lower === "/build") return "wizard";
  return "other";
}

/** Груб клас на устройството само от viewport (без user agent). */
export function coarseDeviceClass(width: number | undefined): DeviceClass {
  const w = typeof width === "number" && Number.isFinite(width) ? width : 0;
  if (w > 0 && w < 768) return "mobile";
  if (w >= 768 && w < 1200) return "tablet";
  return "desktop";
}

/** Allow-list за типа навигация. */
export function coarseNavigationType(t: string | undefined | null): NavigationTypeClass {
  switch (t) {
    case "navigate":
    case "reload":
    case "prerender":
      return t;
    case "back-forward":
    case "back_forward":
      return "back-forward";
    default:
      return "other";
  }
}

/** Единствената допустима сурова стойност: крайно число >= 0. */
export function isValidRawValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Цяло число за базата: ms за LCP/INP, CLS × 1000.
 *
 * Използваме таван (ceil), а не закръгляне: за реално v и цял праг T важи
 * v <= T ⇔ ceil(v) <= T, така рейтингът на web-vitals (сравнение „<=“ върху
 * суровата стойност) винаги съвпада с рейтинга, изведен от цялата стойност.
 * Преди тавана махаме шума от плаваща запетая (0.057 × 1000 = 57.00000000000001).
 *
 * FAIL CLOSED: невалиден вход (NaN, ±Infinity, отрицателна стойност) връща NaN,
 * а не 0 — иначе повредена проба щеше да се запише като идеален резултат.
 * `isSaneValue` отхвърля NaN, така че такава проба не напуска браузъра.
 */
export function toIntegerValue(metric: CoreMetric, value: number): number {
  if (!isValidRawValue(value)) return Number.NaN;
  const scaled = metric === "CLS" ? value * 1000 : value;
  return Math.ceil(Math.round(scaled * 1e6) / 1e6);
}

/** Горна граница на разумните стойности (същата като в SQL валидацията). */
export const VALUE_MAX: Record<CoreMetric, number> = {
  LCP: 600000,
  INP: 600000,
  CLS: 10000,
};

export function isSaneValue(metric: CoreMetric, intValue: number): boolean {
  return Number.isInteger(intValue) && intValue >= 0 && intValue <= VALUE_MAX[metric];
}

export type RatingClass = "good" | "needs-improvement" | "poor";

export function isRating(r: unknown): r is RatingClass {
  return r === "good" || r === "needs-improvement" || r === "poor";
}

/**
 * Актуални прагове на Web Vitals върху нормализираната цяла скала —
 * включителни („<=“), същите като в SQL валидацията на RPC-то:
 *   LCP good <= 2500 ms, needs-improvement <= 4000 ms
 *   INP good <= 200 ms,  needs-improvement <= 500 ms
 *   CLS good <= 100 (0.100), needs-improvement <= 250 (0.250)
 */
export const CORE_THRESHOLDS: Record<CoreMetric, readonly [good: number, needsImprovement: number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [100, 250],
};

/** Рейтинг, изведен от нормализираната цяла стойност (точно 2500/200/100 → good). */
export function ratingForValue(metric: CoreMetric, intValue: number): RatingClass {
  const [good, needsImprovement] = CORE_THRESHOLDS[metric];
  if (intValue <= good) return "good";
  if (intValue <= needsImprovement) return "needs-improvement";
  return "poor";
}
