import { render, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { mounted } = vi.hoisted(() => ({ mounted: vi.fn() }));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => { mounted(); return children; },
  EmbeddedCheckout: () => null,
}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => null }));
vi.mock("@/lib/metrics", () => ({ trackCheckoutStarted: vi.fn(), trackCheckoutFailed: vi.fn(), trackCheckoutAbandoned: vi.fn() }));
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
afterEach(() => { cleanup(); mounted.mockClear(); });
it("one-time product mounts payment while subscriptions remain closed", () => {
  render(<StripeEmbeddedCheckout clientSecret="test_secret" analyticsSource="product_checkout" analyticsBilling="one_time" />);
  expect(mounted).toHaveBeenCalledTimes(1);
});
it("subscription payment remains closed", () => {
  render(<StripeEmbeddedCheckout clientSecret="test_secret" analyticsSource="team" analyticsBilling="yearly" />);
  expect(mounted).not.toHaveBeenCalled();
});