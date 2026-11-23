import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signup: vi.fn(), oauth: vi.fn(), login: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signUp: mocks.signup, signInWithPassword: mocks.login } } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock("@/lib/consents", () => ({ flushPendingConsents: vi.fn() }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
vi.mock("@/lib/docFunnel", () => ({ trackAuthPromptShown: vi.fn() }));
import { InlineAuthDialog } from "@/components/auth/InlineAuthDialog";
import { openInlineAuth } from "@/lib/inlineAuth";
beforeEach(() => { mocks.signup.mockReset().mockResolvedValue({ data: { session: null }, error: null }); mocks.login.mockReset(); sessionStorage.clear(); });
const open = async () => {
  render(<MemoryRouter><InlineAuthDialog /></MemoryRouter>);
  act(() => window.dispatchEvent(new CustomEvent("dogovori:inline-auth", { detail: { mode: "signup" } })));
  await screen.findByRole("dialog");
};
describe("inline auth confirmation and consent", () => {
  it("generation login resumes the same local action once after success, never after a failed login", async () => {
    const resume = vi.fn();
    mocks.login.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } }).mockResolvedValueOnce({ error: null });
    render(<MemoryRouter><InlineAuthDialog /></MemoryRouter>);
    act(() => openInlineAuth({ mode: "login", action: "Изготвяне на документа", onSuccess: resume }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Електронна поща"), { target: { value: "fixture@example.test" } });
    fireEvent.change(screen.getByLabelText("Парола", { exact: true }), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Вход и продължаване" }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));
    expect(resume).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Вход и продължаване" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Вход и продължаване" }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
  });
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