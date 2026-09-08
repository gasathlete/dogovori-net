/**
 * Stage 2d1b — типизиран разбор и чисти изчисления за /admin/scorecard.
 *
 * Отговорности:
 *  - строг разбор на отговора на агрегатната RPC `owner_scorecard`;
 *  - чисти изчисления за показване (покритие на периода, седмично темпо);
 *  - класификация на грешките от RPC без изнасяне на сурови съобщения.
 *
 * Принципи:
 *  - непълен/повреден отговор НЕ се превръща в нули — връща се `null`, а
 *    интерфейсът показва обща недостъпност;
 *  - никакви идентификатори, суми или норми не се произвеждат тук;
 *  - никакви странични ефекти (без analytics, без мрежа).
 */

export const OWNER_SCORECARD_SCHEMA_VERSION = 1;

export type ScorecardRangeKey = "7d" | "30d" | "90d";

export const SCORECARD_RANGE_DAYS: Record<ScorecardRangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const FUNNEL_STAGE_KEYS = [
  "doc_start",
  "result_viewed",
  "signup_or_claim",
  "checkout_started",
  "confirmed_checkout_return",
  "doc_download_success",
] as const;

export type FunnelStageKey = (typeof FUNNEL_STAGE_KEYS)[number];

export const PURCHASE_KIND_KEYS = [
  "team",
  "subscription",
  "strict_unlock",
  "branding",
  "entry_pack",
  "topup",
  "one_time",
  "unknown",
] as const;

export type PurchaseKindKey = (typeof PURCHASE_KIND_KEYS)[number];

export interface OwnerScorecard {
  truthSchemaVersion: number;
  paymentTruthCutover: string;
  range: { from: string; to: string };
  funnel: Record<FunnelStageKey, number>;
  trafficContext: { trackedSessions: number; pageviews: number };
  paymentTruth: {
    automatedProvenOrdersPeriod: number;
    automatedProvenPayersTotal: number;
    legacySubscriptionUsersUnverified: number;
    historicalPaymentBaselineVerified: boolean;
    provenPayersTotal: number;
    newProvenPayersPeriod: number;
    proofFirstOrderAt: string | null;
  };
  firstPurchaseCohorts: {
    firstModeSubscriptionPeriod: number;
    firstModeOneTimePeriod: number;
    firstModeUnknownPeriod: number;
    oneTimeFirstTotal: number;
    oneOffToSubscriptionTotal: number;
    oneOffToSubscriptionPeriod: number;
  };
  purchaseKinds: Record<PurchaseKindKey, number>;
}

type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Dict;
}

/**
 * Броячите трябва да са истински JSON числа — цели, безопасни и неотрицателни.
 * Низове (включително празен низ или „ "), булеви стойности, null и NaN се
 * отхвърлят, за да не се произвежда измислена нула.
 */
function asCount(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function asTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Максимално допустима заявена продължителност на периода. */
const MAX_RANGE_DAYS = 366;

function readCounts<K extends string>(source: Dict, keys: readonly K[]): Record<K, number> | null {
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const parsed = asCount(source[key]);
    if (parsed === null) return null;
    out[key] = parsed;
  }
  return out;
}

/** Строг разбор. Връща `null` при всяко отклонение от очакваната схема. */
export function parseOwnerScorecard(raw: unknown): OwnerScorecard | null {
  const root = asDict(raw);
  if (!root) return null;

  if (root.truth_schema_version !== OWNER_SCORECARD_SCHEMA_VERSION) return null;

  const cutover = asTimestamp(root.payment_truth_cutover);
  if (!cutover) return null;

  const rangeRaw = asDict(root.range);
  const rangeFrom = rangeRaw ? asTimestamp(rangeRaw.from) : null;
  const rangeTo = rangeRaw ? asTimestamp(rangeRaw.to) : null;
  if (!rangeFrom || !rangeTo) return null;
  // Периодът трябва да е с нарастващи, крайни граници и разумна дължина.
  // Период изцяло преди началото на надеждното измерване е валиден: тогава
  // покритието е null, а не грешка.
  const fromMs = Date.parse(rangeFrom);
  const toMs = Date.parse(rangeTo);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  if (!(fromMs < toMs)) return null;
  if (toMs - fromMs > MAX_RANGE_DAYS * 86_400_000) return null;

  const funnelRaw = asDict(root.funnel);
  const funnel = funnelRaw ? readCounts(funnelRaw, FUNNEL_STAGE_KEYS) : null;
  if (!funnel) return null;

  const trafficRaw = asDict(root.traffic_context);
  const traffic = trafficRaw ? readCounts(trafficRaw, ["tracked_sessions", "pageviews"] as const) : null;
  if (!traffic) return null;

  const truthRaw = asDict(root.payment_truth);
  if (!truthRaw) return null;
  const truthCounts = readCounts(truthRaw, [
    "automated_proven_orders_period",
    "automated_proven_payers_total",
    "legacy_subscription_users_unverified",
    "proven_payers_total",
    "new_proven_payers_period",
  ] as const);
  if (!truthCounts) return null;
  if (typeof truthRaw.historical_payment_baseline_verified !== "boolean") return null;
  const proofFirst = truthRaw.proof_first_order_at;
  const proofFirstOrderAt = proofFirst === null || proofFirst === undefined ? null : asTimestamp(proofFirst);
  if (proofFirst !== null && proofFirst !== undefined && proofFirstOrderAt === null) return null;

  const cohortsRaw = asDict(root.first_purchase_cohorts);
  const cohorts = cohortsRaw
    ? readCounts(cohortsRaw, [
        "first_mode_subscription_period",
        "first_mode_one_time_period",
        "first_mode_unknown_period",
        "one_time_first_total",
        "one_off_to_subscription_total",
        "one_off_to_subscription_period",
      ] as const)
    : null;
  if (!cohorts) return null;

  const kindsRaw = asDict(root.purchase_kinds);
  const purchaseKinds = kindsRaw ? readCounts(kindsRaw, PURCHASE_KIND_KEYS) : null;
  if (!purchaseKinds) return null;

  return {
    truthSchemaVersion: OWNER_SCORECARD_SCHEMA_VERSION,
    paymentTruthCutover: cutover,
    range: { from: rangeFrom, to: rangeTo },
    funnel,
    trafficContext: { trackedSessions: traffic.tracked_sessions, pageviews: traffic.pageviews },
    paymentTruth: {
      automatedProvenOrdersPeriod: truthCounts.automated_proven_orders_period,
      automatedProvenPayersTotal: truthCounts.automated_proven_payers_total,
      legacySubscriptionUsersUnverified: truthCounts.legacy_subscription_users_unverified,
      historicalPaymentBaselineVerified: truthRaw.historical_payment_baseline_verified,
      provenPayersTotal: truthCounts.proven_payers_total,
      newProvenPayersPeriod: truthCounts.new_proven_payers_period,
      proofFirstOrderAt,
    },
    firstPurchaseCohorts: {
      firstModeSubscriptionPeriod: cohorts.first_mode_subscription_period,
      firstModeOneTimePeriod: cohorts.first_mode_one_time_period,
      firstModeUnknownPeriod: cohorts.first_mode_unknown_period,
      oneTimeFirstTotal: cohorts.one_time_first_total,
      oneOffToSubscriptionTotal: cohorts.one_off_to_subscription_total,
      oneOffToSubscriptionPeriod: cohorts.one_off_to_subscription_period,
    },
    purchaseKinds,
  };
}

export interface ScorecardCoverage {
  /** Дни, в които периодът е покрит от надеждното измерване на плащанията. */
  coveredDays: number | null;
  /** Начало на покритието = max(range.from, payment_truth_cutover). */
  coverageFrom: string | null;
}

/**
 * Покритие = [max(range.from, cutover), range.to). Нулева или отрицателна
 * продължителност дава `null`, никога Infinity/NaN.
 */
export function computeCoverage(card: OwnerScorecard): ScorecardCoverage {
  const from = Date.parse(card.range.from);
  const to = Date.parse(card.range.to);
  const cutover = Date.parse(card.paymentTruthCutover);
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(cutover)) {
    return { coveredDays: null, coverageFrom: null };
  }
  const start = Math.max(from, cutover);
  const ms = to - start;
  if (!(ms > 0)) return { coveredDays: null, coverageFrom: new Date(start).toISOString() };
  return { coveredDays: ms / 86_400_000, coverageFrom: new Date(start).toISOString() };
}

/**
 * Седмично операционно темпо на новите платили клиенти.
 * Потиска се напълно при покритие под 7 дни или липсващ знаменател.
 */
export function weeklyPace(newPayersPeriod: number, coveredDays: number | null): number | null {
  if (coveredDays === null || !Number.isFinite(coveredDays) || coveredDays < 7) return null;
  if (!Number.isFinite(newPayersPeriod) || newPayersPeriod < 0) return null;
  const pace = (newPayersPeriod * 7) / coveredDays;
  return Number.isFinite(pace) ? Math.round(pace * 10) / 10 : null;
}

/** Оперативен ориентир за темпо — НЕ е целта за абонати. */
export const WEEKLY_PACE_REFERENCE = 5;

/** Целта е за абонати; текущият брой абонати НЕ идва от тази RPC. */
export const SUBSCRIBER_GOAL = 60;

export type ScorecardErrorKind = "permission" | "missing_function" | "generic";

/** Класификация без изнасяне на сурови съобщения или SQL в интерфейса. */
export function classifyScorecardError(error: unknown): ScorecardErrorKind {
  const dict = asDict(error);
  const code = typeof dict?.code === "string" ? dict.code : "";
  const message = typeof dict?.message === "string" ? dict.message.toLowerCase() : "";
  if (code === "42883" || code === "PGRST202" || message.includes("could not find the function") || message.includes("does not exist")) {
    return "missing_function";
  }
  if (code === "42501" || code === "P0001" || message.includes("forbidden") || message.includes("permission denied") || message.includes("insufficient")) {
    return "permission";
  }
  return "generic";
}

/** Човешка българска дата и час с часова зона. */
export function formatBgDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const formatted = new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Sofia",
  }).format(new Date(ms));
  return `${formatted} ч. (часова зона Европа/София)`;
}

export function formatCoveredDays(coveredDays: number | null): string {
  if (coveredDays === null) return "няма покрит период";
  const rounded = Math.round(coveredDays * 10) / 10;
  return `${rounded.toLocaleString("bg-BG")} дни`;
}
