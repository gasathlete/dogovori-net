/**
 * Regression: a server-captured signup handoff destination replaces only the
 * default `/account` fallback, never a deliberate explicit safe destination.
 * Navigation is simulated with sessionStorage + a mocked consume RPC (not a real
 * first-use fixture confirmation).
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: vi.fn(),
  },
}));

import {
  applyHandoffDestination, setPostLoginDestination, POST_LOGIN_KEY, POST_LOGIN_FALLBACK_KEY,
} from "@/lib/postLoginDestination";
import { flushPendingConsents } from "@/lib/consents";

beforeEach(() => { sessionStorage.clear(); rpc.mockReset(); });

describe("handoff destination priority", () => {
  it("server path beats the /account fallback written by ordinary login", () => {
    setPostLoginDestination("/account", false);
    expect(applyHandoffDestination("/plans")).toBe(true);
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/plans");
    expect(sessionStorage.getItem(POST_LOGIN_FALLBACK_KEY)).toBeNull();
  });

  it("explicit safe product intent beats the server path", () => {
    setPostLoginDestination("/produkti/proverka-predi-podpis/start", true);
    expect(applyHandoffDestination("/plans")).toBe(false);
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/produkti/proverka-predi-podpis/start");
  });

  it("stale fallback marker does not downgrade a later explicit value", () => {
    setPostLoginDestination("/account", false);
    sessionStorage.setItem(POST_LOGIN_KEY, "/catalog"); // explicit write by older code path
    expect(applyHandoffDestination("/plans")).toBe(false);
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/catalog");
  });

  it("unsafe server path never becomes an open redirect", () => {
    setPostLoginDestination("/account", false);
    applyHandoffDestination("//evil.example/x");
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/account");
  });

  it("no local destination at all uses the server path", () => {
    expect(applyHandoffDestination("/plans")).toBe(true);
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/plans");
  });
});

describe("first-confirmation login race (mock RPC)", () => {
  it("ordinary login fallback then consume returns /plans → destination /plans", async () => {
    setPostLoginDestination("/account", false);
    rpc.mockResolvedValueOnce({ data: { ok: true, return_path: "/plans" }, error: null });
    await flushPendingConsents();
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/plans");
  });

  it("replayed consume (already consumed, no path) keeps /account", async () => {
    setPostLoginDestination("/account", false);
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await flushPendingConsents();
    expect(sessionStorage.getItem(POST_LOGIN_KEY)).toBe("/account");
  });
});

describe("entrypoints mark provenance", () => {
  it("Auth page marks /account as fallback and other targets explicit (login, OTP, Google)", () => {
    const src = readFileSync("src/pages/Auth.tsx", "utf8");
    expect(src).toContain('const redirectExplicit = redirect !== "/account";');
    expect(src.match(/setPostLoginDestination\(redirect, redirectExplicit\)/g)?.length).toBe(3);
    expect(src).not.toContain('sessionStorage.setItem("post_login_redirect"');
  });
  it("inline dialog stores current page as explicit intent", () => {
    const src = readFileSync("src/components/auth/InlineAuthDialog.tsx", "utf8");
    expect(src).toContain("setPostLoginDestination(currentReturnPath(), true)");
  });
});
