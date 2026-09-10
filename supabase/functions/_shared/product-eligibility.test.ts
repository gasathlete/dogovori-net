import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  eligibilityMessage,
  evaluateProductEligibility,
  type EligibilityInput,
} from "./product-eligibility.ts";
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import { countProductSourceChars } from "./product-source.ts";

const CONTEXT = {
  role: "Изпълнител",
  objective: "Да ограничим отговорността си",
  preferred_position: "balanced",
  counterparty_context: "Голям корпоративен клиент",
};

function makeText(chars: number, seed = "Настоящият договор урежда отношенията между страните. "): string {
  const repeated = seed.repeat(Math.ceil(chars / seed.length));
  return Array.from(repeated).slice(0, chars).join("");
}

function input(overrides: Partial<EligibilityInput> = {}, chars = 5_000): EligibilityInput {
  const text = makeText(chars);
  return {
    productId: "negotiation_package",
    source: {
      text,
      charCount: countProductSourceChars(text),
      charUnit: "unicode_code_points",
      sourceKind: "pdf",
      extractionStatus: "full",
    },
    context: CONTEXT,
    ...overrides,
  } as EligibilityInput;
}

Deno.test("цял, четим документ в лимита е допустим за всеки продукт", () => {
  for (const productId of ["contract_check", "contract_improve", "negotiation_package"] as const) {
    const decision = evaluateProductEligibility(input({ productId }));
    assert(decision.ok, `${productId} трябва да е допустим`);
    if (decision.ok) {
      assertEquals(decision.policy.version, PRODUCT_GENERATION_POLICY_VERSION);
      assert(decision.policy.bounds.maxModelCalls > 0);
    }
  }
});

Deno.test("частичен източник НИКОГА не е допустим", () => {
  const decision = evaluateProductEligibility(
    input({ source: { ...input().source, extractionStatus: "partial" } }),
  );
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "source_not_usable");
});

Deno.test("несъответствие между текст и измерена дължина е отказ", () => {
  const base = input().source;
  const decision = evaluateProductEligibility(
    input({ source: { ...base, charCount: base.charCount - 1 } }),
  );
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "source_not_usable");
});

Deno.test("сканиран/неподдържан вид и грешна мерна единица се отказват", () => {
  const base = input().source;
  const scanned = evaluateProductEligibility(
    input({ source: { ...base, sourceKind: "image" as never } }),
  );
  assertEquals(scanned.ok, false);
  const unit = evaluateProductEligibility(
    input({ source: { ...base, charUnit: "utf16" as never } }),
  );
  assertEquals(unit.ok, false);
});

Deno.test("под 80 знака и над 60 000 знака се отказват, без отрязване", () => {
  const tooShort = evaluateProductEligibility(input({}, 79));
  assertEquals(tooShort.ok, false);
  if (!tooShort.ok) assertEquals(tooShort.code, "source_not_usable");

  const tooLong = evaluateProductEligibility(input({}, 60_001));
  assertEquals(tooLong.ok, false);
  if (!tooLong.ok) assertEquals(tooLong.code, "source_too_long");

  const exactly = evaluateProductEligibility(input({}, 60_000));
  assert(exactly.ok, "точно 60 000 знака остава допустимо");
});

Deno.test("непълен контекст спира продажбата преди плащане", () => {
  const decision = evaluateProductEligibility(input({ context: { role: "Изпълнител" } }));
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "context_incomplete");
});

Deno.test("забранено съдържание се отказва детерминистично", () => {
  const text = makeText(4_000) + " поръчково убийство ";
  const decision = evaluateProductEligibility(
    input({
      source: {
        text,
        charCount: countProductSourceChars(text),
        charUnit: "unicode_code_points",
        sourceKind: "docx",
        extractionStatus: "full",
      },
    }),
  );
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "content_not_allowed");
});

Deno.test("сменена политика спира повторната обработка", () => {
  const decision = evaluateProductEligibility(input({ expectedPolicyVersion: "стара.версия" }));
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "policy_changed");
});

Deno.test("непознат продукт не се продава", () => {
  const decision = evaluateProductEligibility(input({ productId: "business_contract_map" as never }));
  assertEquals(decision.ok, false);
  if (!decision.ok) assertEquals(decision.code, "unsupported_product");
});

Deno.test("проверката е детерминистична и без мрежа", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("мрежата е забранена в проверката за допустимост");
  }) as typeof fetch;
  try {
    const a = evaluateProductEligibility(input());
    const b = evaluateProductEligibility(input());
    assert(a.ok && b.ok);
    assertEquals(JSON.stringify(a), JSON.stringify(b));
    assertEquals(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("съобщенията са кратки и на български, без технически подробности", () => {
  for (const code of ["source_not_usable", "source_too_long", "context_incomplete"] as const) {
    const message = eligibilityMessage(code);
    assert(message.length > 10 && message.length < 200);
    assert(!/undefined|null|Error|sha|hash/i.test(message));
  }
});
