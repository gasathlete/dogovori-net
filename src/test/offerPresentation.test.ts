import { describe, expect, it } from "vitest";
import { offerSaving } from "@/lib/offerPresentation";

describe("verified offer savings in EUR", () => {
  it("check uses the owner's 3.99 → 2.99 reference prices", () => {
    expect(offerSaving(2.99, 3.99)).toBe(1);
  });
  it("improve uses the owner's 4.99 → 3.99 reference prices", () => {
    expect(offerSaving(3.99, 4.99)).toBe(1);
  });
  it("negotiation uses the owner's 9.99 → 7.99 reference prices", () => {
    expect(offerSaving(7.99, 9.99)).toBe(2);
  });
  it("does not invent a discount without a higher valid reference price", () => {
    expect(offerSaving(2.99, 2.99)).toBe(0);
    expect(offerSaving(2.99, 1.99)).toBe(0);
    expect(offerSaving(2.99, NaN)).toBe(0);
  });
});