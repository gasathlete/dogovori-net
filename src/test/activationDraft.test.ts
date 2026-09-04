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
