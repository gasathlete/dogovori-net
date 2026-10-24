import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signup: vi.fn(), oauth: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signUp: mocks.signup, signInWithPassword: vi.fn() } } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock("@/lib/consents", () => ({ flushPendingConsents: vi.fn() }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
vi.mock("@/lib/docFunnel", () => ({ trackAuthPromptShown: vi.fn() }));
import { InlineAuthDialog } from "@/components/auth/InlineAuthDialog";
beforeEach(() => { mocks.signup.mockReset().mockResolvedValue({ data: { session: null }, error: null }); sessionStorage.clear(); });
const open = async () => {
  render(<MemoryRouter><InlineAuthDialog /></MemoryRouter>);
  act(() => window.dispatchEvent(new CustomEvent("dogovori:inline-auth", { detail: { mode: "signup" } })));
  await screen.findByRole("dialog");
};
describe("inline auth confirmation and consent", () => {
  it("email-confirmed login button exits the email-sent panel into the login form", async () => {
    await open();
    for (const id of ["inline-c-age", "inline-c-terms", "inline-c-privacy", "inline-c-notify"]) fireEvent.click(document.getElementById(id) as HTMLElement);
    expect(screen.getByRole("checkbox", { name: /Искам полезни/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Електронна поща"), { target: { value: "fixture@example.com" } });
    fireEvent.change(screen.getByLabelText("Парола", { exact: true }), { target: { value: "fixture-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Създай профил и продължи" }));
    await screen.findByRole("button", { name: "Вече потвърдих — вход" });
    expect(mocks.signup.mock.calls[0][0].options.data.signup_handoff.marketing).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Вече потвърдих — вход" }));
    await screen.findByRole("button", { name: "Вход и продължаване" });
    expect(screen.getByLabelText("Парола", { exact: true })).toBeInTheDocument();
  });
  it("OAuth cannot create a signup account without explicit required choices", async () => {
    await open();
    const google = screen.getByRole("button", { name: "Продължи с Google" });
    expect(google).toBeDisabled();
    fireEvent.click(google);
    await waitFor(() => expect(mocks.oauth).not.toHaveBeenCalled());
  });
});