// Popup Google sign-in (no full redirect) must follow the same consent step as
// the redirect flow in useAuth. All network is mocked; no real OAuth.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const m = vi.hoisted(() => ({ current: true, signedIn: false, upsert: vi.fn(), rpc: vi.fn(), oauth: vi.fn(), listeners: [] as Array<(event: string, session: unknown) => void> }));
const session = { user: { id: "aaaaaaaa-0000-4000-8000-000000000001" } };
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: m.signedIn ? session.user : null } }),
    getSession: async () => ({ data: { session: m.signedIn ? session : null } }),
    onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
      m.listeners.push(listener);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    signOut: vi.fn(),
  },
  rpc: m.rpc,
  from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, in: () => query,
      maybeSingle: async () => ({ data: { granted: m.current }, error: null }), upsert: m.upsert, insert: m.upsert };
    return query;
  },
  functions: { invoke: vi.fn() },
  channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe: vi.fn() }; return c; },
  removeChannel: vi.fn(),
} }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: m.oauth } } }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
vi.mock("@/lib/docFunnel", () => ({ trackAuthPromptShown: vi.fn() }));
vi.mock("@/components/Seo", () => ({ Seo: () => null, default: () => null }));
import { AuthProvider } from "@/hooks/useAuth";
import { InlineAuthDialog } from "@/components/auth/InlineAuthDialog";
import { openInlineAuth } from "@/lib/inlineAuth";

const replace = vi.fn();
const location = window.location;
beforeEach(() => {
  sessionStorage.clear(); m.listeners.length = 0; m.upsert.mockReset(); replace.mockReset(); m.current = true; m.signedIn = false;
  m.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  // Popup: the SDK sets the session in-page and fires SIGNED_IN, no redirect.
  m.oauth.mockReset().mockImplementation(async () => {
    m.signedIn = true;
    m.listeners.forEach(listener => listener("SIGNED_IN", session));
    return { redirected: false };
  });
  Object.defineProperty(window, "location", { configurable: true, value: { origin: "http://localhost:8080", pathname: "/build", search: "", hash: "", href: "http://localhost:8080/build", replace } });
});
afterEach(() => { cleanup(); Object.defineProperty(window, "location", { configurable: true, value: location }); });

async function startInlinePopup(resume: () => void) {
  render(<MemoryRouter><AuthProvider><InlineAuthDialog /></AuthProvider></MemoryRouter>);
  act(() => openInlineAuth({ mode: "signup", action: "Изготвяне", onSuccess: resume }));
  await screen.findByRole("dialog");
  for (const id of ["inline-c-age", "inline-c-terms", "inline-c-privacy", "inline-c-notify"]) fireEvent.click(document.getElementById(id) as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "Продължи с Google" }));
  await waitFor(() => expect(m.oauth).toHaveBeenCalledTimes(1));
}

it("inline popup: returning account with current consents continues the task without a second dialog", async () => {
  const resume = vi.fn();
  await startInlinePopup(resume);
  await waitFor(() => expect(resume).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(screen.queryByText("Запази избора")).toBeNull();
  expect(m.upsert).not.toHaveBeenCalled();
});

it("inline popup: new account sees the consent dialog once; the task waits for it", async () => {
  m.current = false; const resume = vi.fn();
  await startInlinePopup(resume);
  await screen.findByRole("button", { name: "Запази избора", hidden: true });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(screen.getAllByRole("button", { name: "Запази избора", hidden: true })).toHaveLength(1);
  expect(resume).not.toHaveBeenCalled();
});

it("inline popup: dismissing the consent dialog records nothing and does not continue the task", async () => {
  m.current = false; const resume = vi.fn();
  await startInlinePopup(resume);
  const save = await screen.findByRole("button", { name: "Запази избора", hidden: true });
  fireEvent.keyDown(save.closest("[role=dialog]") as HTMLElement, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Запази избора", hidden: true })).toBeNull());
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(resume).not.toHaveBeenCalled();
  expect(m.upsert).not.toHaveBeenCalled();
  // Start destination was the current page: the user stays on /build.
  expect(replace).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("post_login_redirect")).toBeNull();
});

import Auth from "@/pages/Auth";
async function startAuthPagePopup() {
  window.location.pathname = "/auth"; (window.location as { search: string }).search = "?redirect=%2Fplans";
  render(<MemoryRouter initialEntries={["/auth?redirect=%2Fplans"]}><AuthProvider><Routes><Route path="/auth" element={<Auth />} /></Routes></AuthProvider></MemoryRouter>);
  const google = await screen.findAllByRole("button", { name: /Google/ });
  fireEvent.click(google[0]);
  await waitFor(() => expect(document.getElementById("g-age")).not.toBeNull());
  for (const id of ["g-age", "g-terms", "g-privacy", "g-notify"]) fireEvent.click(document.getElementById(id) as HTMLElement);
  const go = screen.getAllByRole("button", { name: "Продължи с Google", hidden: true }).at(-1) as HTMLElement;
  fireEvent.click(go);
  await waitFor(() => expect(m.oauth).toHaveBeenCalledTimes(1));
}

it("/auth popup: returning account goes to the start destination without a second dialog", async () => {
  await startAuthPagePopup();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/plans"));
  expect(screen.queryByRole("button", { name: "Запази избора", hidden: true })).toBeNull();
  expect(m.upsert).not.toHaveBeenCalled();
});

it("/auth popup: new account gets one dialog; dismissal records nothing and returns to the start destination", async () => {
  m.current = false;
  await startAuthPagePopup();
  const save = await screen.findByRole("button", { name: "Запази избора", hidden: true });
  expect(replace).not.toHaveBeenCalled();
  fireEvent.keyDown(save.closest("[role=dialog]") as HTMLElement, { key: "Escape" });
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/plans"));
  expect(replace).toHaveBeenCalledTimes(1);
  expect(m.upsert).not.toHaveBeenCalled();
});
