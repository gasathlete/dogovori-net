/**
 * checkout_started семантика: събитието означава "реално създадена Stripe сесия",
 * не клик върху карта с план. Тук се проверява преводът price id → plan/billing,
 * който влиза като props в каноничното събитие (без PII).
 */
import { describe, expect, it } from "vitest";
import { describePriceId } from "@/lib/checkoutAnalytics";

describe("describePriceId", () => {
  it("абонаменти: <plan>_<billing>", () => {
    expect(describePriceId("professional_monthly")).toEqual({ plan: "professional", billing: "monthly" });
    expect(describePriceId("entrepreneur_yearly")).toEqual({ plan: "entrepreneur", billing: "yearly" });
    expect(describePriceId("team_yearly")).toEqual({ plan: "team", billing: "yearly" });
  });

  it("top-up пакети са еднократни", () => {
    expect(describePriceId("topup_50")).toEqual({ plan: "topup_50", billing: "one_time" });
    expect(describePriceId("topup_100")).toEqual({ plan: "topup_100", billing: "one_time" });
  });

  it("брандиране е еднократно", () => {
    expect(describePriceId("branding_onetime")).toEqual({ plan: "branding", billing: "one_time" });
    expect(describePriceId("branding")).toEqual({ plan: "branding", billing: "one_time" });
  });

  it("липсващ или непознат price id → технически етикет, никога PII", () => {
    expect(describePriceId(undefined)).toEqual({ plan: "unknown", billing: "unknown" });
    expect(describePriceId("")).toEqual({ plan: "unknown", billing: "unknown" });
    const r = describePriceId("price_1Q" + "x".repeat(60));
    expect(r.billing).toBe("unknown");
    expect(r.plan.length).toBeLessThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// StripeEmbeddedCheckout: checkout_started се изпраща точно веднъж и едва когато
// има реална checkout сесия (client secret), не при монтиране/рендер.
// ---------------------------------------------------------------------------
import * as React from "react";
import { render, waitFor } from "@testing-library/react";
import { vi, beforeEach } from "vitest";

const { trackCheckoutStartedMock, fetchers } = vi.hoisted(() => ({
  trackCheckoutStartedMock: vi.fn(),
  fetchers: [] as Array<() => Promise<string>>,
}));

vi.mock("@/lib/metrics", () => ({ trackCheckoutStarted: trackCheckoutStartedMock }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => null, getStripeEnvironment: () => "test" }));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({ options, children }: { options: { fetchClientSecret: () => Promise<string> }; children: React.ReactNode }) => {
    fetchers.push(options.fetchClientSecret);
    return <div data-testid="provider">{children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="checkout" />,
}));

const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";

describe("StripeEmbeddedCheckout → checkout_started", () => {
  beforeEach(() => {
    trackCheckoutStartedMock.mockReset();
    invokeMock.mockReset();
    fetchers.length = 0;
  });

  it("не изпраща нищо само от рендер", () => {
    render(<StripeEmbeddedCheckout priceId="professional_monthly" returnUrl="/r" analyticsSource="account_subscription" />);
    expect(trackCheckoutStartedMock).not.toHaveBeenCalled();
  });

  it("създадена сесия → едно събитие с plan/billing/source; повторно извикване не удвоява", async () => {
    invokeMock.mockResolvedValue({ data: { clientSecret: "cs_test_1" }, error: null });
    render(<StripeEmbeddedCheckout priceId="professional_monthly" returnUrl="/r" analyticsSource="account_subscription" />);
    expect(fetchers.length).toBeGreaterThan(0);
    await expect(fetchers[0]()).resolves.toBe("cs_test_1");
    await fetchers[0]();
    await waitFor(() => expect(trackCheckoutStartedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutStartedMock).toHaveBeenCalledWith("professional", "monthly", "account_subscription");
  });

  it("неуспешно създаване на сесия → без събитие", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<StripeEmbeddedCheckout priceId="topup_50" returnUrl="/r" analyticsSource="topup" />);
    await expect(fetchers[0]()).rejects.toThrow();
    expect(trackCheckoutStartedMock).not.toHaveBeenCalled();
  });

  it("подаден clientSecret (напр. Екип) → събитие със source и без plan (unknown)", async () => {
    render(<StripeEmbeddedCheckout clientSecret="cs_team" analyticsSource="team" />);
    await fetchers[0]();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(trackCheckoutStartedMock).toHaveBeenCalledTimes(1);
    expect(trackCheckoutStartedMock).toHaveBeenCalledWith("unknown", "unknown", "team");
  });
});
