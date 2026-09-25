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

vi.mock("@/lib/metrics", () => ({
  trackCheckoutStarted: trackCheckoutStartedMock,
  trackCheckoutFailed: vi.fn(),
  trackCheckoutAbandoned: vi.fn(),
  trackMetric: vi.fn(),
}));
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

  it("подаден clientSecret (напр. Екип) → събитие с изричните plan/billing и source", async () => {
    render(<StripeEmbeddedCheckout clientSecret="cs_team" analyticsSource="team" analyticsPlan="team" analyticsBilling="yearly" />);
    await fetchers[0]();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(trackCheckoutStartedMock).toHaveBeenCalledTimes(1);
    expect(trackCheckoutStartedMock).toHaveBeenCalledWith("team", "yearly", "team");
  });
});

// ---------------------------------------------------------------------------
// Статична проверка: всички платени пътища минават през общия маршрут
// /checkout/return с описател от allowlist-а (Stage 2b1).
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";

// Изолирано „отворено“ състояние: тестът проверява самия поток, не предварителния режим.
vi.mock("@/lib/prelaunch", async (orig) => ({
  ...(await orig<typeof import("@/lib/prelaunch")>()),
  canStartNewProcessing: () => true,
}));

const CALL_SITES: Array<{ file: string; source: string; price?: string; redirect?: string }> = [
  { file: "src/pages/account/SubscriptionTab.tsx", source: "account_subscription" },
  { file: "src/components/wizard/StrictDocumentPaywall.tsx", source: "strict_paywall", price: "strict_doc_unlock" },
  { file: "src/components/TopupPacks.tsx", source: "topup", redirect: "/account?tab=subscription" },
  { file: "src/pages/account/BrandingTab.tsx", source: "branding", price: "branding_unlock_once", redirect: "/account?tab=branding" },
  { file: "src/pages/Team.tsx", source: "team", price: "team_seat_yearly", redirect: "/team" },
];

describe("платените пътища използват общия адрес за връщане", () => {
  it.each(CALL_SITES)("$file", ({ file, source, price, redirect }) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("buildCheckoutReturnUrl");
    expect(src).toContain(`source: "${source}"`);
    if (price) expect(src).toContain(`priceId: "${price}"`);
    if (redirect) expect(src).toContain(`redirect: "${redirect}"`);
    // Без ръчно сглобени адреси за връщане извън общия помощник.
    expect(src).not.toMatch(/topup=success|branding=success|checkout=success&session_id/);
  });

  it("абонаментът и входният пакет ползват реалната избрана цена", () => {
    const src = readFileSync("src/pages/account/SubscriptionTab.tsx", "utf8");
    expect(src).toContain("priceId: checkoutPrice ?? undefined");
  });

  it("strict paywall вече не изпраща дублиращо GA събитие за старт", () => {
    const src = readFileSync("src/components/wizard/StrictDocumentPaywall.tsx", "utf8");
    expect(src).not.toContain("strict_unlock_checkout_started");
    expect(src).toContain("strict_unlock_cta_clicked");
    expect(src).toContain("trackCheckoutStarted");
  });

  it("CheckoutReturn не изпраща суровия session id към GA и не дублира upgrade_completed", () => {
    const src = readFileSync("src/pages/CheckoutReturn.tsx", "utf8");
    expect(src).not.toContain("purchase_complete");
    expect(src).not.toContain("trackUpgradeCompleted");
    expect(src).toContain("trackCheckoutCompleted");
  });
});
