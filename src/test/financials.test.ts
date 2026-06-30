import { describe, it, expect } from "vitest";
import { computeScenario } from "@/lib/financials/scenarios";
import { DEFAULT_SCENARIOS } from "@/lib/financials/assumptions";

describe("financial scenarios", () => {
  it("baseline produces positive net profit", () => {
    const r = computeScenario(DEFAULT_SCENARIOS[1]);
    expect(r.mrr_net).toBeGreaterThan(0);
    expect(r.ai_cost).toBeGreaterThan(0);
    expect(r.net_profit).toBeGreaterThan(0);
    expect(r.gross_margin_pct).toBeGreaterThan(50);
  });

  it("zero users → costs equal fixed costs only", () => {
    const r = computeScenario({ ...DEFAULT_SCENARIOS[0], active_users: 0 });
    expect(r.mrr_net).toBe(0);
    expect(r.ai_cost).toBe(0);
    expect(r.net_profit).toBe(-DEFAULT_SCENARIOS[0].fixed_costs_eur);
  });

  it("optimistic > baseline > conservative on MRR", () => {
    const [c, b, o] = DEFAULT_SCENARIOS.map((s) => computeScenario(s));
    expect(o.mrr_net).toBeGreaterThan(b.mrr_net);
    expect(b.mrr_net).toBeGreaterThan(c.mrr_net);
  });

  it("ARR = MRR × 12", () => {
    const r = computeScenario(DEFAULT_SCENARIOS[1]);
    expect(r.arr_net).toBeCloseTo(r.mrr_net * 12, 2);
  });
});
