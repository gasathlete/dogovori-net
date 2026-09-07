/**
 * Stage 2a — контракт на envelope-а на фунията.
 *
 * Проверява: версия/release, стабилни резерви в паметта, истинска сесия на таба,
 * нов journey при изричен CTA, преизползване при същия документ, гейт по съгласие
 * (нито GA, нито dataLayer, нито запис в базата без съгласие) и дедупликация,
 * когато localStorage хвърля.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCategoryConsent, trackEvent } = vi.hoisted(() => ({
  getCategoryConsent: vi.fn<(c: string) => boolean>(() => true),
  trackEvent: vi.fn<(name: string, props?: Record<string, unknown>) => void>(),
}));
const { insert } = vi.hoisted(() => ({
  insert: vi.fn<(row: Record<string, unknown>) => Promise<{ error: null }>>(() =>
    Promise.resolve({ error: null }),
  ),
}));


vi.mock("@/lib/analytics", () => ({ getCategoryConsent, trackEvent }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ insert }),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

import {
  FUNNEL_CONTEXT_KEYS,
  FUNNEL_RELEASE,
  FUNNEL_SCHEMA_VERSION,
  __resetFunnelContextForTests,
  ensureDocumentJourney,
  getBrowserId,
  getCurrentFunnelContext,
  getTabSessionId,
  startDocumentJourney,
} from "@/lib/funnelContext";
import { trackFunnelEvent, getFunnelSessionId, __resetFunnelIdentityForTests } from "@/lib/funnel";
import { STORED_NAME, claimOnce, resetOnceStore } from "@/lib/funnelEvents";
import { trackDocStart } from "@/lib/docFunnel";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetFunnelContextForTests();
  __resetFunnelIdentityForTests();
  resetOnceStore();
  getCategoryConsent.mockReset();
  getCategoryConsent.mockImplementation(() => true);
  trackEvent.mockClear();
  insert.mockClear();
  (window as unknown as { dataLayer?: unknown[] }).dataLayer = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

const dataLayer = () => ((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []) as Array<Record<string, unknown>>;

describe("funnelContext — версия и идентификатори", () => {
  it("схемата и release-ът са фиксирани и с ниска кардиналност", () => {
    expect(FUNNEL_SCHEMA_VERSION).toBe(2);
    expect(FUNNEL_RELEASE).toBe("s2funnel-v2a");
    expect(FUNNEL_RELEASE).toMatch(/^[a-z0-9._-]{1,16}$/);
  });

  it("browser_id е траен в localStorage и ползва историческия ключ", () => {
    const id = getBrowserId();
    expect(localStorage.getItem(FUNNEL_CONTEXT_KEYS.browserId)).toBe(id);
    expect(getBrowserId()).toBe(id);
    expect(getFunnelSessionId()).toBe(id);
  });

  it("browser_id остава стабилен в паметта, когато localStorage хвърля", () => {
    __resetFunnelContextForTests();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const a = getBrowserId();
    const b = getBrowserId();
    expect(a).toBe(b);
    expect(a).toBeTruthy();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("tab_session_id е в sessionStorage (истинска сесия), различен от browser_id", () => {
    const tab = getTabSessionId();
    expect(sessionStorage.getItem(FUNNEL_CONTEXT_KEYS.tabSession)).toBe(tab);
    expect(tab).not.toBe(getBrowserId());
    // Нов таб = празен sessionStorage → нов идентификатор.
    sessionStorage.clear();
    __resetFunnelContextForTests();
    localStorage.setItem(FUNNEL_CONTEXT_KEYS.browserId, "stable-browser-id");
    expect(getTabSessionId()).not.toBe(tab);
    expect(getBrowserId()).toBe("stable-browser-id");
  });
});

describe("funnelContext — journey / run", () => {
  it("изричен старт винаги дава нов journey и run, дори за същия документ", () => {
    const a = startDocumentJourney("naem");
    const b = startDocumentJourney("naem");
    expect(b.journey_id).not.toBe(a.journey_id);
    expect(b.run_id).not.toBe(a.run_id);
    expect(b.doc_key).toBe("naem");
  });

  it("ensure преизползва при съвпадащ нормализиран doc_key", () => {
    const a = startDocumentJourney("Naem");
    const b = ensureDocumentJourney("naem");
    expect(b.run_id).toBe(a.run_id);
    expect(b.journey_id).toBe(a.journey_id);
  });

  it("ensure създава нов run при друг документ", () => {
    const a = ensureDocumentJourney("naem");
    const b = ensureDocumentJourney("trudov-dogovor");
    expect(b.run_id).not.toBe(a.run_id);
  });

  it("без doc_key се създава непрозрачен контекст, без свободен текст", () => {
    const ctx = ensureDocumentJourney(undefined);
    expect(ctx.doc_key).toBe("unknown");
    expect(ctx.run_id).toBeTruthy();
    expect(JSON.stringify(ctx)).not.toMatch(/@|\?|=/);
  });
});

describe("trackFunnelEvent — envelope", () => {
  it("добавя schema_version, release, browser_id, tab_session_id и контекста", () => {
    startDocumentJourney("naem");
    expect(trackFunnelEvent("some_event", { slug: "naem" })).toBe(true);
    const props = trackEvent.mock.calls[0][1] as Record<string, unknown>;
    expect(props.schema_version).toBe(2);
    expect(props.release).toBe("s2funnel-v2a");
    expect(props.browser_id).toBe(getBrowserId());
    expect(props.tab_session_id).toBe(getTabSessionId());
    expect(props.journey_id).toBe(getCurrentFunnelContext().journey_id);
    expect(props.run_id).toBe(getCurrentFunnelContext().run_id);
    expect(props.doc_key).toBe("naem");
    expect(props.slug).toBe("naem");
  });

  it("call site НЕ може да пренапише идентичността или версията", () => {
    startDocumentJourney("naem");
    trackFunnelEvent("some_event", {
      schema_version: 99,
      release: "hacked",
      browser_id: "spoofed",
      tab_session_id: "spoofed",
      run_id: "spoofed",
    });
    const props = trackEvent.mock.calls[0][1] as Record<string, unknown>;
    expect(props.schema_version).toBe(2);
    expect(props.release).toBe("s2funnel-v2a");
    expect(props.browser_id).not.toBe("spoofed");
    expect(props.tab_session_id).not.toBe("spoofed");
    expect(props.run_id).not.toBe("spoofed");
  });

  it("колоната session_id остава равна на browser_id", async () => {
    trackFunnelEvent("some_event");
    await new Promise((r) => setTimeout(r, 0));
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.session_id).toBe(getBrowserId());
    expect(row.name).toBe("some_event");
  });
});

describe("trackFunnelEvent — съгласие за аналитика", () => {
  it("без съгласие няма GA, dataLayer и запис в базата", async () => {
    getCategoryConsent.mockImplementation(() => false);
    expect(trackFunnelEvent("some_event")).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEvent).not.toHaveBeenCalled();
    expect(dataLayer()).toHaveLength(0);
    expect(insert).not.toHaveBeenCalled();
  });

  it("при отказ от четене на съгласието също няма страничен ефект", async () => {
    getCategoryConsent.mockImplementation(() => {
      throw new Error("no prefs");
    });
    expect(trackFunnelEvent("some_event")).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEvent).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("със съгласие изпраща и към GA, и към dataLayer, и към базата", async () => {
    expect(trackFunnelEvent("some_event")).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(dataLayer()).toHaveLength(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

describe("дедупликация", () => {
  it("един doc_start на run, независимо от source етикета", () => {
    startDocumentJourney("naem");
    expect(trackDocStart({ doc_key: "naem", source: "wizard" })).toBe(true);
    expect(trackDocStart({ doc_key: "naem", source: "catalog" })).toBe(false);
    const names = trackEvent.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === "doc_start")).toHaveLength(1);
  });

  it("нов изричен старт на същия документ дава нов doc_start", () => {
    startDocumentJourney("naem");
    expect(trackDocStart({ doc_key: "naem", source: "wizard" })).toBe(true);
    startDocumentJourney("naem");
    expect(trackDocStart({ doc_key: "naem", source: "wizard" })).toBe(true);
  });

  it("claimOnce остава стабилен, когато localStorage хвърля", () => {
    resetOnceStore();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(claimOnce("k1")).toBe(true);
    expect(claimOnce("k1")).toBe(false);
    expect(claimOnce("k2")).toBe(true);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("исторически имена", () => {
  it("STORED_NAME е байт-за-байт непроменен", () => {
    expect(STORED_NAME).toEqual({
      document_selected: "doc_start",
      wizard_step_completed: "doc_fill_step",
      generation_started: "doc_generate_started",
      generation_succeeded: "doc_generate_success",
      generation_failed: "doc_generate_fail",
      generation_blocked: "doc_generate_blocked",
      auth_prompt_shown: "auth_prompt_shown",
      signup_completed: "signup_completed",
      result_viewed: "result_viewed",
      paywall_shown: "paywall_shown",
      checkout_started: "checkout_started",
      checkout_completed: "upgrade_completed",
      document_saved: "document_saved",
      document_downloaded: "doc_download_success",
      download_failed: "doc_download_fail",
      draft_created: "draft_created",
      draft_autosaved: "draft_autosaved",
      draft_restore_offered: "draft_restore_offered",
      draft_restored: "draft_restored",
      draft_claim_started: "draft_claim_started",
      draft_claim_succeeded: "draft_claim_succeeded",
      draft_claim_blocked: "draft_claim_blocked",
      draft_sync_blocked: "draft_sync_blocked",
      draft_expired: "draft_expired",
    });
  });
});
