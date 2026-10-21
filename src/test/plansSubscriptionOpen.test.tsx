import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/prelaunch", async (orig) => {
  const m = await orig<typeof import("@/lib/prelaunch")>();
  return { ...m, isFeatureAvailable: (f: string) => f === "subscription" || m.isFeatureAvailable(f) };
});
const plan = (id: string, name: string, price: number) => ({
  id, name, tagline: "", price_monthly_eur: price, price_yearly_eur: price * 10, price_per_seat_yearly_eur: null,
  min_seats: null, monthly_ops: 50, highlighted: false, features: [], highlight: false, sort_order: 1, cta_label: "", active: true,
});
vi.mock("@/hooks/usePlans", () => ({
  usePlans: () => ({
    isLoading: false,
    data: { plans: [plan("free", "Безплатен", 0), plan("professional", "Професионалист", 12.9), plan("entrepreneur", "Предприемач", 19.9)], features: [], comparison: [] },
  }),
}));

import Plans from "@/pages/Plans";

describe("/plans при отворени абонаменти", () => {
  it("картите водят към регистрация→checkout, без waitlist", () => {
    render(
      <HelmetProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/plans"]}><Plans /></MemoryRouter></QueryClientProvider></HelmetProvider>,
    );
    expect(screen.queryByLabelText("Покупките предстоят")).toBeNull();
    const pro = screen.getAllByRole("link", { name: /Избери Професионалист/ })[0];
    expect(pro.getAttribute("href")).toContain(encodeURIComponent("/account?tab=subscription&plan=professional"));
    expect(screen.getAllByRole("link", { name: /Избери Предприемач/ }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Извести ме при пускане" }).length).toBeLessThanOrEqual(1); // само входният пакет
  });
});

describe("/plans входен пакет", () => {
  it("CTA води към регистрация → checkout=five_operations в профила", () => {
    render(
      <HelmetProvider><QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/plans"]}><Plans /></MemoryRouter></QueryClientProvider></HelmetProvider>,
    );
    const link = screen.getByRole("link", { name: /^Купи за 2,90/ });
    expect(link.getAttribute("href")).toBe(`/auth?tab=signup&redirect=${encodeURIComponent("/account?tab=subscription&checkout=five_operations")}&intent=one_off_five_operations`);
    expect(screen.queryByRole("button", { name: "Извести ме при пускане" })).toBeNull();
  });
});
