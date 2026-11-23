import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => ({ current: true, upsert: vi.fn(), rpc: vi.fn(), listeners: [] as Array<(event: string, session: unknown) => void> }));
const session = { user: { id: "aaaaaaaa-0000-4000-8000-000000000001" } };
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: session.user } }),
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
      m.listeners.push(listener);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    signOut: vi.fn(),
  },
  rpc: m.rpc,
  from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => ({ data: { granted: m.current }, error: null }), upsert: m.upsert };
    return query;
  },
} }));
import { AuthProvider } from "@/hooks/useAuth";

const replace = vi.fn();
const location = window.location;
beforeEach(() => {
  sessionStorage.clear(); m.listeners.length = 0; m.upsert.mockReset(); replace.mockReset(); m.current = true;
  m.rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  Object.defineProperty(window, "location", { configurable: true, value: { origin: "http://localhost:8080", pathname: "/", search: "", replace } });
  sessionStorage.setItem("post_login_redirect", "/plans");
  sessionStorage.setItem("pending_consents", JSON.stringify({ terms: true, privacy: true, age_18: true, operational_notifications: true, oauth_pending: true }));
});
afterEach(() => { cleanup(); Object.defineProperty(window, "location", { configurable: true, value: location }); });
function mount() { render(<MemoryRouter><AuthProvider><div /></AuthProvider></MemoryRouter>); }

it("returning Google owner with current required consents returns to the original destination without another dialog/write", async () => {
  mount();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/plans"));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(m.upsert).not.toHaveBeenCalled();
});
it("new Google account: one dialog, dismissal writes nothing and returns to the destination", async () => {
  m.current = false; mount();
  await screen.findByRole("dialog");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(replace).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/plans"));
  expect(m.upsert).not.toHaveBeenCalled(); expect(sessionStorage.getItem("post_login_redirect")).toBeNull();
});
it("initial session plus repeated SIGNED_IN cannot navigate around the pending authenticated choice", async () => {
  m.current = false; mount(); await screen.findByRole("dialog");
  await act(async () => {
    m.listeners.forEach(listener => listener("SIGNED_IN", session));
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  expect(replace).not.toHaveBeenCalled(); expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(m.upsert).not.toHaveBeenCalled();
});
it("simultaneous initial session and SIGNED_IN flush the OAuth choice only once", async () => {
  let finishHandoff: (() => void) | undefined;
  m.rpc.mockImplementation(() => new Promise(resolve => { finishHandoff = () => resolve({ data: { ok: true }, error: null }); }));
  m.current = false; mount();
  act(() => m.listeners.forEach(listener => listener("SIGNED_IN", session)));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(m.rpc).toHaveBeenCalledTimes(1);
  act(() => finishHandoff?.());
  await screen.findByRole("dialog");
  expect(replace).not.toHaveBeenCalled(); expect(m.upsert).not.toHaveBeenCalled();
});