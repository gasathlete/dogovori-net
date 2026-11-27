/**
 * GATE 3 — устойчив ключ за повторяемост на платените операции в браузъра.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearProductOperationKey,
  getOrCreateProductOperationKey,
  productOperationScope,
} from "@/lib/productOperationKey";

const STORAGE_KEY = "dogovari.product.operation.v1";

const BASE = {
  purpose: "product_refinement" as const,
  entitlementId: "11111111-1111-4111-8111-111111111111",
  resultDigest: "a".repeat(64),
  version: 0,
};

describe("productOperationKey", () => {
  beforeEach(() => localStorage.clear());

  it("същият обхват връща същия ключ при повторно щракване и презареждане", async () => {
    const scope = await productOperationScope({ ...BASE, input: "Намалете неустойката" });
    const first = getOrCreateProductOperationKey("product_refinement", scope);
    expect(getOrCreateProductOperationKey("product_refinement", scope)).toBe(first);
    // Презареждане: модулът чете отново от хранилището.
    const rescope = await productOperationScope({ ...BASE, input: "Намалете неустойката" });
    expect(rescope).toBe(scope);
    expect(getOrCreateProductOperationKey("product_refinement", rescope)).toBe(first);
  });

  it("различен вход, версия, резултат или право дава различен ключ", async () => {
    const scope = await productOperationScope({ ...BASE, input: "А" });
    const key = getOrCreateProductOperationKey("product_refinement", scope);
    const variants = await Promise.all([
      productOperationScope({ ...BASE, input: "Б" }),
      productOperationScope({ ...BASE, version: 1, input: "А" }),
      productOperationScope({ ...BASE, resultDigest: "b".repeat(64), input: "А" }),
      productOperationScope({
        ...BASE,
        entitlementId: "22222222-2222-4222-8222-222222222222",
        input: "А",
      }),
    ]);
    for (const variant of variants) {
      expect(variant).not.toBe(scope);
      expect(getOrCreateProductOperationKey("product_refinement", variant)).not.toBe(key);
    }
  });

  it("обхватът е рекурсивно каноничен: редът на ключовете не го върти", async () => {
    const a = await productOperationScope({ ...BASE, input: { b: { y: 2, x: 1 }, a: [1, 2] } });
    const b = await productOperationScope({ ...BASE, input: { a: [1, 2], b: { x: 1, y: 2 } } });
    expect(a).toBe(b);
  });

  it("предназначенията не се смесват", async () => {
    const scope = await productOperationScope({ ...BASE, input: "А" });
    expect(getOrCreateProductOperationKey("product_refinement", scope)).not.toBe(
      getOrCreateProductOperationKey("product_selection", scope),
    );
  });

  it("в хранилището влизат само непрозрачни отпечатъци", async () => {
    const scope = await productOperationScope({ ...BASE, input: "Намалете неустойката до 5%" });
    getOrCreateProductOperationKey("product_refinement", scope);
    const raw = localStorage.getItem(STORAGE_KEY) ?? "";
    expect(raw).not.toContain("Намалете");
    expect(raw).not.toContain(BASE.entitlementId);
    expect(raw).toContain(scope);
  });

  it("изчистването е точно и само за своя обхват", async () => {
    const one = await productOperationScope({ ...BASE, input: "А" });
    const two = await productOperationScope({ ...BASE, input: "Б" });
    const keyOne = getOrCreateProductOperationKey("product_refinement", one);
    const keyTwo = getOrCreateProductOperationKey("product_refinement", two);
    clearProductOperationKey("product_refinement", one);
    expect(getOrCreateProductOperationKey("product_refinement", one)).not.toBe(keyOne);
    expect(getOrCreateProductOperationKey("product_refinement", two)).toBe(keyTwo);
  });

  it("повредено хранилище не хвърля и дава нов ключ", async () => {
    localStorage.setItem(STORAGE_KEY, "{не е масив");
    const scope = await productOperationScope({ ...BASE, input: "А" });
    expect(getOrCreateProductOperationKey("product_refinement", scope)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
