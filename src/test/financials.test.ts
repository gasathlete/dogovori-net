import { describe, it, expect } from "vitest";
import { computeScenario } from "@/lib/financials/scenarios";
import { DEFAULT_SCENARIOS } from "@/lib/financials/assumptions";

describe("financial scenarios (funnel)", () => {
  it("baseline yields realistic funnel + positive profit", () => {
    const r = computeScenario(DEFAULT_SCENARIOS[1]);
    expect(r.new_signups).toBeGreaterThan(0);
    expect(r.new_paid).toBeGreaterThan(0);
    expect(r.mrr_net).toBeGreaterThan(0);
    expect(r.gross_margin_pct).toBeGreaterThan(50);
  });

  it("doubling signup→paid conversion roughly doubles new_paid", () => {
    const base = DEFAULT_SCENARIOS[1];
    const a = computeScenario(base);
    const b = computeScenario({ ...base, signup_to_paid_pct: base.signup_to_paid_pct * 2 });
    expect(b.new_paid).toBeGreaterThanOrEqual(a.new_paid * 1.8);
  });

  it("zero visitors + zero existing users → only fixed costs", () => {
    const r = computeScenario({
      ...DEFAULT_SCENARIOS[0],
      monthly_visitors: 0,
      existing_free_users: 0,
      existing_paid_users: 0,
    });
    expect(r.mrr_net).toBe(0);
    expect(r.net_profit).toBe(-DEFAULT_SCENARIOS[0].fixed_costs_eur);
  });

  it("LTV:CAC computed from ARPU, margin and churn", () => {
    const r = computeScenario(DEFAULT_SCENARIOS[2]);
    expect(r.ltv_cac_ratio).toBeGreaterThan(0);
    expect(r.payback_months).toBeGreaterThan(0);
  });

  it("optimistic > baseline > conservative on MRR", () => {
    const [c, b, o] = DEFAULT_SCENARIOS.map((s) => computeScenario(s));
    expect(o.mrr_net).toBeGreaterThan(b.mrr_net);
    expect(b.mrr_net).toBeGreaterThan(c.mrr_net);
  });
});
