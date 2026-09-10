/**
 * CheckoutReturn = операционно потвърждение, не „благодарствена страница“.
 *
 * Гаранции, които тестваме:
 *  - точно ЕДНО канонично `checkout_completed` при потвърдено плащане;
 *  - нула събития при изтичане на изчакването;
 *  - входният пакет се проверява през `topup_purchases`, а НЕ през bonus_contracts;
 *  - strict / branding / team / subscription имат собствена проверка за право;
 *  - суровият Stripe session id не попада в свойствата на събитието.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { trackCheckoutCompletedMock, trackEventMock, trackUpgradeCompletedMock, tables, authState } = vi.hoisted(() => ({
  trackCheckoutCompletedMock: vi.fn(),
  trackEventMock: vi.fn(),
  trackUpgradeCompletedMock: vi.fn(),
  tables: new Map<string, unknown>(),
  authState: {
    user: { id: "u1", email: "u@example.com" } as { id: string; email: string } | null,
    loading: false,
  },
}));

vi.mock("@/lib/docFunnel", () => ({ trackCheckoutCompleted: trackCheckoutCompletedMock }));
vi.mock("@/lib/analytics", () => ({ trackEvent: trackEventMock, getCategoryConsent: () => true }));
vi.mock("@/lib/metrics", () => ({ trackUpgradeCompleted: trackUpgradeCompletedMock }));
vi.mock("@/components/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));


vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = self;
    b.maybeSingle = () => Promise.resolve({ data: tables.get(table) ?? null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import CheckoutReturn from "@/pages/CheckoutReturn";

const SESSION = "cs_test_51SecretSession";

function renderReturn(query: string) {
  return render(
    <MemoryRouter initialEntries={[`/checkout/return?${query}`]}>
      <CheckoutReturn />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tables.clear();
  trackCheckoutCompletedMock.mockReset();
  trackEventMock.mockReset();
  trackUpgradeCompletedMock.mockReset();
  authState.user = { id: "u1", email: "u@example.com" };
  authState.loading = false;
});

/** Успехът е видим САМО когато е потвърден. */
describe("CheckoutReturn — визуална истинност", () => {
  const SUCCESS_ICON = "checkout-ready-icon";
  const CONTINUE = /Продължи с моя договор/;

  it("докато проверяваме: неутрално състояние без успех и без „Продължи“", async () => {
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription&redirect=%2Fwizard%2Fnda`);
    await waitFor(() => expect(screen.getByTestId("checkout-pending-icon")).toBeInTheDocument());
    expect(screen.queryByTestId(SUCCESS_ICON)).toBeNull();
    expect(screen.queryByText(/Благодарим/)).toBeNull();
    expect(screen.queryByText(CONTINUE)).toBeNull();
  });

  it("при потвърждение: зелен успех и „Продължи“", async () => {
    tables.set("order_snapshots", { id: "o1" });
    tables.set("download_quota", { plan: "pro", pro_until: null });
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription&redirect=%2Fwizard%2Fnda`);
    await waitFor(() => expect(screen.getByTestId(SUCCESS_ICON)).toBeInTheDocument());
    expect(screen.getByText(/Благодарим/)).toBeInTheDocument();
    expect(screen.getByText(CONTINUE)).toBeInTheDocument();
  });

  it("при изтекло изчакване: предупреждение, без твърдение че плащането е получено", async () => {
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription&redirect=%2Fwizard%2Fnda`);
    await waitFor(() => expect(screen.getByTestId("checkout-warning-icon")).toBeInTheDocument(), { timeout: 30_000 });
    expect(screen.queryByTestId(SUCCESS_ICON)).toBeNull();
    expect(screen.queryByText(/Благодарим/)).toBeNull();
    expect(screen.queryByText(/Плащането е получено/)).toBeNull();
    expect(screen.queryByText(CONTINUE)).toBeNull();
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  }, 40_000);

  it("липсваща сесия: неутрално състояние, не успех", async () => {
    renderReturn("price_id=professional_monthly");
    await waitFor(() => expect(screen.getByTestId("checkout-neutral-icon")).toBeInTheDocument());
    expect(screen.queryByTestId(SUCCESS_ICON)).toBeNull();
    expect(screen.queryByText(/Благодарим/)).toBeNull();
    expect(screen.queryByText(CONTINUE)).toBeNull();
  });

  it("без вход: покана за вход, без измамен безкраен успех", async () => {
    authState.user = null;
    tables.set("order_snapshots", { id: "o1" });
    tables.set("download_quota", { plan: "pro", pro_until: null });
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription`);
    await waitFor(() => expect(screen.getByText(/Вход в профила/)).toBeInTheDocument());
    expect(screen.queryByTestId(SUCCESS_ICON)).toBeNull();
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  });
});


afterEach(() => {
  vi.useRealTimers();
});

describe("CheckoutReturn — потвърдено плащане", () => {
  it("абонамент: snapshot + активен Pro → точно едно checkout_completed", async () => {
    tables.set("order_snapshots", { id: "o1" });
    tables.set("download_quota", { plan: "pro", pro_until: null });
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription`);
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock).toHaveBeenCalledWith(SESSION, {
      kind: "subscription",
      plan: "professional",
      billing: "monthly",
      source: "account_subscription",
    });
    expect(trackEventMock).not.toHaveBeenCalled();
    expect(trackUpgradeCompletedMock).not.toHaveBeenCalled();
  });

  it("входен пакет: проверява topup_purchases, не bonus_contracts", async () => {
    tables.set("order_snapshots", { id: "o1" });
    tables.set("download_quota", { plan: "free", pro_until: null, bonus_contracts: 5 });
    renderReturn(`session_id=${SESSION}&price_id=five_operations&source=account_subscription`);
    await waitFor(() => expect(trackCheckoutCompletedMock).not.toHaveBeenCalled());

    tables.set("topup_purchases", { id: "t1" });
    renderReturn(`session_id=${SESSION}&price_id=five_operations&source=account_subscription`);
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock.mock.calls[0][1]).toMatchObject({ kind: "entry_pack", billing: "one_time" });
  });

  it("strict unlock (легаси type) → готовност от strict_doc_unlocks", async () => {
    tables.set("strict_doc_unlocks", { id: "s1" });
    renderReturn(`session_id=${SESSION}&type=strict_unlock`);
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock.mock.calls[0][1]).toMatchObject({
      kind: "strict_unlock",
      plan: "strict_unlock",
      source: "unknown",
    });
  });

  it("брандиране → готовност от branding_unlocks", async () => {
    tables.set("branding_unlocks", { id: "b1" });
    renderReturn(`session_id=${SESSION}&price_id=branding_unlock_once&source=branding`);
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock.mock.calls[0][1]).toMatchObject({ kind: "branding", source: "branding" });
  });

  it("екип → snapshot + активно членство", async () => {
    tables.set("order_snapshots", { id: "o1" });
    tables.set("team_members", { team_id: "t1", teams: { status: "active" } });
    renderReturn(`session_id=${SESSION}&price_id=team_seat_yearly&source=team`);
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock.mock.calls[0][1]).toMatchObject({ kind: "team", billing: "yearly" });
  });
});

describe("CheckoutReturn — без потвърждение", () => {
  it("липсващо право → нула събития (без завършване при изчакване)", async () => {
    vi.useFakeTimers();
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription`);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  });

  it("абонамент без snapshot не се брои за платен, дори при активен Pro", async () => {
    tables.set("download_quota", { plan: "pro", pro_until: null });
    renderReturn(`session_id=${SESSION}&price_id=professional_monthly&source=account_subscription`);
    await waitFor(() => expect(trackCheckoutCompletedMock).not.toHaveBeenCalled());
  });

  it("подправени параметри и непознат вид покупка → нула събития", async () => {
    // Само запис за поръчка не доказва, че точно това право е дадено. При
    // непознат вид покупка не потвърждаваме нищо.
    tables.set("order_snapshots", { id: "o1" });
    renderReturn(`session_id=${SESSION}&price_id=<script>evil</script>&source=attacker@example.com`);
    await new Promise((r) => setTimeout(r, 400));
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  });

});
