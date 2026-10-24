import { describe, it, expect } from "vitest";
import { requireSubscriptionPrice, SUBSCRIPTION_PRICES } from "../../supabase/functions/_shared/canonical-subscription";
import { PRICING_PLANS } from "@/lib/pricing";
const price = { active: true, lookup_key: "professional_monthly", type: "recurring", currency: "eur", unit_amount: 1290, recurring: { interval: "month", interval_count: 1 } };
describe("exact canonical subscription checkout", () => {
  it("matches current canonical plans without changing prices", () => {
    for (const id of ["professional", "entrepreneur"] as const) {
      const p = PRICING_PLANS[id];
      expect(SUBSCRIPTION_PRICES[`${id}_monthly`].amount).toBe(Math.round((p.monthly ?? 0)*100));
      expect(SUBSCRIPTION_PRICES[`${id}_yearly`].amount).toBe(Math.round((p.yearly ?? 0)*100));
    }
  });
  it("accepts EUR 1290 monthly quantity one", () => expect(requireSubscriptionPrice([price], price.lookup_key)).toBe(price));
  it.each([{ currency: "usd" }, { unit_amount: 990 }, { recurring: { interval: "year", interval_count: 1 } }, { recurring: { interval: "month", interval_count: 2 } }, { active: false }])("rejects mismatch %j", patch => expect(() => requireSubscriptionPrice([{ ...price, ...patch }], price.lookup_key)).toThrow());
  it("rejects quantity two", () => expect(() => requireSubscriptionPrice([price], price.lookup_key, 2)).toThrow());
});