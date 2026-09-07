/**
 * Затворен описател на платената фуния: адресът за връщане и разчитането му
 * минават само през allowlist, а суровият Stripe session id никога не се пази.
 */
import { describe, expect, it } from "vitest";
import {
  buildCheckoutReturnUrl,
  compactSessionToken,
  describeCheckoutReturn,
  parseCheckoutPriceKey,
  parseCheckoutSource,
  parsePurchaseKind,
  purchaseKindForPrice,
} from "@/lib/checkoutAnalytics";
import { resetOnceStore } from "@/lib/funnelEvents";

const ORIGIN = "https://dogovori.net";

describe("buildCheckoutReturnUrl", () => {
  it("заместителят на Stripe остава буквален (без кодиране на скобите)", () => {
    const url = buildCheckoutReturnUrl({ origin: ORIGIN, priceId: "topup_50", source: "topup" });
    expect(url).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(url).not.toContain("%7B");
    expect(url).toBe(
      `${ORIGIN}/checkout/return?session_id={CHECKOUT_SESSION_ID}&price_id=topup_50&source=topup`,
    );
  });

  it("непознати price/source стават unknown, а не произволен етикет", () => {
    const url = buildCheckoutReturnUrl({ origin: ORIGIN, priceId: "price_1QEvil", source: "user@mail.com" });
    expect(url).toContain("price_id=unknown");
    expect(url).toContain("source=unknown");
    expect(url).not.toContain("Evil");
  });

  it("redirect се кодира и остава относителен", () => {
    const url = buildCheckoutReturnUrl({
      origin: ORIGIN,
      priceId: "strict_doc_unlock",
      source: "strict_paywall",
      redirect: "/wizard/nda?step=2",
      legacyType: "strict_unlock",
    });
    expect(url).toContain("type=strict_unlock");
    expect(url).toContain(`redirect=${encodeURIComponent("/wizard/nda?step=2")}`);
  });
});

describe("describeCheckoutReturn", () => {
  const d = (q: string) => describeCheckoutReturn(new URLSearchParams(q));

  it("разпознава всички поддържани ключове", () => {
    expect(d("price_id=professional_yearly&source=account_subscription")).toEqual({
      kind: "subscription", plan: "professional", billing: "yearly", source: "account_subscription",
    });
    expect(d("price_id=pro_monthly")).toMatchObject({ kind: "subscription", plan: "pro", billing: "monthly" });
    expect(d("price_id=five_operations")).toMatchObject({ kind: "entry_pack", billing: "one_time" });
    expect(d("price_id=topup_100")).toMatchObject({ kind: "topup", plan: "topup_100" });
    expect(d("price_id=team_seat_yearly")).toMatchObject({ kind: "team", plan: "team", billing: "yearly" });
    expect(d("price_id=branding_unlock_once")).toMatchObject({ kind: "branding", plan: "branding" });
    expect(d("price_id=strict_doc_unlock")).toMatchObject({ kind: "strict_unlock", plan: "strict_unlock" });
  });

  it("запазва легаси type=strict_unlock", () => {
    expect(d("type=strict_unlock")).toEqual({
      kind: "strict_unlock", plan: "strict_unlock", billing: "one_time", source: "unknown",
    });
  });

  it("подправени стойности → unknown", () => {
    expect(d("price_id=../../etc/passwd&source=<script>&kind=admin")).toEqual({
      kind: "unknown", plan: "unknown", billing: "unknown", source: "unknown",
    });
    expect(parseCheckoutPriceKey("nope")).toBe("unknown");
    expect(parseCheckoutSource(null)).toBe("unknown");
    expect(parsePurchaseKind("root")).toBe("unknown");
    expect(purchaseKindForPrice("unknown")).toBe("unknown");
  });

  it("явен kind се приема само от затворения списък", () => {
    expect(d("kind=topup")).toMatchObject({ kind: "topup", plan: "unknown" });
  });
});

describe("compactSessionToken", () => {
  it("детерминистичен, кратък и необратим", () => {
    const raw = "cs_test_51SecretSession";
    const token = compactSessionToken(raw);
    expect(token).toBe(compactSessionToken(raw));
    expect(token).not.toContain("cs_test");
    expect(token.length).toBeLessThanOrEqual(16);
    expect(compactSessionToken("cs_test_other")).not.toBe(token);
  });
});

describe("поверителност: суровият session id не се пази никъде", () => {
  it("checkout_completed не съдържа session id в props, GA или localStorage", async () => {
    resetOnceStore();
    const raw = "cs_test_51RawSessionValue";
    const dataLayer: unknown[] = [];
    (window as unknown as { dataLayer: unknown[] }).dataLayer = dataLayer;
    const { trackCheckoutCompleted } = await import("@/lib/docFunnel");
    trackCheckoutCompleted(raw, { kind: "subscription", plan: "professional", billing: "monthly", source: "account_subscription" });

    const once = localStorage.getItem("funnel_once_v1") ?? "";
    expect(once).not.toContain(raw);
    expect(once).not.toContain("cs_test");
    expect(JSON.stringify(dataLayer)).not.toContain("cs_test");
  });
});
