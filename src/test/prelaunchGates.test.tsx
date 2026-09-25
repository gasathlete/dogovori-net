import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { invoke, rpc, trackFunnelEvent } = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  trackFunnelEvent: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock("@/lib/funnel", async (orig) => ({
  ...(await orig<typeof import("@/lib/funnel")>()),
  trackFunnelEvent,
}));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: () => {
    throw new Error("Stripe не бива да се монтира в предварителен режим");
  },
  EmbeddedCheckout: () => null,
}));

import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { canStartNewProcessing, canUseFeature } from "@/lib/prelaunch";
import {
  PRELAUNCH_WAITLIST_EVENT,
  __resetWaitlistFunnel,
  openPrelaunchWaitlist,
  submitPrelaunchWaitlist,
} from "@/lib/prelaunchWaitlist";
import { sanitizeReturnPath } from "@/lib/safeRoute";

const names = () => trackFunnelEvent.mock.calls.map((c) => c[0]);

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  trackFunnelEvent.mockReset();
  __resetWaitlistFunnel();
});

describe("нова обработка ≠ запазено право", () => {
  it("абонат не получава нова AI обработка/покупка; не-AI право се запазва", () => {
    for (const f of ["assistant", "document_review", "document_generation", "one_time_product", "subscription"]) {
      expect(canStartNewProcessing(f)).toBe(false);
      expect(canUseFeature(f, { hasActiveEntitlement: true })).toBe(false);
    }
    expect(canUseFeature("blank_download", { hasActiveEntitlement: true })).toBe(true);
  });
});

describe("ново плащане в предварителен режим", () => {
  it("не създава Stripe сесия, не отчита checkout_started и отваря заявката", () => {
    const opened = vi.fn();
    window.addEventListener(PRELAUNCH_WAITLIST_EVENT, opened);
    render(<StripeEmbeddedCheckout priceId="pro_monthly" returnUrl="https://dogovori.net/x" />);
    expect(screen.getByTestId("checkout-prelaunch")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Предварителна заявка" }));
    expect(invoke).not.toHaveBeenCalled();
    expect(names()).not.toContain("checkout_started");
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(PRELAUNCH_WAITLIST_EVENT, opened);
  });
});

describe("funnel на заявката", () => {
  it("отваряне и намерение се броят веднъж; без имейл в свойствата", async () => {
    openPrelaunchWaitlist("one_time_product", { source: "product_detail", productId: "contract_check" });
    openPrelaunchWaitlist("one_time_product", { source: "product_detail", productId: "contract_check" });
    expect(names().filter((n) => n === "prelaunch_waitlist_opened")).toHaveLength(1);
    expect(names().filter((n) => n === "product_intent")).toHaveLength(1);

    rpc.mockResolvedValue({ data: true, error: null });
    await submitPrelaunchWaitlist({ email: "a@b.bg", feature: "assistant", consent: true });
    await submitPrelaunchWaitlist({ email: "a@b.bg", feature: "assistant", consent: true });
    expect(names().filter((n) => n === "prelaunch_waitlist_succeeded")).toHaveLength(1);
    expect(JSON.stringify(trackFunnelEvent.mock.calls)).not.toContain("a@b.bg");
  });
  it("липсващ сървър → failed с причина, никога succeeded", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await submitPrelaunchWaitlist({ email: "a@b.bg", feature: "assistant", consent: true })).toBe("unavailable");
    expect(names()).toContain("prelaunch_waitlist_failed");
    expect(names()).not.toContain("prelaunch_waitlist_succeeded");
  });
  it("непознат източник става other; невалиден продукт не се отчита", () => {
    openPrelaunchWaitlist("assistant", { source: "x@y.bg" as never, productId: "Evil Name.pdf" });
    const call = trackFunnelEvent.mock.calls.find((c) => c[0] === "prelaunch_waitlist_opened");
    expect(call?.[1]).toMatchObject({ source: "other" });
    expect(names()).not.toContain("product_intent");
  });
});

describe("маршрут след вход", () => {
  const o = { origin: "https://dogovori.net" };
  it("маха лични данни, текст и платежни тайни; пази безопасни параметри", () => {
    expect(sanitizeReturnPath("/produkti/x/start?email=a@b.bg&kit=5", o)).toBe("/produkti/x/start?kit=5");
    expect(sanitizeReturnPath("/assistant?text=ЕГН+123&q=ok", o)).toBe("/assistant?q=ok");
    expect(sanitizeReturnPath("/x?note=a%40b.bg", o)).toBe("/x");
    expect(sanitizeReturnPath(`/x?n=${"a".repeat(300)}`, o)).toBe("/x");
    expect(sanitizeReturnPath("/x?payment_intent_client_secret=pi_1", o)).toBe("/x");
    expect(sanitizeReturnPath("/team/accept?token=abc", o)).toBe("/team/accept?token=abc");
    expect(sanitizeReturnPath("//evil.com", o)).toBeNull();
    expect(sanitizeReturnPath("https://evil.com/x", o)).toBeNull();
  });
});
