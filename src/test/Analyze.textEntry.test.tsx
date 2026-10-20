import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Analyze from "@/pages/Analyze";

const state = vi.hoisted(() => ({ user: null as null | { id: string }, open: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/lib/funnel", () => ({ markFunnelStep: vi.fn(), trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/prelaunch", () => ({ isFeatureAvailable: () => state.open }));

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{location.pathname + location.search}</output>;
}
function open(path = "/analiz") {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/analiz" element={<Analyze />} />
    <Route path="*" element={<Destination />} />
  </Routes></MemoryRouter>);
}
afterEach(() => { cleanup(); state.user = null; state.open = true; });

describe("analysis entry with free text open and paid products closed", () => {
  it("leads a signed-in visitor to the existing account text dialog", () => {
    state.user = { id: "synthetic-owner" };
    open();
    expect(screen.queryByText("Качването предстои")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Поставете текст за проверка" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/account?tab=documents&action=upload");
  });
  it("keeps the text entry as the return destination after login", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Вход в профила" }));
    const target = screen.getByTestId("destination").textContent!;
    expect(target.startsWith("/auth?tab=login&")).toBe(true);
    expect(new URLSearchParams(target.split("?")[1]).get("redirect")).toBe("/account?tab=documents&action=upload");
  });
  it("keeps the paid product closed without redirecting to the free flow", () => {
    open("/analiz?product=contract_check");
    expect(screen.getByRole("button", { name: "Качването предстои" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Създайте безплатен профил" })).not.toBeInTheDocument();
  });
  it("keeps the closed fallback when the text feature is unavailable", () => {
    state.open = false;
    open();
    expect(screen.getByRole("button", { name: "Качването предстои" })).toBeDisabled();
    expect(screen.queryByText("Проверете текста на документ")).not.toBeInTheDocument();
  });
});
