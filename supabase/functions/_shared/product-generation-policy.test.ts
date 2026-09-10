import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_MODEL_CALLS,
  MAX_TOTAL_TOKENS,
  PRODUCT_ALLOWED_MODELS,
  PRODUCT_COST_CEILINGS,
  PRODUCT_GENERATION_POLICY_VERSION,
  ProductBudgetError,
  computeProductCostBounds,
} from "./product-generation-policy.ts";
import type { Classification } from "./classify.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";

const PRODUCTS = ["contract_check", "contract_improve", "negotiation_package"] as const;

function lowRiskClassification(): Classification {
  return classifyDocumentBeforeAI(
    "Настоящият договор се сключва между страните при следните условия. ".repeat(50),
  );
}

Deno.test("политиката има точна версия и единица", () => {
  assertEquals(PRODUCT_GENERATION_POLICY_VERSION, "2b1b1.1");
});

Deno.test("границите се изчисляват за всеки продукт до точния лимит от 60 000", () => {
  const cls = lowRiskClassification();
  for (const product of PRODUCTS) {
    for (const chars of [80, 2000, 30_000, 60_000]) {
      const bounds = computeProductCostBounds(product, chars, cls);
      const ceilings = PRODUCT_COST_CEILINGS[product];
      assert(bounds.maxModelCalls <= MAX_MODEL_CALLS, `${product}/${chars} извиквания`);
      assert(bounds.maxTotalTokens <= MAX_TOTAL_TOKENS, `${product}/${chars} токени`);
      assert(
        bounds.maxCostMilliCents + bounds.reservedRefinementCostMilliCents <= ceilings.hard,
        `${product}/${chars} таван`,
      );
      assert(PRODUCT_ALLOWED_MODELS.includes(bounds.worstModel));
      assertEquals(bounds.charCount, chars);
      assertEquals(bounds.policyVersion, PRODUCT_GENERATION_POLICY_VERSION);
    }
  }
});

Deno.test("границите растат с обема, но не и под минимума", () => {
  const cls = lowRiskClassification();
  const small = computeProductCostBounds("contract_check", 2000, cls);
  const large = computeProductCostBounds("contract_check", 60_000, cls);
  assert(large.maxChunks > small.maxChunks);
  assert(large.maxTotalTokens > small.maxTotalTokens);
  assert(large.maxCostMilliCents > small.maxCostMilliCents);
});

Deno.test("60 001 знака се отказва вместо да се отреже", () => {
  const cls = lowRiskClassification();
  const err = assertThrows(
    () => computeProductCostBounds("contract_check", 60_001, cls),
    ProductBudgetError,
  );
  assertEquals((err as ProductBudgetError).reason, "source_too_long_for_budget");
});

Deno.test("нулев или нецял обем се отказва затворено", () => {
  const cls = lowRiskClassification();
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assertThrows(() => computeProductCostBounds("contract_check", bad, cls), ProductBudgetError);
  }
});

Deno.test("само премиумът заделя бюджет за уточнение", () => {
  const cls = lowRiskClassification();
  assertEquals(
    computeProductCostBounds("contract_check", 10_000, cls).reservedRefinementCostMilliCents,
    0,
  );
  assertEquals(
    computeProductCostBounds("contract_improve", 10_000, cls).reservedRefinementCostMilliCents,
    0,
  );
  const premium = computeProductCostBounds("negotiation_package", 10_000, cls);
  assert(premium.reservedRefinementCostMilliCents > 0);
});

Deno.test("непознат модел в маршрута се отказва, а не се приема на нулева цена", () => {
  const cls = lowRiskClassification();
  const blocked: Classification = { ...cls, allowed_models: ["vendor/unknown-model"] };
  const err = assertThrows(
    () => computeProductCostBounds("contract_check", 10_000, blocked),
    ProductBudgetError,
  );
  assertEquals((err as ProductBudgetError).reason, "unknown_model_price");
});

Deno.test("блокирана класификация не получава бюджет", () => {
  const cls = lowRiskClassification();
  const blocked: Classification = { ...cls, risk_level: "blocked" };
  assertThrows(() => computeProductCostBounds("contract_check", 10_000, blocked), ProductBudgetError);
});

Deno.test("изчислението е детерминистично", () => {
  const cls = lowRiskClassification();
  const a = computeProductCostBounds("negotiation_package", 42_000, cls);
  const b = computeProductCostBounds("negotiation_package", 42_000, cls);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
