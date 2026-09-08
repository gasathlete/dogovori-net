/**
 * Stage 2d1b — чисти изчисления и строг разбор на агрегатната справка.
 */
import { describe, expect, it } from "vitest";
import {
  FUNNEL_STAGE_KEYS,
  PURCHASE_KIND_KEYS,
  classifyScorecardError,
  computeCoverage,
  formatCoveredDays,
  parseOwnerScorecard,
  weeklyPace,
} from "@/lib/ownerScorecard";

const CUTOVER = "2026-09-07T22:42:00.000Z";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    truth_schema_version: 1,
    payment_truth_cutover: CUTOVER,
    range: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    funnel: Object.fromEntries(FUNNEL_STAGE_KEYS.map((k) => [k, 0])),
    traffic_context: { tracked_sessions: 0, pageviews: 0 },
    payment_truth: {
      automated_proven_orders_period: 0,
      automated_proven_payers_total: 0,
      legacy_subscription_users_unverified: 3,
      historical_payment_baseline_verified: false,
      proven_payers_total: 0,
      new_proven_payers_period: 0,
      proof_first_order_at: null,
    },
    first_purchase_cohorts: {
      first_mode_subscription_period: 0,
      first_mode_one_time_period: 0,
      first_mode_unknown_period: 0,
      one_time_first_total: 0,
      one_off_to_subscription_total: 0,
      one_off_to_subscription_period: 0,
    },
    purchase_kinds: Object.fromEntries(PURCHASE_KIND_KEYS.map((k) => [k, 0])),
    ...overrides,
  };
}

describe("parseOwnerScorecard", () => {
  it("приема валиден отговор, изцяло с нули, и всичките осем категории", () => {
    const card = parseOwnerScorecard(payload());
    expect(card).not.toBeNull();
    expect(Object.keys(card!.purchaseKinds).sort()).toEqual([...PURCHASE_KIND_KEYS].sort());
    for (const key of PURCHASE_KIND_KEYS) expect(card!.purchaseKinds[key]).toBe(0);
    expect(card!.paymentTruth.historicalPaymentBaselineVerified).toBe(false);
    expect(card!.paymentTruth.legacySubscriptionUsersUnverified).toBe(3);
  });

  it("отхвърля повреден отговор вместо да произвежда нули", () => {
    const cases: unknown[] = [
      null,
      "x",
      [],
      payload({ truth_schema_version: 2 }),
      payload({ purchase_kinds: { team: 1 } }),
      payload({ funnel: {} }),
      payload({ traffic_context: { tracked_sessions: -1, pageviews: 0 } }),
      payload({ range: { from: "not-a-date", to: "2026-10-01T00:00:00.000Z" } }),
      payload({ payment_truth: { ...payload().payment_truth, historical_payment_baseline_verified: "no" } }),
      payload({ payment_truth: { ...payload().payment_truth, proven_payers_total: 1.5 } }),
    ];
    for (const value of cases) expect(parseOwnerScorecard(value)).toBeNull();
  });

  it("не връща никакви идентификатори", () => {
    const card = parseOwnerScorecard(payload());
    const serialized = JSON.stringify(card);
    for (const forbidden of ["session_id", "user_id", "stripe", "journey", "email"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("покритие и темпо", () => {
  it("покритието започва от границата на надеждното измерване", () => {
    const card = parseOwnerScorecard(
      payload({ range: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-21T22:42:00.000Z" } }),
    )!;
    const coverage = computeCoverage(card);
    expect(coverage.coveredDays).toBe(14);
    expect(coverage.coverageFrom).toBe(CUTOVER);
  });

  it("нулева или отрицателна продължителност дава null, не Infinity/NaN", () => {
    const card = parseOwnerScorecard(
      payload({ range: { from: "2026-09-01T00:00:00.000Z", to: CUTOVER } }),
    )!;
    expect(computeCoverage(card).coveredDays).toBeNull();
    expect(weeklyPace(4, null)).toBeNull();
    expect(weeklyPace(4, 0)).toBeNull();
    expect(formatCoveredDays(null)).not.toMatch(/Infinity|NaN/);
  });

  it("темпото се потиска при покритие под 7 дни", () => {
    expect(weeklyPace(3, 6.9)).toBeNull();
    expect(weeklyPace(0, 14)).toBe(0);
    expect(weeklyPace(4, 14)).toBe(2);
  });
});

describe("classifyScorecardError", () => {
  it("различава липсваща функция, отказан достъп и обща грешка", () => {
    expect(classifyScorecardError({ code: "PGRST202", message: "Could not find the function" })).toBe("missing_function");
    expect(classifyScorecardError({ code: "42883" })).toBe("missing_function");
    expect(classifyScorecardError({ code: "42501", message: "forbidden" })).toBe("permission");
    expect(classifyScorecardError({ message: "network unreachable" })).toBe("generic");
  });
});
