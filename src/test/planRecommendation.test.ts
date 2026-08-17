import { describe, expect, it } from "vitest";
import { recommendPlan } from "@/hooks/usePlanRecommendation";
import type { PlanView } from "@/hooks/usePlans";

const plans = [
  { id: "free", ops_cap_monthly: 2 },
  { id: "professional", ops_cap_monthly: 50 },
  { id: "entrepreneur", ops_cap_monthly: 100 },
  { id: "team", ops_cap_monthly: 100, seat_min: 3 },
] as unknown as PlanView[];

describe("recommendPlan", () => {
  it("препоръчва Безплатен само при много малък обем", () => {
    expect(recommendPlan(plans, 1)).toBe("free");
    expect(recommendPlan(plans, 2)).toBe("free");
  });

  it("препоръчва Професионалист при 3–4 документа", () => {
    expect(recommendPlan(plans, 3)).toBe("professional");
    expect(recommendPlan(plans, 4)).toBe("professional");
  });

  it("препоръчва Предприемач за типичния обем", () => {
    for (const docs of [5, 8, 12, 20, 33]) {
      expect(recommendPlan(plans, docs)).toBe("entrepreneur");
    }
  });

  it("препоръчва Екип при обем над капацитета на Предприемач", () => {
    expect(recommendPlan(plans, 40)).toBe("team");
  });
});
