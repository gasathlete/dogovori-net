import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: null as null | { id: string }, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
import { registrationTarget, shouldShowRegistrationInvitation, type InvitationState } from "@/lib/registrationFunnel";
import { RegistrationCTA } from "@/components/funnel/RegistrationCTA";
import { MarketingOptIn } from "@/components/auth/MarketingOptIn";
import { StartStoryOverlay, openStartStory } from "@/components/funnel/StartStoryOverlay";

afterEach(cleanup);
beforeEach(() => { auth.user = null; auth.loading = false; });
const wrap = (ui: React.ReactNode, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
describe("registration intent", () => {
  it("preserves the exact selected product preparation destination", () => {
    expect(registrationTarget("/produkti/proverka-predi-podpis/start")).toBe("/auth?tab=signup&redirect=%2Fprodukti%2Fproverka-predi-podpis%2Fstart");
  });
  it("rejects external destinations and auth loops", () => {
    expect(registrationTarget("//evil.example")).toBe("/auth?tab=signup&redirect=%2Fbuild");
    expect(registrationTarget("/auth?tab=signup")).toBe("/auth?tab=signup&redirect=%2Fbuild");
  });
  it("guest CTA keeps the current product, signed-in CTA creates instead", () => {
    const view = wrap(<RegistrationCTA source="header" />, "/produkti/proverka-predi-podpis");
    expect(screen.getByRole("link")).toHaveAttribute("href", registrationTarget("/produkti/proverka-predi-podpis"));
    auth.user = { id: "synthetic" };
    view.rerender(<MemoryRouter><RegistrationCTA source="header" /></MemoryRouter>);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/build");
    expect(screen.queryByRole("link", { name: "Регистрирай се безплатно" })).toBeNull();
  });
  it("never shows signup while auth is loading", () => {
    auth.loading = true; wrap(<RegistrationCTA source="hero" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
describe("invitation suppression", () => {
  const allowed: InvitationState = { anonymous: true, ready: true, home: true, dismissed: false, engaged: true, heroPassed: true, competingAction: false, busy: false };
  it("requires an engaged anonymous visitor beyond the hero", () => expect(shouldShowRegistrationInvitation(allowed)).toBe(true));
  it.each(["anonymous", "ready", "home", "engaged", "heroPassed"] as const)("requires %s", (key) => {
    expect(shouldShowRegistrationInvitation({ ...allowed, [key]: false })).toBe(false);
  });
  it.each(["dismissed", "competingAction", "busy"] as const)("suppresses for %s", (key) => {
    expect(shouldShowRegistrationInvitation({ ...allowed, [key]: true })).toBe(false);
  });
});
describe("voluntary story", () => {
  it("opens on request, does not advance with time, arrows stop at last scene, final CTA registers directly", async () => {
    wrap(<StartStoryOverlay />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openStartStory());
    const dialog = await screen.findByRole("dialog");
    expect(screen.getByText("1 / 4")).toBeInTheDocument();
    vi.useFakeTimers(); act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByText("1 / 4")).toBeInTheDocument(); vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    fireEvent.click(screen.getByRole("button", { name: "Без брандиране" }));
    expect(screen.queryByLabelText("Примерен монограм")).toBeNull();
    fireEvent.keyDown(dialog, { key: "ArrowRight" }); fireEvent.keyDown(dialog, { key: "ArrowRight" }); fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("4 / 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Регистрирай се безплатно" })).toHaveAttribute("href", registrationTarget("/build"));
    fireEvent.click(screen.getByRole("button", { name: "Затвори" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("marketing checkbox can remain unchecked with no granting action", () => {
    const change = vi.fn(); wrap(<MarketingOptIn id="test-consent" checked={false} onCheckedChange={change} />);
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); expect(change).toHaveBeenCalledWith(true);
  });
});