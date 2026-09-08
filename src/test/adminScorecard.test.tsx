/**
 * Stage 2d1b — /admin/scorecard: авторизация, MFA, свежест на данните и честни
 * състояния при липсваща/повредена справка.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, mfaState, rpcMock } = vi.hoisted(() => ({
  authState: { user: null as { id: string } | null, loading: false },
  mfaState: { allowed: true },
  rpcMock: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/components/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/admin/AdminMFAGuard", () => ({
  AdminMFAGuard: ({ children }: { children: React.ReactNode }) =>
    mfaState.allowed ? <>{children}</> : <div>Изисква се MFA</div>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));

import AdminScorecard from "@/pages/AdminScorecard";
import { FUNNEL_STAGE_KEYS, PURCHASE_KIND_KEYS } from "@/lib/ownerScorecard";

const CUTOVER = "2026-09-07T22:42:00.000Z";

function scorecardPayload(overrides: Record<string, unknown> = {}) {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86_400_000);
  return {
    truth_schema_version: 1,
    payment_truth_cutover: CUTOVER,
    range: { from: from.toISOString(), to: to.toISOString() },
    funnel: Object.fromEntries(FUNNEL_STAGE_KEYS.map((k) => [k, 0])),
    traffic_context: { tracked_sessions: 0, pageviews: 0 },
    payment_truth: {
      automated_proven_orders_period: 0,
      automated_proven_payers_total: 0,
      legacy_subscription_users_unverified: 2,
      historical_payment_baseline_verified: false,
      proven_payers_total: 0,
      new_proven_payers_period: 0,
      proof_first_order_at: null,
    },
    first_purchase_cohorts: {
      first_mode_subscription_period: 0,
      first_mode_one_time_period: 0,
      first_mode_unknown_period: 0,
      one_time_first_total: 0,
      one_off_to_subscription_total: 0,
      one_off_to_subscription_period: 0,
    },
    purchase_kinds: Object.fromEntries(PURCHASE_KIND_KEYS.map((k) => [k, 0])),
    ...overrides,
  };
}

/** Отговори според извиканата RPC. */
function setupRpc(opts: {
  role?: { data: unknown; error?: unknown };
  scorecard?: () => Promise<{ data: unknown; error: unknown }>;
}) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "has_role") {
      return Promise.resolve({ data: opts.role?.data ?? false, error: opts.role?.error ?? null });
    }
    if (fn === "owner_scorecard") {
      return opts.scorecard ? opts.scorecard() : Promise.resolve({ data: scorecardPayload(), error: null });
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/scorecard"]}>
      <AdminScorecard />
    </MemoryRouter>,
  );
}

function ownerCalls() {
  return rpcMock.mock.calls.filter((c) => c[0] === "owner_scorecard");
}

beforeEach(() => {
  rpcMock.mockReset();
  authState.user = { id: "admin-1" };
  authState.loading = false;
  mfaState.allowed = true;
});

describe("достъп", () => {
  it("не извиква справката за неавтентикиран потребител", async () => {
    authState.user = null;
    setupRpc({});
    renderPage();
    await screen.findByText(/Достъпът е отказан/);
    expect(ownerCalls()).toHaveLength(0);
  });

  it("отказва обикновен потребител без роля", async () => {
    setupRpc({ role: { data: false } });
    renderPage();
    await screen.findByText(/Достъпът е отказан/);
    expect(ownerCalls()).toHaveLength(0);
  });

  it("отказва модератор (проверява се точно роля admin)", async () => {
    rpcMock.mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (fn === "has_role") {
        return Promise.resolve({ data: args._role === "moderator", error: null });
      }
      return Promise.resolve({ data: scorecardPayload(), error: null });
    });
    renderPage();
    await screen.findByText(/Достъпът е отказан/);
    expect(rpcMock).toHaveBeenCalledWith("has_role", { _user_id: "admin-1", _role: "admin" });
    expect(ownerCalls()).toHaveLength(0);
  });

  it("fail-closed при грешка в проверката на роля", async () => {
    setupRpc({ role: { data: true, error: { message: "boom" } } });
    renderPage();
    await screen.findByText(/Достъпът е отказан/);
    expect(ownerCalls()).toHaveLength(0);
  });

  it("изчаква автентикацията без да извиква справката", async () => {
    authState.loading = true;
    setupRpc({ role: { data: true } });
    renderPage();
    await waitFor(() => expect(rpcMock).not.toHaveBeenCalled());
    expect(screen.queryByText(/Достъпът е отказан/)).toBeNull();
  });

  it("не извиква справката преди изпълнен MFA", async () => {
    mfaState.allowed = false;
    setupRpc({ role: { data: true } });
    renderPage();
    await screen.findByText(/Изисква се MFA/);
    expect(ownerCalls()).toHaveLength(0);
  });
});

describe("свежест на данните", () => {
  it("не показва кеширани данни след изход от профила", async () => {
    setupRpc({
      role: { data: true },
      scorecard: () =>
        Promise.resolve({
          data: scorecardPayload({
            payment_truth: { ...scorecardPayload().payment_truth, proven_payers_total: 41 },
          }),
          error: null,
        }),
    });
    const view = renderPage();
    await screen.findByText("41");
    authState.user = null;
    view.rerender(
      <MemoryRouter initialEntries={["/admin/scorecard"]}>
        <AdminScorecard />
      </MemoryRouter>,
    );
    await screen.findByText(/Достъпът е отказан/);
    expect(screen.queryByText("41")).toBeNull();
  });

  it("изостанал отговор не изпреварва по-новия", async () => {
    let resolveFirst: ((v: { data: unknown; error: unknown }) => void) | null = null;
    let call = 0;
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "has_role") return Promise.resolve({ data: true, error: null });
      call += 1;
      if (call === 1) {
        return new Promise<{ data: unknown; error: unknown }>((res) => {
          resolveFirst = res;
        });
      }
      return Promise.resolve({
        data: scorecardPayload({
          payment_truth: { ...scorecardPayload().payment_truth, proven_payers_total: 7 },
        }),
        error: null,
      });
    });
    renderPage();
    await waitFor(() => expect(ownerCalls().length).toBeGreaterThan(0));
    // Смяната на периода стартира нова заявка, докато първата още виси.
    (await screen.findByRole("button", { name: "30 дни" })).click();
    await screen.findByText("7");
    resolveFirst?.({
      data: scorecardPayload({
        payment_truth: { ...scorecardPayload().payment_truth, proven_payers_total: 999 },
      }),
      error: null,
    });
    await waitFor(() => expect(screen.queryByText("999")).toBeNull());
  });
});

describe("състояния на справката", () => {
  it("липсваща функция не е нулев успех", async () => {
    setupRpc({
      role: { data: true },
      scorecard: () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.owner_scorecard" } }),
    });
    renderPage();
    await screen.findByText(/още не е инсталирана/);
    expect(screen.queryByText(/Обеми по стъпки/)).toBeNull();
    expect(screen.queryByText(/owner_scorecard/)).toBeNull();
  });

  it("обща грешка показва повторен опит без сурово съобщение", async () => {
    setupRpc({
      role: { data: true },
      scorecard: () => Promise.resolve({ data: null, error: { message: "select * from order_snapshots failed" } }),
    });
    renderPage();
    await screen.findByRole("button", { name: /Опитай отново/ });
    expect(screen.queryByText(/order_snapshots/)).toBeNull();
  });

  it("повредена схема се отхвърля вместо да се показват нули", async () => {
    setupRpc({
      role: { data: true },
      scorecard: () => Promise.resolve({ data: { truth_schema_version: 1 }, error: null }),
    });
    renderPage();
    await screen.findByRole("button", { name: /Опитай отново/ });
    expect(screen.queryByText(/Обеми по стъпки/)).toBeNull();
  });
});

describe("честно съдържание", () => {
  it("не показва фалшив напредък към целта, нито норми сесии→платци", async () => {
    setupRpc({ role: { data: true } });
    renderPage();
    await screen.findByText(/Цел: 60 абоната/);
    expect(screen.getByText(/предстои потвърждение/)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/\d+\s?%/);
    expect(screen.getByText(/Няма отчетени събития за периода/)).toBeTruthy();
    expect(screen.getByText(/не доказва преминаване/)).toBeTruthy();
  });

  it("иска избрания период при смяна на бутон", async () => {
    setupRpc({ role: { data: true } });
    renderPage();
    await waitFor(() => expect(ownerCalls().length).toBe(1));
    (await screen.findByRole("button", { name: "7 дни" })).click();
    await waitFor(() => expect(ownerCalls().length).toBe(2));
    const args = ownerCalls()[1][1] as { _from: string; _to: string };
    const days = (Date.parse(args._to) - Date.parse(args._from)) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it("показва историческата основа само с етикет за непотвърденост", async () => {
    setupRpc({ role: { data: true } });
    renderPage();
    await screen.findByText(/непотвърдено плащане/);
    expect(screen.getByText(/НЕ е включена в общия брой/)).toBeTruthy();
  });
});
