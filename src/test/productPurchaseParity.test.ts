/**
 * Паритет между продуктовата витрина (frontend) и сървърната покупкова
 * конфигурация (Edge). Цените и продуктите трябва да съвпадат точно —
 * 2,99 / 3,99 / 7,99 €.
 *
 * Тестът чете Edge модула като текст, за да не внася Deno зависимости.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ONE_TIME_PRODUCTS } from "@/lib/products";

const SERVER = readFileSync("supabase/functions/_shared/product-purchase.ts", "utf8");
const ONEOFF = readFileSync("supabase/functions/_shared/oneoff-credit.ts", "utf8");

const EXPECTED = [
  { id: "contract_check", cents: 299, key: "contract_check_299" },
  { id: "contract_improve", cents: 399, key: "contract_improve_399" },
  { id: "negotiation_package", cents: 799, key: "negotiation_package_799" },
] as const;

describe("паритет frontend ↔ сървър за еднократните продукти", () => {
  it("витрината има точно трите продукта с точните цени", () => {
    expect(ONE_TIME_PRODUCTS.map((p) => p.id)).toEqual(EXPECTED.map((e) => e.id));
    for (const e of EXPECTED) {
      const product = ONE_TIME_PRODUCTS.find((p) => p.id === e.id)!;
      expect(Math.round(product.priceEur * 100)).toBe(e.cents);
    }
  });

  it("сървърната конфигурация носи същите ключове и суми", () => {
    for (const e of EXPECTED) {
      expect(SERVER).toContain(`lookupKey: "${e.key}"`);
      expect(SERVER).toContain(`amountCents: ${e.cents}`);
    }
  });

  it("няма изтеглени продукти или стари цени", () => {
    for (const stale of ["business_contract_map", "699", "6.99", "biznes-karta-dokumenti"]) {
      expect(SERVER.includes(stale)).toBe(false);
    }
  });

  it("продуктите не са част от операциите/кредитите", () => {
    for (const e of EXPECTED) {
      expect(ONEOFF.includes(e.id)).toBe(false);
      expect(ONEOFF.includes(e.key)).toBe(false);
    }
    // Само в коментар — никога като реално извикване.
    expect(SERVER.includes("credit_topup_ops(")).toBe(false);
    expect(SERVER.includes("rpc(")).toBe(false);
  });
});
