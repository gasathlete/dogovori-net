/**
 * GATE 3 корекция — ПРИКЛЮЧЕНОТО извикване никога не освобождава включеното
 * уточнение. Тестовете са мрежово тихи: без доставчик, без база, без Stripe.
 */
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideRefinementOutcome,
  StoredRefinementResponseError,
  validateStoredRefinementResponse,
} from "./product-refinement-outcome.ts";
import { markProductRefinementReconciliation } from "./product-reconciliation.ts";
import { ProductRefinementError } from "./product-refinement.ts";
import { ProductRedactionError } from "./product-secure-redaction.ts";

const GOOD = { output: { ok: true }, inputTokens: 10, outputTokens: 20, elapsedMs: 3 };

Deno.test("записан отговор с правилна форма се приема", () => {
  const out = validateStoredRefinementResponse(GOOD);
  assertEquals(out.inputTokens, 10);
  assertEquals(out.outputTokens, 20);
});

Deno.test("липсващ или негоден записан отговор е ЗАТВОРЕНА грешка, не успех", () => {
  for (
    const bad of [
      null,
      "text",
      [],
      {},
      { output: null, inputTokens: 1, outputTokens: 1 },
      { output: { a: 1 }, inputTokens: -1, outputTokens: 1 },
      { output: { a: 1 }, inputTokens: 1, outputTokens: "2" },
      { output: { a: 1 } },
    ]
  ) {
    assertThrows(() => validateStoredRefinementResponse(bad), StoredRefinementResponseError);
  }
});

Deno.test("липсващ elapsedMs не е провал: заменя се с нула", () => {
  const out = validateStoredRefinementResponse({ output: { a: 1 }, inputTokens: 0, outputTokens: 0 });
  assertEquals(out.elapsedMs, 0);
});

Deno.test("при доказано извикване изходът е ВИНАГИ неизяснен, никога провал", () => {
  for (
    const error of [
      new ProductRefinementError("output_invalid"),
      new StoredRefinementResponseError(),
      new ProductRedactionError("redaction_failed"),
      new TypeError("JSON"),
      new Error("boom"),
    ]
  ) {
    const outcome = decideRefinementOutcome({ providerEvidence: true, error });
    assertEquals(outcome.action, "reconcile");
    assert(
      outcome.code === "output_unusable" || outcome.code === "provider_outcome_unknown",
      "кодът остава затворен",
    );
  }
});

Deno.test("без доказано извикване детерминираният провал освобождава уточнението", () => {
  const redaction = decideRefinementOutcome({
    providerEvidence: false,
    error: new ProductRedactionError("redaction_failed"),
  });
  assertEquals(redaction, { action: "fail", code: "redaction_failed" });
  const unknown = decideRefinementOutcome({ providerEvidence: false, error: new Error("x") });
  assertEquals(unknown, { action: "fail", code: "refinement_failed" });
});

/**
 * Поведенческа регресия за точния пропуск от прегледа: повторение на ПРИКЛЮЧЕНО
 * извикване с негоден записан отговор. Доказва, че `fail_product_result_refinement`
 * НЕ се извиква и че се вписва неизяснено състояние.
 */
async function simulateCompletedCallReplay(stored: unknown, markOk = true) {
  const rpcNames: string[] = [];
  const db = {
    rpc(name: string) {
      rpcNames.push(name);
      return Promise.resolve({ data: markOk ? { ok: true } : { ok: false }, error: null });
    },
  };
  // Точно състоянието от базата: извикването е приключило и е записано.
  const providerEvidence = true;
  try {
    validateStoredRefinementResponse(stored);
    return { rpcNames, reconciled: false, marked: true };
  } catch (error) {
    const outcome = decideRefinementOutcome({ providerEvidence, error });
    if (outcome.action === "fail") {
      rpcNames.push("fail_product_result_refinement");
      return { rpcNames, reconciled: false, marked: false };
    }
    const marked = await markProductRefinementReconciliation(
      db,
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      outcome.code,
      "ref:refinement",
    );
    return { rpcNames, reconciled: true, marked };
  }
}

Deno.test("негоден ЗАПИСАН отговор не вика fail_product_result_refinement", async () => {
  const run = await simulateCompletedCallReplay({ output: null, inputTokens: 1, outputTokens: 1 });
  assert(run.reconciled, "изходът трябва да е неизяснен");
  assertEquals(run.rpcNames, ["mark_product_refinement_reconciliation"]);
  assert(!run.rpcNames.includes("fail_product_result_refinement"));
  assertEquals(run.marked, true);
});

Deno.test("пропаднало вписване се вижда като НЕзаписано състояние", async () => {
  const run = await simulateCompletedCallReplay({ output: undefined }, false);
  assert(run.reconciled);
  assertEquals(run.marked, false);
  assert(!run.rpcNames.includes("fail_product_result_refinement"));
});
