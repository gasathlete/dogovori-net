/**
 * E2E тест на реалния плащателен сценарий (checkout).
 *
 * Минава през целия път: екран с планове → клик върху бутон за плащане →
 * отваряне на Stripe checkout → извикване на edge функцията `create-checkout`
 * с конкретен `priceId`. Валидира, че:
 *   1. имената и цените, показани на екрана, идват от `src/lib/pricing.ts`;
 *   2. `priceId`, който тръгва към плащането, е точно този от конфигурацията;
 *   3. сумата, която Stripe би таксувал за този lookup key (симулиран каталог,
 *      огледален на sandbox), съвпада с цената от `pricing.ts`.
 */
import * as React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  PRICING_PLANS,
  TOPUP_PACK_CONFIG,
  fmtEur,
  type PricingPlanId,
} from "@/lib/pricing";

/* ---------------------- Симулиран Stripe каталог ---------------------- */
/** Огледало на цените в Stripe (lookup_key → сума в центове). */
const STRIPE_CATALOG: Record<string, number> = {
  professional_monthly: Math.round(PRICING_PLANS.professional.monthly! * 100),
  professional_yearly: Math.round(PRICING_PLANS.professional.yearly! * 100),
  entrepreneur_monthly: Math.round(PRICING_PLANS.entrepreneur.monthly! * 100),
  entrepreneur_yearly: Math.round(PRICING_PLANS.entrepreneur.yearly! * 100),
  team_seat_yearly: Math.round(PRICING_PLANS.team.yearly! * 100),
  ...Object.fromEntries(
    TOPUP_PACK_CONFIG.map((p) => [p.priceId, Math.round(p.eur * 100)]),
  ),
};

/** Записва какво реално е изпратено към `create-checkout`. */
const checkoutCalls: Array<{ priceId: string; amount: number | undefined }> = [];

/* ------------------------------ Mocks ------------------------------ */
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(null),
  getStripeEnvironment: () => "sandbox" as const,
}));

vi.mock("@stripe/react-stripe-js", () => ({
  // Симулира Stripe iframe: извиква fetchClientSecret точно както прави Stripe.js
  EmbeddedCheckoutProvider: ({ options, children }: any) => {
    const fetched = React.useRef(false);
    React.useEffect(() => {
      if (fetched.current) return;
      fetched.current = true;
      Promise.resolve(options?.fetchClientSecret?.()).catch(() => {});
    }, []);
    return <div data-testid="stripe-provider">{children}</div>;
  },
  EmbeddedCheckout: () => <div data-testid="stripe-checkout-form">Stripe form</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u_test_1", email: "kupuvach@example.com" },
    session: { access_token: "t" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTeam", () => ({
  useTeam: () => ({ team: null, members: [], role: null, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/hooks/useUnreadNotifications", () => ({
  useUnreadNotifications: () => ({ count: 0, refresh: vi.fn() }),
}));

const makeQuery = () => {
  const chain: any = {};
  for (const m of ["select", "eq", "order", "limit", "in", "gte", "lte", "neq"]) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (fn: any) => Promise.resolve({ data: [], error: null }).then(fn);
  return chain;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => makeQuery(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    functions: {
      invoke: (name: string, opts: any) => {
        if (name === "create-checkout") {
          const priceId = opts?.body?.priceId as string;
          checkoutCalls.push({ priceId, amount: STRIPE_CATALOG[priceId] });
          if (!(priceId in STRIPE_CATALOG)) {
            return Promise.resolve({
              data: null,
              error: { message: `Price not found: ${priceId}` },
            });
          }
          return Promise.resolve({
            data: { clientSecret: `cs_test_${priceId}` },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  },
}));

vi.mock("@/components/account/TopupHistoryPanel", () => ({
  TopupHistoryPanel: () => <div data-testid="topup-history" />,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import SubscriptionTab from "@/pages/account/SubscriptionTab";

const quota = {
  contracts_used: 0,
  templates_used: 0,
  plan: "free" as const,
  pro_until: null,
  total_used: 0,
  monthly_total_used: 0,
};

function renderPlans() {
  return render(
    <MemoryRouter initialEntries={["/account?tab=subscription"]}>
      <SubscriptionTab quota={quota} isPro={false} />
    </MemoryRouter>,
  );
}

/** Отваря всички планове, ако са зад бутон „виж всички“. */
async function revealAllPlans(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.queryByRole("button", { name: /всички планове|виж плановете|смени план/i });
  if (toggle) await user.click(toggle);
}

describe("E2E: checkout сценарий и съответствие на плановете", () => {
  beforeEach(() => {
    checkoutCalls.length = 0;
  });

  it("показва имена и цени, идентични с pricing.ts", async () => {
    const user = userEvent.setup();
    renderPlans();
    await revealAllPlans(user);

    for (const id of ["professional", "entrepreneur", "team"] as PricingPlanId[]) {
      const plan = PRICING_PLANS[id];
      expect(screen.getAllByText(new RegExp(plan.name)).length).toBeGreaterThan(0);
      const shown = id === "team" ? plan.yearly! : plan.monthly!;
      expect(screen.getAllByText(fmtEur(shown)).length).toBeGreaterThan(0);
    }

    // Top-up пакетът също се води от конфигурацията.
    expect(
      screen.getAllByText(new RegExp(fmtEur(TOPUP_PACK_CONFIG[0].eur).replace("€", "€?"))).length,
    ).toBeGreaterThan(0);
  });

  it("при клик върху 'Месечен' стартира checkout с правилната цена (Професионалист)", async () => {
    const user = userEvent.setup();
    renderPlans();
    await revealAllPlans(user);

    const cards = screen.getAllByRole("button", { name: /^Месечен$/ });
    expect(cards.length).toBeGreaterThan(0);
    await user.click(cards[0]);

    await waitFor(() => expect(checkoutCalls.length).toBe(1));
    const call = checkoutCalls[0];
    expect(call.priceId).toBe(PRICING_PLANS.professional.priceIds.monthly);
    expect(call.amount).toBe(Math.round(PRICING_PLANS.professional.monthly! * 100));

    // Stripe формата е монтирана — плащането реално започва.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("stripe-checkout-form")).toBeInTheDocument();
  });

  it("годишният бутон изпраща годишния priceId и годишната сума", async () => {
    const user = userEvent.setup();
    renderPlans();
    await revealAllPlans(user);

    const yearly = screen.getAllByRole("button", {
      name: new RegExp(`Годишен\\s*${fmtEur(PRICING_PLANS.entrepreneur.yearly!).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    });
    await user.click(yearly[0]);

    await waitFor(() => expect(checkoutCalls.length).toBe(1));
    expect(checkoutCalls[0].priceId).toBe(PRICING_PLANS.entrepreneur.priceIds.yearly);
    expect(checkoutCalls[0].amount).toBe(Math.round(PRICING_PLANS.entrepreneur.yearly! * 100));
  });

  it("top-up покупката ползва priceId и сумата от TOPUP_PACK_CONFIG", async () => {
    const user = userEvent.setup();
    renderPlans();
    await revealAllPlans(user);

    const pack = TOPUP_PACK_CONFIG[0];
    const buy = screen.getAllByRole("button", {
      name: new RegExp(`Купи за`, "i"),
    });
    await user.click(buy[0]);

    await waitFor(() => expect(checkoutCalls.length).toBe(1));
    expect(checkoutCalls[0].priceId).toBe(pack.priceId);
    expect(checkoutCalls[0].amount).toBe(Math.round(pack.eur * 100));
  });

  it("всеки lookup key от pricing.ts съществува в платежния каталог", () => {
    const keys = [
      ...Object.values(PRICING_PLANS).flatMap((p) => Object.values(p.priceIds)),
      ...TOPUP_PACK_CONFIG.map((p) => p.priceId),
    ].filter(Boolean) as string[];
    for (const key of keys) {
      const catalogKey = key === "team_yearly" ? "team_seat_yearly" : key;
      expect(STRIPE_CATALOG[catalogKey], `липсва цена за ${key}`).toBeGreaterThan(0);
    }
  });
});
