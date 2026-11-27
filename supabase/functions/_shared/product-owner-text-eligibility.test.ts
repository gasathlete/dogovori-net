import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateProductEligibility } from "./product-eligibility.ts";
import { PRODUCT_SOURCE_CHAR_UNIT } from "./product-source.ts";
const text = "Договор за услуга. Възложителят заплаща 300 евро след приемане. Изпълнителят предоставя три графични предложения в срок от десет дни.";
Deno.test("all three products accept full owner text after source binding", () => {
  for (const productId of ["contract_check", "contract_improve", "negotiation_package"] as const) {
    const result = evaluateProductEligibility({ productId, source: { text, charCount: Array.from(text).length, charUnit: PRODUCT_SOURCE_CHAR_UNIT, sourceKind: "owner_text", extractionStatus: "full" }, context: { role: "възложител", objective: "точни срокове и плащане", preferred_position: "balanced", counterparty_context: "изпълнител на услуга" } });
    assertEquals(result.ok, true);
  }
});
Deno.test("partial owner text is still refused before purchase", () => {
  assertEquals(evaluateProductEligibility({ productId: "contract_check", source: { text, charCount: Array.from(text).length, charUnit: PRODUCT_SOURCE_CHAR_UNIT, sourceKind: "owner_text", extractionStatus: "partial" }, context: { role: "възложител" } }).ok, false);
});