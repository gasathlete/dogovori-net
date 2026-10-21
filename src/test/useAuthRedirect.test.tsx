/**
 * Пренасочване след вход и при вече налична сесия (първоначално четене).
 * Целта се изразходва точно веднъж и не се обработва двойно.
 */
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionValue: { user: { id: string } } | null = null;
const listeners: Array<(event: string, s: unknown) => void> = [];
const consent = vi.hoisted(() => ({ flush: vi.fn() }));
vi.mock("@/lib/consents", () => ({ flushPendingConsents: consent.flush }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, s: unknown) => void) => {
        listeners.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: async () => ({ data: { session: sessionValue } }),
      signOut: vi.fn(),
    },
  },
}));

import { AuthProvider } from "@/hooks/useAuth";

const replace = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  listeners.length = 0;
  replace.mockReset();
  consent.flush.mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
  localStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { origin: "http://localhost:3000", pathname: "/", search: "", replace },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

describe("AuthProvider — пренасочване", () => {
  it("waits for explicit signup consent persistence before redirect", async () => {
    sessionValue = { user: { id: "u1" } };
    let persisted: (() => void) | undefined;
    consent.flush.mockReturnValue(new Promise<void>((resolve) => { persisted = resolve; }));
    sessionStorage.setItem("post_login_redirect", "/catalog");
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(consent.flush).toHaveBeenCalledTimes(1));
    expect(replace).not.toHaveBeenCalled();
    persisted?.();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/catalog"));
  });
  it("честит целта и когато сесията идва от първоначалното четене", async () => {
    sessionValue = { user: { id: "u1" } };
    sessionStorage.setItem("post_login_redirect", "/wizard/it?doc=nda");
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/wizard/it?doc=nda"));
    // Изразходвана — не залепва за следващ вход.
    expect(sessionStorage.getItem("post_login_redirect")).toBeNull();
  });

  it("изразходва целта и когато съвпада с текущия маршрут, без пренасочване", async () => {
    sessionValue = { user: { id: "u1" } };
    sessionStorage.setItem("post_login_redirect", "/");
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(sessionStorage.getItem("post_login_redirect")).toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });

  it("не пренасочва без сесия", async () => {
    sessionValue = null;
    sessionStorage.setItem("post_login_redirect", "/catalog");
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 10));
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("post_login_redirect")).toBe("/catalog");
  });

  it("не обработва два пъти при SIGNED_IN след налична сесия", async () => {
    sessionValue = { user: { id: "u1" } };
    sessionStorage.setItem("post_login_redirect", "/catalog");
    render(<AuthProvider><div /></AuthProvider>);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    listeners.forEach((cb) => cb("SIGNED_IN", sessionValue));
    await new Promise((r) => setTimeout(r, 10));
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
