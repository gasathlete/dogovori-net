import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ cookies: false, keyboard: false }));
vi.mock("@/lib/analytics", () => ({ getCookiePrefs: () => state.cookies ? {} : null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useUnreadNotifications", () => ({ useUnreadNotifications: () => ({ count: 0 }) }));
vi.mock("@/hooks/useKeyboardOpen", () => ({ useKeyboardOpen: () => state.keyboard }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
vi.mock("@/lib/products", async orig => ({ ...(await orig<typeof import("@/lib/products")>()), ONE_TIME_PURCHASES_AVAILABLE: true }));
import { MobileBottomNav } from "@/components/MobileBottomNav";
afterEach(() => { cleanup(); state.cookies = false; state.keyboard = false; });
it("hides both bars until cookie decision, then replaces nav with the selected product action", () => {
  render(<MemoryRouter initialEntries={["/produkti/proverka-predi-podpis"]}><MobileBottomNav /></MemoryRouter>);
  expect(screen.queryByRole("navigation")).toBeNull();
  state.cookies = true;
  fireEvent(window, new Event("dogovori:cookie-preferences-changed"));
  expect(screen.getByRole("link", { name: "Продължете" })).toHaveAttribute("href", "/produkti/proverka-predi-podpis/start");
  expect(screen.queryByTestId("mobile-bottom-nav")).toBeNull();
});
it("does not obstruct checkout or software keyboard", () => {
  state.cookies = true;
  const view = render(<MemoryRouter initialEntries={["/produkti/proverka-predi-podpis/start"]}><MobileBottomNav /></MemoryRouter>);
  expect(screen.queryByRole("navigation")).toBeNull();
  view.unmount(); state.keyboard = true;
  render(<MemoryRouter><MobileBottomNav /></MemoryRouter>);
  expect(screen.queryByRole("navigation")).toBeNull();
});