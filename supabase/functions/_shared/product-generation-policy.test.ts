import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COST_UNIT,
  INPUT_TOKENS_PER_CODE_POINT,
  MAX_MODEL_CALLS,
  MAX_CONTEXT_CODE_POINTS,
  MAX_CONTEXT_TOKENS,
  MAX_TOTAL_TOKENS,
  PRICE_TABLE_DATE,
  PRICE_TABLE_VERSION,
  PRODUCT_ALLOWED_MODELS,
  PRODUCT_COST_CEILINGS,
  PRODUCT_GENERATION_POLICY_VERSION,
  PRODUCT_MODEL_FLASH,
  PRODUCT_MODEL_FLASH_LITE,
  MODEL_PRICES,
  ProductBudgetError,
  computeProductCostBounds,
  modelPrice,
} from "./product-generation-policy.ts";
import type { Classification } from "./classify.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";

const PRODUCTS = ["contract_check", "contract_improve", "negotiation_package"] as const;

function lowRiskClassification(): Classification {
  return classifyDocumentBeforeAI(
    "Настоящият договор се сключва между страните при следните условия. ".repeat(50),
  );
}

Deno.test("политиката има точна версия, единица и датирана таблица с цени", () => {
  assertEquals(PRODUCT_GENERATION_POLICY_VERSION, "2b1b1.3");
  assertEquals(COST_UNIT, "micro_usd");
  assertEquals(PRICE_TABLE_VERSION, "2026-09-11-provider-standard");
  assertEquals(PRICE_TABLE_DATE, "2026-09-11");
});

Deno.test("платеният маршрут ползва САМО текущите поддържани модели", () => {
  assertEquals([...PRODUCT_ALLOWED_MODELS], [
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.8-flash",
  ]);
  for (const model of PRODUCT_ALLOWED_MODELS) {
    assert(!model.includes("2.5"), `отпадащ модел в платения маршрут: ${model}`);
  }
});

Deno.test("цените са цели micro-USD, а 3.8 Flash се смята СЛЕД промоцията", () => {
  const lite = MODEL_PRICES[PRODUCT_MODEL_FLASH_LITE];
  assertEquals(lite.inputMicroUsdPer1MTokens, 250_000);
  assertEquals(lite.outputMicroUsdPer1MTokens, 1_500_000);
  const flash = MODEL_PRICES[PRODUCT_MODEL_FLASH];
  // Консервативно: 1.50 / 7.50, а не промоционалните 0.75 / 3.75.
  assertEquals(flash.inputMicroUsdPer1MTokens, 1_500_000);
  assertEquals(flash.outputMicroUsdPer1MTokens, 7_500_000);
  for (const price of Object.values(MODEL_PRICES)) {
    assert(Number.isSafeInteger(price.inputMicroUsdPer1MTokens));
    assert(Number.isSafeInteger(price.outputMicroUsdPer1MTokens));
  }
});

Deno.test("горната граница за входа е UTF-8 безопасна: 4 токена на кодова точка", () => {
  assertEquals(INPUT_TOKENS_PER_CODE_POINT, 4);
  const cls = lowRiskClassification();
  // Знак извън BMP заема 4 UTF-8 байта — границата трябва да го покрива.
  const bounds = computeProductCostBounds("contract_check", 1_000, cls);
  const passport = bounds.calls.find((c) => c.stage === "passport");
  assert(passport);
  assert(passport!.maxInputTokens >= 1_000 * 4);
});

Deno.test("контекстът се извежда от максималните полета и включва JSON overhead", () => {
  assertEquals(MAX_CONTEXT_CODE_POINTS, 120 + 400 + 400 + 12);
  assert(MAX_CONTEXT_TOKENS > MAX_CONTEXT_CODE_POINTS * INPUT_TOKENS_PER_CODE_POINT);
  assert(MAX_CONTEXT_TOKENS >= 4_240);
});

Deno.test("границите се изчисляват за всеки продукт до точния лимит от 60 000", () => {
  const cls = lowRiskClassification();
  for (const product of PRODUCTS) {
    for (const chars of [80, 2000, 30_000, 60_000]) {
      const bounds = computeProductCostBounds(product, chars, cls);
      const ceilings = PRODUCT_COST_CEILINGS[product];
      assert(bounds.maxModelCalls <= MAX_MODEL_CALLS, `${product}/${chars} извиквания`);
      assert(bounds.maxTotalTokens <= MAX_TOTAL_TOKENS, `${product}/${chars} токени`);
      assert(bounds.maxCostMicroUsd <= ceilings.hard, `${product}/${chars} таван`);
      assert(PRODUCT_ALLOWED_MODELS.includes(bounds.worstModel));
      assertEquals(bounds.charCount, chars);
      assertEquals(bounds.policyVersion, PRODUCT_GENERATION_POLICY_VERSION);
      assertEquals(bounds.costUnit, COST_UNIT);
      // Всяко извикване има собствен таван, който адаптерът ще спазва.
      for (const call of bounds.calls) {
        assert(call.maxInputTokens > 0 && call.maxOutputTokens > 0);
        assert(call.maxCostMicroUsd > 0);
        assert(PRODUCT_ALLOWED_MODELS.includes(call.model));
      }
    }
  }
});

Deno.test("точната таблица при 60 000 кодови точки е стабилна и полезна", () => {
  const cls = lowRiskClassification();
  const expected = {
    contract_check: {
      maxChunks: 30, maxBatches: 10, baseModelCalls: 12, repairModelCalls: 10,
      reservedRefinementCalls: 0, maxModelCalls: 22, maxInputTokens: 1_606_480,
      maxOutputTokens: 88_000, maxTotalTokens: 1_694_480, maxCostMicroUsd: 680_545,
      reservedRefinementInputTokens: 0, reservedRefinementOutputTokens: 0,
      reservedRefinementCostMicroUsd: 0, targetCostMicroUsd: 1_500_000, hardCostMicroUsd: 3_000_000,
    },
    contract_improve: {
      maxChunks: 30, maxBatches: 10, baseModelCalls: 22, repairModelCalls: 20,
      reservedRefinementCalls: 0, maxModelCalls: 42, maxInputTokens: 3_094_280,
      maxOutputTokens: 168_000, maxTotalTokens: 3_262_280, maxCostMicroUsd: 1_272_495,
      reservedRefinementInputTokens: 0, reservedRefinementOutputTokens: 0,
      reservedRefinementCostMicroUsd: 0, targetCostMicroUsd: 2_500_000, hardCostMicroUsd: 5_000_000,
    },
    negotiation_package: {
      maxChunks: 30, maxBatches: 10, baseModelCalls: 24, repairModelCalls: 20,
      reservedRefinementCalls: 1, maxModelCalls: 45, maxInputTokens: 3_626_500,
      maxOutputTokens: 180_000, maxTotalTokens: 3_806_500, maxCostMicroUsd: 2_160_825,
      reservedRefinementInputTokens: 182_740, reservedRefinementOutputTokens: 4_000,
      reservedRefinementCostMicroUsd: 304_110, targetCostMicroUsd: 3_200_000,
      hardCostMicroUsd: 6_500_000,
    },
  } as const;
  for (const product of PRODUCTS) {
    const bounds = computeProductCostBounds(product, 60_000, cls);
    for (const [key, value] of Object.entries(expected[product])) {
      assertEquals(
        (bounds as unknown as Record<string, number>)[key],
        value,
        `${product}.${key}`,
      );
    }
    // Полезен изход: обобщението и партидите не са смалени до неизползваемо.
    assert(bounds.maxOutputTokens >= 80_000, `${product} изход`);
  }
});

Deno.test("една поправка на пропаднала партида ЗА ВСЕКИ етап поотделно", () => {
  const cls = lowRiskClassification();
  const check = computeProductCostBounds("contract_check", 60_000, cls);
  const improve = computeProductCostBounds("contract_improve", 60_000, cls);
  // Проверката има един етап по партиди, поправката — два.
  assertEquals(check.repairModelCalls, check.maxBatches);
  assertEquals(improve.repairModelCalls, improve.maxBatches * 2);
  const repairCalls = improve.calls.filter((c) => c.stage.endsWith("_repair"));
  assertEquals(new Set(repairCalls.map((c) => c.stage)).size, 2);
  // Поправката вижда партидата ПЛЮС отхвърления отговор.
  const batch = improve.calls.find((c) => c.stage === "review")!;
  const repair = improve.calls.find((c) => c.stage === "review_repair")!;
  assert(repair.maxInputTokens > batch.maxInputTokens);
});

Deno.test("обобщаващите извиквания получават натрупания изход като вход", () => {
  const cls = lowRiskClassification();
  const premium = computeProductCostBounds("negotiation_package", 30_000, cls);
  const negotiation = premium.calls.find((c) => c.stage === "negotiation")!;
  const messages = premium.calls.find((c) => c.stage === "messages")!;
  const synthesis = premium.calls.find((c) => c.stage === "synthesis")!;
  assert(messages.maxInputTokens > negotiation.maxInputTokens);
  assert(synthesis.maxInputTokens > messages.maxInputTokens);
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

Deno.test("само премиумът заделя истинско извикване и токени за уточнение", () => {
  const cls = lowRiskClassification();
  for (const product of ["contract_check", "contract_improve"] as const) {
    const bounds = computeProductCostBounds(product, 10_000, cls);
    assertEquals(bounds.reservedRefinementCalls, 0);
    assertEquals(bounds.reservedRefinementCostMicroUsd, 0);
    assertEquals(bounds.reservedRefinementInputTokens, 0);
    assertEquals(bounds.reservedRefinementOutputTokens, 0);
  }
  const premium = computeProductCostBounds("negotiation_package", 10_000, cls);
  assertEquals(premium.reservedRefinementCalls, 1);
  assert(premium.reservedRefinementInputTokens > 0);
  assert(premium.reservedRefinementOutputTokens > 0);
  assert(premium.reservedRefinementCostMicroUsd > 0);
  // Заделеното е ЧАСТ от общата граница, не втора сметка отгоре.
  const reserved = premium.calls.filter((c) => c.reserved);
  assertEquals(reserved.length, 1);
  assertEquals(
    premium.reservedRefinementCostMicroUsd,
    reserved[0].maxCostMicroUsd,
  );
  assert(premium.maxCostMicroUsd >= premium.reservedRefinementCostMicroUsd);
});

Deno.test("ценовата справка директно отказва непознат модел", () => {
  const err = assertThrows(() => modelPrice("vendor/unknown-model"), ProductBudgetError);
  assertEquals((err as ProductBudgetError).reason, "unknown_model_price");
});

Deno.test("класификацията не може да вкара непознат модел в продуктовия маршрут", () => {
  const cls = lowRiskClassification();
  const blocked: Classification = { ...cls, allowed_models: ["vendor/unknown-model"] };
  // Маршрутът е СЪРВЪРЕН: класификацията не може да наложи чужд модел, но
  // непозната цена винаги се проваля затворено.
  const bounds = computeProductCostBounds("contract_check", 10_000, blocked);
  for (const call of bounds.calls) assert(PRODUCT_ALLOWED_MODELS.includes(call.model));
});

Deno.test("обемните партиди и поправките са Flash Lite, качествените финали са Flash", () => {
  const bounds = computeProductCostBounds("negotiation_package", 60_000, lowRiskClassification());
  for (const call of bounds.calls) {
    if (["passport", "review", "review_repair", "corrections", "corrections_repair"].includes(call.stage)) {
      assertEquals(call.model, PRODUCT_MODEL_FLASH_LITE, call.stage);
    } else {
      assertEquals(call.model, PRODUCT_MODEL_FLASH, call.stage);
    }
  }
});

Deno.test("договорът за данни забранява модел преди редакция и повторна класификация", () => {
  const classified = lowRiskClassification();
  const sensitive: Classification = {
    ...classified,
    risk_level: "medium",
    contains_personal_data: true,
    redaction_required: true,
  };
  const bounds = computeProductCostBounds("contract_check", 10_000, sensitive);
  assertEquals(bounds.redactionRequired, true);
  assertEquals(bounds.postRedactionReclassificationRequired, true);
  assertEquals(bounds.modelCallAllowed, false);
  for (const call of bounds.calls) {
    assertEquals(call.redactionRequired, true);
    assertEquals(call.postRedactionReclassificationRequired, true);
    assertEquals(call.modelCallAllowed, false);
  }
});

Deno.test("блокирана класификация не получава бюджет", () => {
  const cls = lowRiskClassification();
  const blocked: Classification = { ...cls, risk_level: "blocked" };
  assertThrows(() => computeProductCostBounds("contract_check", 10_000, blocked), ProductBudgetError);
});

Deno.test("сменена политика спира изчислението", () => {
  const cls = lowRiskClassification();
  assertThrows(
    () => computeProductCostBounds("contract_check", 10_000, cls, { expectedPolicyVersion: "2b1b1.1" }),
    ProductBudgetError,
  );
});

Deno.test("изчислението е детерминистично", () => {
  const cls = lowRiskClassification();
  const a = computeProductCostBounds("negotiation_package", 42_000, cls);
  const b = computeProductCostBounds("negotiation_package", 42_000, cls);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
