import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDocumentOperation,
  clearDocumentOperationsForOtherUsers,
  documentOperationScope,
  documentOperationUserKey,
  getOrCreateDocumentOperationId,
} from "@/lib/documentOperationKey";

const STORAGE_KEY = "dogovari.document.operation.v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

const BASE = {
  purpose: "correct_uploaded" as const,
  userId: "11111111-1111-4111-8111-111111111111",
  resourceId: "doc-1",
  resourceVersion: "sha-1",
  options: { analysis_id: "a-1", issues: [0, 2], user_confirmed: false },
};

describe("documentOperationKey", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("отпечатъкът на профила е непрозрачен и не съдържа идентификатора", async () => {
    const key = await documentOperationUserKey(BASE.userId);
    expect(HEX64.test(key)).toBe(true);
    expect(key).not.toContain(BASE.userId);
  });

  it("обхватът е непрозрачен и рекурсивно каноничен", async () => {
    const scope = await documentOperationScope(BASE);
    expect(HEX64.test(scope)).toBe(true);
    // Различен ред на ключовете — включително в ВЛОЖЕН обект — дава същия обхват.
    const reordered = await documentOperationScope({
      ...BASE,
      options: {
        user_confirmed: false,
        issues: [0, 2],
        analysis_id: "a-1",
      },
    });
    expect(reordered).toBe(scope);
    const nestedA = await documentOperationScope({
      ...BASE,
      options: { nested: { a: 1, b: { c: 2, d: 3 } } },
    });
    const nestedB = await documentOperationScope({
      ...BASE,
      options: { nested: { b: { d: 3, c: 2 }, a: 1 } },
    });
    expect(nestedB).toBe(nestedA);
    const nestedChanged = await documentOperationScope({
      ...BASE,
      options: { nested: { a: 1, b: { c: 2, d: 4 } } },
    });
    expect(nestedChanged).not.toBe(nestedA);
  });

  it("всяка съществена промяна дава различен обхват", async () => {
    const base = await documentOperationScope(BASE);
    const variants = await Promise.all([
      documentOperationScope({ ...BASE, purpose: "ocr_contract" }),
      documentOperationScope({ ...BASE, userId: "22222222-2222-4222-8222-222222222222" }),
      documentOperationScope({ ...BASE, resourceId: "doc-2" }),
      documentOperationScope({ ...BASE, resourceVersion: "sha-2" }),
      documentOperationScope({ ...BASE, options: { ...BASE.options, issues: [2, 0] } }),
      documentOperationScope({ ...BASE, options: { ...BASE.options, user_confirmed: true } }),
    ]);
    for (const v of variants) expect(v).not.toBe(base);
  });

  it("същият обхват дава СЪЩИЯ идентификатор при повторение и презареждане", async () => {
    const userKey = await documentOperationUserKey(BASE.userId);
    const scope = await documentOperationScope(BASE);
    const first = getOrCreateDocumentOperationId("correct_uploaded", userKey, scope);
    expect(UUID_RE.test(first)).toBe(true);
    // Двойно натискане и повторно показване.
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, scope)).toBe(first);
    // „Презареждане": нов JS живот чете същото хранилище.
    const stored = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, stored ?? "");
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, scope)).toBe(first);
    // Друга цел или друг вход → друг идентификатор.
    expect(getOrCreateDocumentOperationId("ocr_contract", userKey, scope)).not.toBe(first);
    const otherScope = await documentOperationScope({ ...BASE, resourceVersion: "sha-9" });
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, otherScope)).not.toBe(first);
  });

  it("в хранилището НЯМА суров текст, документ или идентификатор на профил", async () => {
    const userKey = await documentOperationUserKey(BASE.userId);
    const scope = await documentOperationScope({
      ...BASE,
      options: { notes: "Иван Петров, ЕГН 1234567890", text: "Пълен текст на договора" },
    });
    getOrCreateDocumentOperationId("correct_uploaded", userKey, scope);
    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(raw).not.toContain("Иван");
    expect(raw).not.toContain("1234567890");
    expect(raw).not.toContain("договора");
    expect(raw).not.toContain(BASE.userId);
    const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["createdAt", "operationId", "purpose", "scope", "user"],
    );
  });

  it("ключът се изчиства само за точния обхват", async () => {
    const userKey = await documentOperationUserKey(BASE.userId);
    const scopeA = await documentOperationScope(BASE);
    const scopeB = await documentOperationScope({ ...BASE, resourceId: "doc-2" });
    const a = getOrCreateDocumentOperationId("correct_uploaded", userKey, scopeA);
    const b = getOrCreateDocumentOperationId("correct_uploaded", userKey, scopeB);
    clearDocumentOperation("correct_uploaded", userKey, scopeA);
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, scopeA)).not.toBe(a);
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, scopeB)).toBe(b);
  });

  it("изчистването при смяна на профил пази само текущия профил", async () => {
    const userA = await documentOperationUserKey(BASE.userId);
    const userB = await documentOperationUserKey("33333333-3333-4333-8333-333333333333");
    const scope = await documentOperationScope(BASE);
    const a = getOrCreateDocumentOperationId("correct_uploaded", userA, scope);
    const b = getOrCreateDocumentOperationId("correct_uploaded", userB, scope);
    clearDocumentOperationsForOtherUsers(userB);
    expect(getOrCreateDocumentOperationId("correct_uploaded", userB, scope)).toBe(b);
    expect(getOrCreateDocumentOperationId("correct_uploaded", userA, scope)).not.toBe(a);
  });

  it("изтекли записи (над 24 часа) не се преизползват", async () => {
    const userKey = await documentOperationUserKey(BASE.userId);
    const scope = await documentOperationScope(BASE);
    const first = getOrCreateDocumentOperationId("correct_uploaded", userKey, scope);
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<
      Record<string, unknown>
    >;
    rows[0].createdAt = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    expect(getOrCreateDocumentOperationId("correct_uploaded", userKey, scope)).not.toBe(first);
  });
});
