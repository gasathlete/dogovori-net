/**
 * Предварителен режим: syncDraft отказва нов/променен суров запис ПРЕДИ
 * мрежата; локалното съдържание остава, указателят не се пипа. Причината е
 * възстановима (не е преходна → без безкрайни опити; не е откачваща).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prelaunch", async (original) => ({
  ...(await original<typeof import("@/lib/prelaunch")>()),
  canStartNewProcessing: () => false,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const invokeMock = vi.fn();
vi.mock("@/lib/invokeEdgeFunction", () => ({ invokeEdgeFunction: (...a: unknown[]) => invokeMock(...a) }));

import {
  isDetachDraftReason,
  isDraftServerSyncOpen,
  isTransientDraftReason,
  LOCAL_DRAFT_ID,
  readPayload,
  readPointer,
  reasonFromResponse,
  syncDraft,
  writePayload,
  writePointer,
  type DraftPointer,
} from "@/lib/activationDraft";

const DRAFT_ID = "11111111-2222-4333-8444-555555555555";
const payload = { answers: { party: "Синтетично ООД" }, stepIdx: 2 } as never;

describe("syncDraft при затворен предварителен режим", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    invokeMock.mockReset();
  });

  it("изрично затвореният флаг спира сървърния запис на чернова", () => {
    expect(isDraftServerSyncOpen()).toBe(false);
  });

  it("нова чернова: нула мрежови заявки, локалното съдържание остава", async () => {
    writePayload(LOCAL_DRAFT_ID, payload);
    const res = await syncDraft({ pointer: null, flow: "build", route: "/build", stepIdx: 2, payload, hasResult: true });
    expect(res).toEqual({ ok: false, reason: "prelaunch_closed" });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(readPayload(LOCAL_DRAFT_ID)).toEqual(payload);
    expect(readPointer()).toBeNull();
  });

  it("съществуваща чернова: нула заявки, указателят и съдържанието не се пипат", async () => {
    const p: DraftPointer = {
      draftId: DRAFT_ID, claimToken: "t".repeat(43), flow: "build", route: "/build", stepIdx: 1,
      hasResult: false, tabId: "tab", ts: Date.now(), expiresAt: Date.now() + 60_000, claimed: false,
    };
    writePointer(p);
    writePayload(DRAFT_ID, payload);
    const res = await syncDraft({ pointer: p, flow: "build", route: "/build", stepIdx: 3, payload, hasResult: true });
    expect(res).toEqual({ ok: false, reason: "prelaunch_closed" });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(readPointer()?.draftId).toBe(DRAFT_ID);
    expect(readPayload(DRAFT_ID)).toEqual(payload);
  });

  it("prelaunch_closed е възстановимо: нито преходно, нито откачващо; сървърният отговор се разпознава", () => {
    expect(isTransientDraftReason("prelaunch_closed")).toBe(false);
    expect(isDetachDraftReason("prelaunch_closed")).toBe(false);
    expect(reasonFromResponse({ ok: false, reason: "prelaunch_closed" }, { status: 503 })).toBe("prelaunch_closed");
  });
});
