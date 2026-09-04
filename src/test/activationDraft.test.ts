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

import {
  ANON_DRAFT_TTL_MS,
  DRAFT_POINTER_KEY,
  clearDraft,
  isForeignTab,
  isSafeRoute,
  readPayload,
  readPointer,
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
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
      ["claimToken", "docKey", "draftId", "expiresAt", "flow", "hasResult", "route", "stepIdx", "tabId", "ts"],
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
    expect(takeLegacyDrafts()).toEqual([]);
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
