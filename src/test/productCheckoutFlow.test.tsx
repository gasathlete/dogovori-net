/**
 * Продуктовата покупка отпред: съгласията никога не са предварително
 * отметнати, Stripe не се вика без тях, няма двойно плащане, а връщането
 * иска и платен snapshot, и точното право.
 */
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, tables, trackCheckoutCompletedMock, authState } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  tables: new Map<string, unknown>(),
  trackCheckoutCompletedMock: vi.fn(),
  authState: { user: { id: "u1", email: "u@example.com" }, loading: false },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/components/Header", () => ({ Header: () => <header /> }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/lib/docFunnel", () => ({ trackCheckoutCompleted: trackCheckoutCompletedMock }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn(), getCategoryConsent: () => true }));
vi.mock("@/lib/metrics", () => ({ trackUpgradeCompleted: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeEnvironment: () => "sandbox", getStripe: () => Promise.resolve(null) }));
vi.mock("@/components/StripeEmbeddedCheckout", () => ({
  StripeEmbeddedCheckout: () => <div data-testid="stripe-mounted" />,
}));
vi.mock("@/lib/productUpload", () => ({
  ProductUploadError: class extends Error {},
  prepareProductDocument: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = self;
    b.maybeSingle = () => Promise.resolve({ data: tables.get(table) ?? null, error: null });
    return b;
  };
  return { supabase: { from: (t: string) => chain(t), functions: { invoke: invokeMock } } };
});

import ProductCheckout from "@/pages/ProductCheckout";
import CheckoutReturn from "@/pages/CheckoutReturn";
import { PRODUCTS } from "@/lib/products";

const SESSION = "cs_test_product";

beforeEach(() => {
  invokeMock.mockReset();
  tables.clear();
  trackCheckoutCompletedMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("продуктова страница за плащане", () => {
  it("всички съгласия са неотметнати и Stripe не се вика", async () => {
    render(
      <MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}>
        <Routes>
          <Route path="/produkti/:slug/start" element={<ProductCheckout />} />
        </Routes>
      </MemoryRouter>,
    );
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box).toHaveAttribute("data-state", "unchecked");
    const pay = screen.getByRole("button", { name: /плащане/i });
    expect(pay).toBeDisabled();
    await userEvent.click(pay);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stripe-mounted")).toBeNull();
  });

  it("показва точната еднократна цена без абонамент", async () => {
    render(
      <MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}>
        <Routes>
          <Route path="/produkti/:slug/start" element={<ProductCheckout />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/2[.,]99/)).toBeTruthy();
    expect(screen.getByText(/без\s+абонамент/i)).toBeTruthy();
  });
});

describe("канонични CTA пътища", () => {
  it("всеки продукт води към своя /start", () => {
    for (const p of PRODUCTS) {
      expect(p.ctaHref).toBe(`/produkti/${p.slug}/start`);
    }
  });
});

describe("връщане от продуктово плащане", () => {
  const query = `?session_id=${SESSION}&type=product&product=contract_check`;

  it("само snapshot не е успех", async () => {
    tables.set("order_snapshots", {
      id: "s1",
      payment_status: "paid",
      purchase_kind: "product",
      product_id: "contract_check",
    });
    tables.set("product_entitlements", null);
    render(
      <MemoryRouter initialEntries={[`/checkout/return${query}`]}>
        <Routes>
          <Route path="/checkout/return" element={<CheckoutReturn />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  });

  it("snapshot + точно право дава едно завършване", async () => {
    tables.set("order_snapshots", {
      id: "s1",
      payment_status: "paid",
      purchase_kind: "product",
      product_id: "contract_check",
    });
    tables.set("product_entitlements", {
      id: "e1",
      product_id: "contract_check",
      status: "paid",
      amount_cents: 299,
      environment: "sandbox",
      stripe_session_id: SESSION,
      source_hash: "h1",
      created_at: "2026-09-01T00:00:00Z",
    });
    render(
      <MemoryRouter initialEntries={[`/checkout/return${query}`]}>
        <Routes>
          <Route path="/checkout/return" element={<CheckoutReturn />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(trackCheckoutCompletedMock).toHaveBeenCalledTimes(1));
    expect(trackCheckoutCompletedMock.mock.calls[0][1]).toMatchObject({ kind: "product" });
  });

  it("неплатен snapshot не е успех", async () => {
    tables.set("order_snapshots", {
      id: "s1",
      payment_status: "pending",
      purchase_kind: "product",
      product_id: "contract_check",
    });
    render(
      <MemoryRouter initialEntries={[`/checkout/return${query}`]}>
        <Routes>
          <Route path="/checkout/return" element={<CheckoutReturn />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(trackCheckoutCompletedMock).not.toHaveBeenCalled();
  });
});
