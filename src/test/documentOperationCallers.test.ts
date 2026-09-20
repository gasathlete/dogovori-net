/**
 * GATE 2 — прекият код, който извиква четирите документни операции, ТРЯБВА да
 * праща траен идентификатор и да го изчиства само при доказан изход.
 * Проверката е статична върху изходния код: без мрежа и без база.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CALLERS: Array<{ path: string; fn: string; purpose: string }> = [
  {
    path: "src/pages/UploadedContract.tsx",
    fn: "correct-uploaded",
    purpose: "correct_uploaded",
  },
  {
    path: "src/components/NegotiationStrategyPanel.tsx",
    fn: "negotiation-strategy",
    purpose: "negotiation_strategy",
  },
  {
    path: "src/lib/extractContractText.ts",
    fn: "ocr-contract",
    purpose: "ocr_contract",
  },
  {
    path: "src/pages/DocumentWorkspace.tsx",
    fn: "generate-linked-document",
    purpose: "generate_linked_document",
  },
];

const read = (p: string) => readFileSync(p, "utf8");

describe("повикващият код на документните операции", () => {
  it.each(CALLERS)("$fn праща траен operation_id", ({ path, fn, purpose }) => {
    const src = read(path);
    expect(src.replace(/\s+/g, " ")).toContain(`invoke( "${fn}"`.replace("( ", "("));
    expect(src).toContain("getOrCreateDocumentOperationId");
    expect(src).toContain(`"${purpose}"`);
    expect(src).toMatch(/operation_id:\s*operationId/);
  });

  it.each(CALLERS)("$fn изчиства ключа само при доказан изход", ({ path }) => {
    const src = read(path);
    expect(src).toContain("clearDocumentOperation");
    // Изчистване при успех, конфликт (409) или изтекъл резултат (410) — не при
    // произволна временна грешка.
    expect(src).toMatch(/409/);
    expect(src).toMatch(/410/);
  });

  it("никой повикващ не генерира нов идентификатор при всяко натискане", () => {
    for (const { path } of CALLERS) {
      const src = read(path);
      const invokeBlock = src.slice(0, src.length);
      expect(invokeBlock).not.toMatch(/operation_id:\s*crypto\.randomUUID\(\)/);
    }
  });

  it("зареждането на профила НЕ изчиства трайните ключове", () => {
    const auth = read("src/hooks/useAuth.tsx");
    expect(auth).not.toContain("clearDocumentOperationsForOtherUsers");
  });

  it("OCR обвързването използва отпечатъци на страници, не base64", () => {
    const src = read("src/lib/extractContractText.ts");
    expect(src).toContain("documentOperationScope");
    expect(src).not.toMatch(/options:\s*\{[^}]*:\s*images\b/);
  });
});
