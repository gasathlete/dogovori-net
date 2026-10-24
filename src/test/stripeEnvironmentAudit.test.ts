import { describe, expect, it, vi } from "vitest";
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn() }));
import { resolveStripeEnvironment } from "@/lib/stripe";
describe("explicit Stripe environment", () => {
  it("test prefix routes only to sandbox", () => expect(resolveStripeEnvironment("pk_test_fixture")).toBe("sandbox"));
  it("live prefix routes only to live", () => expect(resolveStripeEnvironment("pk_live_fixture")).toBe("live"));
  it.each([undefined, "", "unknown", "sk_live_fixture"])("missing/unrecognized token never defaults to live: %s", token => {
    expect(() => resolveStripeEnvironment(token)).toThrow();
  });
});