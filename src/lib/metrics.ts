/**
 * Единен слой за продуктови метрики (конверсия + качество).
 *
 * Правни принципи (GDPR / ЗЕС чл. 4а):
 *  - Всяко събитие минава през `trackFunnelEvent`, който е consent-gated:
 *    без съгласие за категория "analytics" нищо не се изпраща към GA.
 *  - Записваме САМО псевдонимен `session_id` (случаен UUID в localStorage) и
 *    агрегируеми технически свойства. Никакви лични данни, имейли, имена,
 *    съдържание на документи, IP или свободен текст.
 *  - `sanitizeProps` изхвърля стойности, които не са число/булево/кратък
 *    контролиран етикет, за да е невъзможно случайно изтичане на PII.
 *  - Данните служат за минимизирана статистика: къде спират хората (конверсия)
 *    и дали качеството на документите се запазва (guardrails).
 */
import { trackFunnelEvent } from "@/lib/funnel";
import { readAudience } from "@/lib/audience";

/* -------------------- Санитизация (no-PII by construction) -------------------- */

const MAX_LABEL = 48;
const SAFE_LABEL = /^[a-zA-Z0-9_\-./:]{1,48}$/;

export type MetricProps = Record<string, unknown>;

/** Пропуска само числа, булеви и кратки технически етикети. */
export function sanitizeProps(props?: MetricProps): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = Math.round(v * 100) / 100;
    } else if (typeof v === "boolean") {
      out[k] = v;
    } else if (typeof v === "string") {
      const s = v.trim().slice(0, MAX_LABEL);
      // Само контролирани идентификатори (slug-ове, формати, причини).
      if (SAFE_LABEL.test(s)) out[k] = s;
    }
  }
  return out;
}

/** Общ контекст, добавян към всяко събитие: аудиторен сегмент + тема на устройството. */
function baseContext(): Record<string, number | boolean | string> {
  const ctx: Record<string, number | boolean | string> = { segment: readAudience() };
  try {
    if (typeof window !== "undefined") {
      ctx.viewport = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1200 ? "tablet" : "desktop";
    }
  } catch {
    /* ignore */
  }
  return ctx;
}

/** Ниско ниво: изпраща метрика със санитизирани свойства и общ контекст. */
export function trackMetric(name: string, props?: MetricProps) {
  trackFunnelEvent(name, { ...baseContext(), ...sanitizeProps(props) });
}

/* -------------------- Конверсия -------------------- */

/** Показана страница „Планове" / paywall решение. */
export function trackPlansView(source?: string) {
  trackMetric("plans_view", { source: source ?? "direct" });
}

/** Стартиран Stripe checkout (или отваряне на билинг таб). */
export function trackCheckoutStarted(plan: string, billing: string, source?: string) {
  trackMetric("checkout_started", {
    event: "checkout_started",
    plan,
    billing,
    source: source ?? "plans",
  });
}

/**
 * Неуспешно създаване на checkout сесия. `category` е ограничен етикет от
 * `CHECKOUT_FAILURE_CATEGORIES` — суровото съобщение НИКОГА не се изпраща.
 */
export function trackCheckoutFailed(
  plan: string,
  billing: string,
  category: string,
  source?: string,
) {
  trackMetric("checkout_failed", {
    event: "checkout_failed",
    plan,
    billing,
    category,
    source: source ?? "plans",
  });
}


/** Успешно активиран абонамент. */
export function trackUpgradeCompleted(plan?: string, billing?: string) {
  trackMetric("upgrade_completed", { plan: plan ?? "unknown", billing: billing ?? "unknown" });
}

/** Отказ/затваряне на checkout преди плащане. */
export function trackCheckoutAbandoned(plan?: string, reason?: string) {
  trackMetric("checkout_abandoned", { plan: plan ?? "unknown", reason: reason ?? "closed" });
}

/** Използван ROI калкулатор — силен сигнал за покупателен интерес. */
export function trackRoiUsed(source: string) {
  trackMetric("roi_used", { source });
}

/* -------------------- Качество (guardrails) -------------------- */

export interface QualityReviewSummary {
  verdict: "ready" | "needs_fixes" | "blocked";
  checksPass: number;
  checksTotal: number;
  missing: number;
  contradictions: number;
  unfilled: number;
}

/**
 * Резултат от автоматичната AI ревизия. `score` (0–100) е единният индикатор
 * за техническо качество, който следим да НЕ пада при оптимизации за конверсия.
 */
export function qualityScore(s: QualityReviewSummary): number {
  const passRate = s.checksTotal > 0 ? s.checksPass / s.checksTotal : 1;
  const penalty = s.missing * 6 + s.contradictions * 8 + s.unfilled * 3;
  const base = s.verdict === "ready" ? 100 : s.verdict === "needs_fixes" ? 85 : 60;
  return Math.max(0, Math.min(100, Math.round(base * (0.6 + 0.4 * passRate) - penalty)));
}

export function trackQualityReview(s: QualityReviewSummary, docKey?: string) {
  trackMetric("quality_review_result", {
    verdict: s.verdict,
    score: qualityScore(s),
    issues: s.missing + s.contradictions + s.unfilled,
    checks_pass: s.checksPass,
    checks_total: s.checksTotal,
    doc_key: docKey,
  });
}

/** Спрян експорт заради непопълнени полета — качествен предпазител. */
export function trackPlaceholderBlock(count: number, docKey?: string, resolved?: boolean) {
  trackMetric("placeholder_block", { count, doc_key: docKey, resolved: !!resolved });
}

/** Приложена вълна корекции по документ. */
export function trackCorrectionsApplied(count: number, ops: number, docKey?: string) {
  trackMetric("corrections_applied", { count, ops, doc_key: docKey });
}

/** Провалена AI ревизия (техническа грешка) — следим надеждността. */
export function trackQualityReviewFail(reason?: string) {
  trackMetric("quality_review_fail", { reason: reason ?? "unknown" });
}
