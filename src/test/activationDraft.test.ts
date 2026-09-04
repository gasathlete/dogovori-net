/**
 * Тестове за каноничния модел на анонимната чернова.
 *
 * Гарантират трите неща, от които зависи непрекъснатостта на активацията:
 *  - в localStorage влиза само указател без лични данни;
 *  - изтекла чернова не се възстановява;
 *  - старите ключове с лични данни се мигрират и изтриват еднократно.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const invokeMock = vi.fn();
vi.mock("@/lib/invokeEdgeFunction", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeMock(...args),
}));

import {
  ANON_DRAFT_TTL_MS,
  CLAIMED_DRAFT_TTL_MS,
  DRAFT_POINTER_KEY,
  LOCAL_DRAFT_ID,
  claimDraft,
  claimRetryDelay,
  clearDraftIfCurrent,
  MAX_CLAIM_ATTEMPTS,
  clearAllDraftStorage,
  clearDraft,
  clearStagedLegacyDrafts,
  hasUserContent,
  isDetachDraftReason,
  isForeignTab,
  isSafeRoute,
  isTransientDraftReason,
  readPayload,
  readPointer,
  sanitizeDraftRoute,
  syncDraft,
  takeLegacyDrafts,
  writePayload,
  writePointer,
  type DraftPointer,
} from "@/lib/activationDraft";

function pointer(overrides: Partial<DraftPointer> = {}): DraftPointer {
  return {
    draftId: "11111111-1111-4111-8111-111111111111",
    claimToken: "abcdefghijklmnopqrstuvwx",
    flow: "wizard",
    docKey: "sector::doc",
    route: "/wizard/it?doc=nda",
    stepIdx: 2,
    hasResult: false,
    tabId: "tab-1",
    ts: Date.now(),
    expiresAt: Date.now() + ANON_DRAFT_TTL_MS,
    claimed: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  invokeMock.mockReset();
});

describe("isSafeRoute", () => {
  it("приема относителни пътища и отхвърля външни", () => {
    expect(isSafeRoute("/wizard/it")).toBe(true);
    expect(isSafeRoute("//evil.com")).toBe(false);
    expect(isSafeRoute("https://evil.com")).toBe(false);
    expect(isSafeRoute("/\\evil")).toBe(false);
    expect(isSafeRoute("/")).toBe(true);
    expect(isSafeRoute(undefined)).toBe(false);
  });
});

describe("указател", () => {
  it("записва само изброените полета — без лични данни", () => {
    writePointer({ ...pointer(), answers: { egn: "1234" } } as unknown as DraftPointer);
    const raw = localStorage.getItem(DRAFT_POINTER_KEY)!;
    expect(raw).not.toContain("1234");
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(
      ["claimToken", "claimed", "docKey", "draftId", "expiresAt", "flow", "hasResult", "route", "stepIdx", "tabId", "ts"],
    );
  });

  it("нормализира небезопасен маршрут и отрицателна стъпка", () => {
    writePointer(pointer({ route: "https://evil.com", stepIdx: -5 }));
    const read = readPointer()!;
    expect(read.route).toBe("/");
    expect(read.stepIdx).toBe(0);
  });

  it("не връща изтекла чернова и я изчиства заедно със съдържанието", () => {
    const p = pointer({ expiresAt: Date.now() - 1000 });
    writePointer(p);
    writePayload(p.draftId, { answers: { a: "b" } });
    expect(readPointer()).toBeNull();
    expect(localStorage.getItem(DRAFT_POINTER_KEY)).toBeNull();
    expect(readPayload(p.draftId)).toBeNull();
  });

  it("изчиства повреден запис", () => {
    localStorage.setItem(DRAFT_POINTER_KEY, "{not json");
    expect(readPointer()).toBeNull();
    localStorage.setItem(DRAFT_POINTER_KEY, JSON.stringify({ draftId: "x" }));
    expect(readPointer()).toBeNull();
    expect(localStorage.getItem(DRAFT_POINTER_KEY)).toBeNull();
  });

  it("разпознава указател от друг таб", () => {
    expect(isForeignTab(pointer({ tabId: "other-tab" }))).toBe(true);
    expect(isForeignTab(null)).toBe(false);
  });

  it("clearDraft маха и указателя, и съдържанието", () => {
    const p = pointer();
    writePointer(p);
    writePayload(p.draftId, { answers: { a: "b" } });
    clearDraft(p.draftId);
    expect(readPointer()).toBeNull();
    expect(readPayload(p.draftId)).toBeNull();
  });
});

describe("съдържание", () => {
  it("остава в текущия таб (sessionStorage), не в localStorage", () => {
    writePayload("draft-1", { answers: { name: "Иван Петров" } });
    expect(JSON.stringify(localStorage)).not.toContain("Иван Петров");
    expect(readPayload("draft-1")?.answers).toEqual({ name: "Иван Петров" });
  });
});

describe("миграция от стари чернови", () => {
  it("пренася и изтрива старите ключове еднократно", () => {
    localStorage.setItem(
      "wizard:it:nda",
      JSON.stringify({ answers: { subject: "услуга" }, stepIdx: 3, result: { contract: {} } }),
    );
    localStorage.setItem(
      "build:custom-contract",
      JSON.stringify({ name: "Договор", fieldValues: {}, stepIdx: 1 }),
    );

    const drafts = takeLegacyDrafts();
    expect(drafts.map((d) => d.flow).sort()).toEqual(["build", "wizard"]);
    const wizard = drafts.find((d) => d.flow === "wizard")!;
    expect(wizard.stepIdx).toBe(3);
    expect(wizard.hasResult).toBe(true);
    expect(wizard.payload.answers).toEqual({ subject: "услуга" });

    expect(localStorage.getItem("wizard:it:nda")).toBeNull();
    expect(localStorage.getItem("build:custom-contract")).toBeNull();

    // Стажираното копие в таба остава единственото копие до потвърден
    // сървърен запис — второ повикване го връща пак, не го губи.
    expect(takeLegacyDrafts().map((d) => d.flow).sort()).toEqual(["build", "wizard"]);
    clearStagedLegacyDrafts("wizard");
    expect(takeLegacyDrafts().map((d) => d.flow)).toEqual(["build"]);
    clearStagedLegacyDrafts();
    expect(takeLegacyDrafts()).toEqual([]);
  });

  it("не изтрива стария ключ, ако копието в таба не може да се запише", () => {
    localStorage.setItem("wizard:it:nda", JSON.stringify({ answers: { subject: "услуга" }, stepIdx: 1 }));
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string) {
      if (k.startsWith("activation_draft_payload_v1:legacy:")) throw new Error("QuotaExceededError");
    });
    try {
      const drafts = takeLegacyDrafts();
      expect(drafts).toHaveLength(1);
      expect(localStorage.getItem("wizard:it:nda")).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("не се спъва в повреден стар запис", () => {
    localStorage.setItem("wizard:it:broken", "{{{");
    expect(takeLegacyDrafts()).toEqual([]);
    expect(localStorage.getItem("wizard:it:broken")).toBeNull();
  });
});

describe("sanitizeDraftRoute", () => {
  it("премахва технически параметри, но пази параметрите на документа", () => {
    expect(sanitizeDraftRoute("/build", "?ab_activation_continuity=variant")).toBe("/build");
    expect(sanitizeDraftRoute("/build", "?type=nda&ab_x=1&utm_source=fb&gclid=z")).toBe("/build?type=nda");
    expect(sanitizeDraftRoute("/wizard", "")).toBe("/wizard");
  });
});

describe("присвоен указател", () => {
  it("маха токена от браузъра след присвояване и пази savedDocId", () => {
    writePointer(pointer({ claimed: true, savedDocId: "doc-1", expiresAt: Date.now() + CLAIMED_DRAFT_TTL_MS }));
    const raw = localStorage.getItem(DRAFT_POINTER_KEY)!;
    expect(raw).not.toContain("abcdefghijklmnopqrstuvwx");
    const read = readPointer()!;
    expect(read.claimed).toBe(true);
    expect(read.claimToken).toBe("");
    expect(read.savedDocId).toBe("doc-1");
  });

  it("непотърсен указател без токен е невалиден", () => {
    writePointer(pointer({ claimToken: "" }));
    expect(readPointer()).toBeNull();
  });

  it("clearAllDraftStorage чисти указателя и всяко съдържание в таба", () => {
    const p = pointer();
    writePointer(p);
    writePayload(p.draftId, { answers: { a: "b" } });
    writePayload("local", { answers: { c: "d" } });
    sessionStorage.setItem("unrelated", "1");
    clearAllDraftStorage();
    expect(readPointer()).toBeNull();
    expect(readPayload(p.draftId)).toBeNull();
    expect(readPayload("local")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("1");
  });
});

describe("hasUserContent", () => {
  it("служебният снапшот при отваряне не е съдържание", () => {
    expect(hasUserContent({ answers: {}, meta: { v: 1, ts: 1, stepIdx: 0, documentType: "nda" } })).toBe(false);
    expect(hasUserContent({ answers: { subject: "  " }, signature: { name_a: "", city: "" } })).toBe(false);
    expect(hasUserContent(null)).toBe(false);
  });

  it("разпознава реален напредък", () => {
    expect(hasUserContent({ answers: { subject: "услуга" } })).toBe(true);
    expect(hasUserContent({ answers: {} }, 2)).toBe(true);
    expect(hasUserContent({ result: { contract: {} } })).toBe(true);
    expect(hasUserContent({ signature: { name_a: "Иван" } })).toBe(true);
    expect(hasUserContent({ meta: { name: "Договор" } })).toBe(true);
    expect(hasUserContent({ meta: { partiesA: "Фирма ЕООД" } })).toBe(true);
    expect(hasUserContent({ meta: { savedDocId: "x" } })).toBe(true);
  });
});

describe("класификация на отказите", () => {
  it("преходните грешки се повтарят, окончателните откачат указателя", () => {
    expect(isTransientDraftReason("network")).toBe(true);
    expect(isTransientDraftReason("rate_limited")).toBe(true);
    expect(isTransientDraftReason("expired")).toBe(false);
    for (const r of ["expired", "invalid_token", "already_claimed", "different_owner", "unauthorized"] as const) {
      expect(isDetachDraftReason(r)).toBe(true);
    }
    expect(isDetachDraftReason("network")).toBe(false);
    expect(isDetachDraftReason("payload_too_large")).toBe(false);
  });
});

/* ------------------------------------------------------------------------ */
/* Състояние на указателя около sync/claim                                  */
/* ------------------------------------------------------------------------ */

const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const PAYLOAD = { meta: { name: "Договор за тест" }, answers: { a: "b" } };

function syncArgs(p: DraftPointer | null) {
  return { pointer: p, flow: "build" as const, docKey: "contract", route: "/build", stepIdx: 1, payload: PAYLOAD, hasResult: false };
}

describe("syncDraft — състояние на указателя", () => {
  it("нова чернова: пише указател с токен и мести съдържанието от резервния слот", async () => {
    writePayload(LOCAL_DRAFT_ID, PAYLOAD);
    invokeMock.mockResolvedValueOnce({
      data: { draft_id: DRAFT_ID, claim_token: "abcdefghijklmnopqrstuvwx", expires_at: new Date(Date.now() + ANON_DRAFT_TTL_MS).toISOString() },
      error: null,
    });
    const res = await syncDraft(syncArgs(null));
    expect(res.ok).toBe(true);
    if (res.ok !== true) return;
    expect(res.created).toBe(true);
    expect(res.pointer.claimed).toBe(false);
    expect(res.pointer.claimToken).toBe("abcdefghijklmnopqrstuvwx");
    expect(readPayload(DRAFT_ID)).toEqual(PAYLOAD);
    expect(readPayload(LOCAL_DRAFT_ID)).toBeNull();
    // Тялото на заявката не носи draft_id/claim_token при изричен create.
    const body = (invokeMock.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.draft_id).toBeUndefined();
    expect(body.claim_token).toBeUndefined();
  });

  it("непотърсен указател: праща токена; присвоен указател: не го праща", async () => {
    invokeMock.mockResolvedValue({ data: { draft_id: DRAFT_ID, expires_at: new Date(Date.now() + 1000).toISOString() }, error: null });
    await syncDraft(syncArgs(pointer({ draftId: DRAFT_ID })));
    let body = (invokeMock.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(body.draft_id).toBe(DRAFT_ID);
    expect(body.claim_token).toBe("abcdefghijklmnopqrstuvwx");

    await syncDraft(syncArgs(pointer({ draftId: DRAFT_ID, claimed: true, claimToken: "" })));
    body = (invokeMock.mock.calls[1][1] as { body: Record<string, unknown> }).body;
    expect(body.draft_id).toBe(DRAFT_ID);
    expect(body.claim_token).toBeUndefined();
  });

  it("закъснял отговор не размаркира вече присвоена чернова и не връща токена", async () => {
    // Заявката е тръгнала с непотърсен указател…
    const stale = pointer({ draftId: DRAFT_ID });
    let resolve!: (v: unknown) => void;
    invokeMock.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const pending = syncDraft(syncArgs(stale));

    // …междувременно claim-ът е минал и указателят е присвоен.
    const claimedAt = Date.now() + CLAIMED_DRAFT_TTL_MS;
    writePointer(pointer({ draftId: DRAFT_ID, claimed: true, claimToken: "", savedDocId: "doc-1", hasResult: true, expiresAt: claimedAt }));

    resolve({ data: { draft_id: DRAFT_ID, expires_at: new Date(Date.now() + ANON_DRAFT_TTL_MS).toISOString() }, error: null });
    const res = await pending;
    expect(res.ok).toBe(true);
    if (res.ok !== true) return;
    expect(res.pointer.claimed).toBe(true);
    expect(res.pointer.claimToken).toBe("");
    expect(res.pointer.savedDocId).toBe("doc-1");
    expect(res.pointer.hasResult).toBe(true);
    expect(res.pointer.expiresAt).toBe(claimedAt);
    const stored = readPointer()!;
    expect(stored.claimed).toBe(true);
    expect(stored.claimToken).toBe("");
    expect(localStorage.getItem(DRAFT_POINTER_KEY)).not.toContain("abcdefghijklmnopqrstuvwx");
  });

  it("нов идентификатор от сървъра започва като непотърсен — флагът claimed не се пренася", async () => {
    const OTHER = "33333333-3333-4333-8333-333333333333";
    const p = pointer({ draftId: DRAFT_ID, claimed: true, claimToken: "", savedDocId: "doc-1" });
    writePointer(p);
    writePayload(DRAFT_ID, PAYLOAD);
    invokeMock.mockResolvedValueOnce({
      data: { draft_id: OTHER, claim_token: "zyxwvutsrqponmlkjihgfedcba", expires_at: new Date(Date.now() + ANON_DRAFT_TTL_MS).toISOString() },
      error: null,
    });
    const res = await syncDraft(syncArgs(p));
    expect(res.ok).toBe(true);
    if (res.ok !== true) return;
    expect(res.created).toBe(true);
    expect(res.pointer.draftId).toBe(OTHER);
    expect(res.pointer.claimed).toBe(false);
    expect(res.pointer.claimToken).toBe("zyxwvutsrqponmlkjihgfedcba");
    expect(res.pointer.savedDocId).toBeUndefined();
    // Съдържанието се мести под новия идентификатор.
    expect(readPayload(OTHER)).toEqual(PAYLOAD);
    expect(readPayload(DRAFT_ID)).toBeNull();
  });

  it("сървърен отказ се връща като типизирана причина, без да пипа указателя", async () => {
    const p = pointer({ draftId: DRAFT_ID });
    writePointer(p);
    invokeMock.mockResolvedValueOnce({ data: { ok: false, reason: "expired" }, error: { message: "410" } });
    const res = await syncDraft(syncArgs(p));
    expect(res).toEqual({ ok: false, reason: "expired" });
    expect(readPointer()?.draftId).toBe(DRAFT_ID);
  });

  it("отговор без draft_id е грешка (не се създава указател от нищо)", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const res = await syncDraft(syncArgs(null));
    expect(res.ok).toBe(false);
    expect(readPointer()).toBeNull();
  });
});

describe("claimDraft — състояние на резултата", () => {
  it("праща токена само за непотърсена чернова", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, route: "/build", flow: "build" }, error: null });
    await claimDraft(pointer({ draftId: DRAFT_ID }));
    expect((invokeMock.mock.calls[0][1] as { body: Record<string, unknown> }).body.claim_token).toBe("abcdefghijklmnopqrstuvwx");
    await claimDraft(pointer({ draftId: DRAFT_ID, claimed: true, claimToken: "" }));
    expect((invokeMock.mock.calls[1][1] as { body: Record<string, unknown> }).body.claim_token).toBeUndefined();
  });

  it("небезопасен маршрут от сървъра се заменя с маршрута на указателя", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, route: "https://evil.example", flow: "build", payload: PAYLOAD, purged: false },
      error: null,
    });
    const res = await claimDraft(pointer({ draftId: DRAFT_ID, route: "/build?type=nda" }));
    expect(res.ok).toBe(true);
    expect(res.route).toBe("/build?type=nda");
    expect(res.payload).toEqual(PAYLOAD);
  });

  it("празно съдържание не се подава за възстановяване; purged/saved_doc_id се пренасят", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, route: "/build", flow: "build", payload: {}, purged: true, saved_doc_id: "doc-9", has_result: true },
      error: null,
    });
    const res = await claimDraft(pointer({ draftId: DRAFT_ID }));
    expect(res.ok).toBe(true);
    expect(res.payload).toBeUndefined();
    expect(res.purged).toBe(true);
    expect(res.savedDocId).toBe("doc-9");
    expect(res.hasResult).toBe(true);
  });

  it("отказ → типизирана причина", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false, reason: "already_claimed" }, error: { message: "409" } });
    const res = await claimDraft(pointer({ draftId: DRAFT_ID }));
    expect(res).toEqual({ ok: false, reason: "already_claimed" });
  });
});

describe("clearDraftIfCurrent", () => {
  it("изчиства само когато указателят още сочи очакваната чернова", () => {
    const p = pointer();
    writePointer(p);
    writePayload(p.draftId, { answers: { a: "1" } });
    expect(clearDraftIfCurrent(p.draftId)).toBe(true);
    expect(readPointer()).toBeNull();
    // Съдържанието е запазено в резервния слот.
    expect(readPayload(LOCAL_DRAFT_ID)).toEqual({ answers: { a: "1" } });
  });

  it("не пипа по-нов указател за друга чернова", () => {
    const newer = pointer({ draftId: "22222222-2222-4222-8222-222222222222" });
    writePointer(newer);
    expect(clearDraftIfCurrent("11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(readPointer()?.draftId).toBe(newer.draftId);
  });

  it("не отвързва чернова, която междувременно е присвоена", () => {
    const p = pointer({ claimed: true, claimToken: "" });
    writePointer(p);
    expect(clearDraftIfCurrent(p.draftId, { requireUnclaimed: true })).toBe(false);
    expect(readPointer()?.draftId).toBe(p.draftId);
  });
});

describe("claimRetryDelay", () => {
  it("е ограничен експоненциален backoff с jitter", () => {
    expect(claimRetryDelay(1, () => 0)).toBe(1000);
    expect(claimRetryDelay(2, () => 0)).toBe(2000);
    expect(claimRetryDelay(3, () => 0)).toBe(4000);
    expect(claimRetryDelay(1, () => 0.999)).toBeGreaterThan(1000);
    expect(claimRetryDelay(1, () => 0.999)).toBeLessThanOrEqual(1250);
    // Таванът не се надхвърля, колкото и опити да има.
    expect(claimRetryDelay(20, () => 0)).toBe(30_000);
    expect(claimRetryDelay(0, () => 0)).toBe(1000);
  });

  it("максималният брой опити е ограничен", () => {
    expect(MAX_CLAIM_ATTEMPTS).toBeGreaterThan(1);
    expect(MAX_CLAIM_ATTEMPTS).toBeLessThanOrEqual(8);
  });
});

describe("syncDraft — commit с requireCurrent сравнява снимката при изпращане", () => {
  const OK = (id = DRAFT_ID) => ({
    data: { draft_id: id, claim_token: "abcdefghijklmnopqrstuvwx", expires_at: new Date(Date.now() + ANON_DRAFT_TTL_MS).toISOString() },
    error: null,
  });

  it("update: преминаването към присвоена чернова е сливаемо и токенът не се връща", async () => {
    const p = pointer({ draftId: DRAFT_ID, flow: "build" });
    writePointer(p);
    invokeMock.mockResolvedValueOnce(OK());
    const res = await syncDraft(syncArgs(p), { commit: false });
    expect(res.ok).toBe(true);
    if (res.ok !== true) return;
    writePointer(pointer({ draftId: DRAFT_ID, flow: "build", claimed: true, claimToken: "", savedDocId: "doc-1" }));
    const committed = res.commit({ stepIdx: 4 }, { requireCurrent: true });
    expect(committed).not.toBeNull();
    expect(committed!.claimed).toBe(true);
    expect(committed!.claimToken).toBe("");
    expect(localStorage.getItem(DRAFT_POINTER_KEY)).not.toContain("abcdefghijklmnopqrstuvwx");
  });

  it("update: указател, сменен с ДРУГА чернова, отказва commit", async () => {
    const p = pointer({ draftId: DRAFT_ID, flow: "build" });
    writePointer(p);
    invokeMock.mockResolvedValueOnce(OK());
    const res = await syncDraft(syncArgs(p), { commit: false });
    if (res.ok !== true) return;
    const other = pointer({ draftId: "44444444-4444-4444-8444-444444444444", flow: "build" });
    writePointer(other);
    expect(res.commit({}, { requireCurrent: true })).toBeNull();
    expect(readPointer()?.draftId).toBe(other.draftId);
  });

  it("изричен create: непроменена снимка минава, а заменена от друг таб — не", async () => {
    invokeMock.mockResolvedValue(OK());
    // 1) чисто хранилище при изпращане, чисто и при commit → минава
    const first = await syncDraft(syncArgs(null), { commit: false });
    if (first.ok !== true) return;
    expect(first.commit({}, { requireCurrent: true })).not.toBeNull();

    // 2) друг таб заменя указателя, докато заявката пътува → отказ
    localStorage.clear();
    const second = await syncDraft(syncArgs(null), { commit: false });
    if (second.ok !== true) return;
    const foreign = pointer({ draftId: "55555555-5555-4555-8555-555555555555", tabId: "tab-2" });
    writePointer(foreign);
    expect(second.commit({}, { requireCurrent: true })).toBeNull();
    expect(readPointer()?.draftId).toBe(foreign.draftId);
  });

  it("clearDraftIfCurrent без указател не създава резервно копие", () => {
    expect(clearDraftIfCurrent(DRAFT_ID)).toBe(false);
    expect(readPayload(LOCAL_DRAFT_ID)).toBeNull();
  });
});
