/**
 * Stage 2a2 — контракт за непрекъснатост на атрибуцията при нов таб.
 *
 * Доказва точно липсващото звено: `journey_id`/`run_id` живеят в sessionStorage,
 * а указателят в localStorage вече ги носи, така че нов таб (имейл линк, OAuth)
 * възстановява СЪЩИЯ run ПРЕДИ присвояването и преди всяко следващо събитие.
 *
 * Тук няма мокване на docFunnel/funnel — envelope-ът се проверява такъв, какъвто
 * реално се изпраща.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCategoryConsent, trackEvent } = vi.hoisted(() => ({
  getCategoryConsent: vi.fn<(c: string) => boolean>(() => true),
  trackEvent: vi.fn<(name: string, props?: Record<string, unknown>) => void>(),
}));
vi.mock("@/lib/analytics", () => ({ getCategoryConsent, trackEvent }));

let authUser: { id: string } | null = null;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authUser, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert: () => Promise.resolve({ error: null }) }),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const syncMock = vi.fn();
const claimMock = vi.fn();
vi.mock("@/lib/activationDraft", async () => {
  const actual = await vi.importActual<typeof import("@/lib/activationDraft")>("@/lib/activationDraft");
  return {
    ...actual,
    isActivationContinuityEnabled: () => true,
    syncDraft: (...args: unknown[]) => syncMock(...args),
    claimDraft: (...args: unknown[]) => claimMock(...args),
    loadSavedDraftPayload: vi.fn(async () => null),
  };
});

import { useActivationDraft } from "@/hooks/useActivationDraft";
import { ANON_DRAFT_TTL_MS, writePointer, type DraftPointer } from "@/lib/activationDraft";
import {
  __resetFunnelContextForTests,
  getCurrentFunnelContext,
  startDocumentJourney,
} from "@/lib/funnelContext";
import { __resetFunnelIdentityForTests } from "@/lib/funnel";
import { resetOnceStore } from "@/lib/funnelEvents";
import { trackDownload } from "@/lib/docFunnel";

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";

function pointer(overrides: Partial<DraftPointer> = {}): DraftPointer {
  return {
    draftId: DRAFT_ID,
    claimToken: "abcdefghijklmnopqrstuvwx",
    flow: "wizard",
    docKey: "sector::doc",
    route: "/wizard/it?doc=nda",
    stepIdx: 1,
    hasResult: true,
    tabId: "tab-1",
    ts: Date.now(),
    expiresAt: Date.now() + ANON_DRAFT_TTL_MS,
    claimed: false,
    ...overrides,
  };
}

function render(docKey = "sector::doc") {
  return renderHook(() => useActivationDraft({ flow: "wizard", docKey, route: "/wizard/it?doc=nda" }));
}

/** Симулира нов таб: контекстът в паметта/sessionStorage изчезва, указателят — не. */
function simulateNewTab() {
  __resetFunnelContextForTests();
  __resetFunnelIdentityForTests();
  sessionStorage.clear();
  resetOnceStore();
}

function propsFor(namePart: string): Record<string, unknown> | undefined {
  const call = trackEvent.mock.calls.find(([name]) => String(name).includes(namePart));
  return call?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetFunnelContextForTests();
  __resetFunnelIdentityForTests();
  resetOnceStore();
  syncMock.mockReset();
  claimMock.mockReset();
  trackEvent.mockClear();
  getCategoryConsent.mockReset();
  getCategoryConsent.mockImplementation(() => true);
  (window as unknown as { dataLayer?: unknown[] }).dataLayer = [];
  authUser = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("нов таб възстановява оригиналния journey/run преди присвояване", () => {
  it("claim и следващото сваляне носят точно същите journey_id и run_id", async () => {
    // 1) Оригиналният таб: изричен старт + указател с атрибуция.
    const original = startDocumentJourney("sector::doc");
    writePointer(pointer({ journeyId: original.journey_id, runId: original.run_id }));

    // 2) Нов таб от имейл/OAuth — контекстът е празен.
    simulateNewTab();
    expect(getCurrentFunnelContext().run_id).toBeUndefined();

    authUser = { id: "user-1" };
    claimMock.mockResolvedValue({
      ok: true,
      route: "/wizard/it?doc=nda",
      flow: "wizard",
      docKey: "sector::doc",
      stepIdx: 1,
      hasResult: true,
      payload: { answers: { a: "1" } },
    });

    await act(async () => {
      render();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Контекстът е върнат ПРЕДИ събитията, без нов run.
    expect(getCurrentFunnelContext().journey_id).toBe(original.journey_id);
    expect(getCurrentFunnelContext().run_id).toBe(original.run_id);

    const started = propsFor("draft_claim_started");
    const succeeded = propsFor("draft_claim_succeeded");
    expect(started?.run_id).toBe(original.run_id);
    expect(succeeded?.journey_id).toBe(original.journey_id);
    expect(succeeded?.run_id).toBe(original.run_id);

    // Последващото сваляне наследява същия run.
    trackDownload("success", { doc_key: "sector::doc" });
    const download = propsFor("download");
    expect(download?.journey_id).toBe(original.journey_id);
    expect(download?.run_id).toBe(original.run_id);
  });

  it("указател за ДРУГ документ не отнема свеж journey", async () => {
    const other = startDocumentJourney("sector::other-doc");
    writePointer(pointer({ docKey: "sector::other-doc", journeyId: other.journey_id, runId: other.run_id }));
    simulateNewTab();
    const fresh = startDocumentJourney("sector::doc");

    await act(async () => {
      render("sector::doc");
      await Promise.resolve();
    });

    expect(getCurrentFunnelContext().run_id).toBe(fresh.run_id);
    expect(getCurrentFunnelContext().journey_id).toBe(fresh.journey_id);
  });

  it("стар указател без атрибуция запазва текущия контекст", async () => {
    writePointer(pointer());
    const current = startDocumentJourney("sector::doc");

    await act(async () => {
      render();
      await Promise.resolve();
    });

    expect(getCurrentFunnelContext().run_id).toBe(current.run_id);
  });
});
