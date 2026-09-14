import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";
import { computeProductCostBounds, PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import {
  ProductGenerationError,
  ProductGenerationRuntime,
  type ProductGenerationState,
  type ProductCallStore,
  type ProductLegalBasisPort,
  type ProductModelPort,
  type ProductModelResponse,
} from "./product-generation-runtime.ts";
import { PRODUCT_SOURCE_CHAR_UNIT } from "./product-source.ts";
import { redactProductSource, redactedSourceRange, rehydrateProductOutput, ProductRedactionError } from "./product-secure-redaction.ts";

const source = "ДОГОВОР ЗА УСЛУГИ\n\nВъзложителят възлага изработка на уебсайт. Цената е 24000 EUR. Срокът е 20 дни.";
const binding = {
  document_id: "11111111-2222-3333-4444-555555555555",
  source_hash: "a".repeat(64),
  source_kind: "pdf" as const,
  char_count: Array.from(source).length,
  char_unit: PRODUCT_SOURCE_CHAR_UNIT,
  source_updated_at: "2026-09-11T10:00:00.000Z",
  page_count: 1,
};

function state(overrides: Partial<ProductGenerationState> = {}): ProductGenerationState {
  const classification = classifyDocumentBeforeAI(source);
  return {
    entitlementId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    productId: "contract_check",
    sourceText: source,
    binding,
    context: { role: "Възложител" },
    cursor: { stage: "awaiting_generation", batch_index: 0, chunk_index: 0 },
    bounds: computeProductCostBounds("contract_check", binding.char_count, classification),
    usage: { calls: 0, input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 },
    completedCallIds: new Set(), artifacts: [], zeroRetentionVerified: true,
    generationTimestamp: "2026-09-11T10:30:00.000Z",
    ...overrides,
  };
}

const legal: ProductLegalBasisPort = { resolve: async () => null };

Deno.test("generation gateway is unreachable until zero retention is verified", async () => {
  let calls = 0;
  const model: ProductModelPort = { invoke: async () => { calls += 1; return { output: {}, inputTokens: 1, outputTokens: 1, elapsedMs: 1 }; } };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state({ zeroRetentionVerified: false })), ProductGenerationError, "zero_retention_unverified");
  assertEquals(calls, 0);
});

Deno.test("special-category source cannot reach the generation gateway", async () => {
  let calls = 0;
  const blocked = `${source}\nДиагноза и медицинско досие.`;
  const model: ProductModelPort = { invoke: async () => { calls += 1; return { output: {}, inputTokens: 1, outputTokens: 1, elapsedMs: 1 }; } };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state({ sourceText: blocked })), ProductGenerationError, "safety_gate_closed");
  assertEquals(calls, 0);
});

Deno.test("deterministic redaction rehydrates exact values and rejects placeholder corruption", () => {
  const redacted = redactProductSource("Имейл test@example.com и IBAN BG80BNBG96611020345678.");
  const tokens = redacted.map.orderedTokens;
  assertEquals(tokens.length, 2);
  assertEquals(rehydrateProductOutput(tokens.join(" / "), redacted.map, tokens), "test@example.com / BG80BNBG96611020345678");
  assertRejects(async () => rehydrateProductOutput(tokens[0], redacted.map, tokens), ProductRedactionError, "missing_placeholder");
  // Един маркер в данните И в закотвящия цитат е законен изход.
  assertEquals(
    rehydrateProductOutput(`${tokens[0]} ${tokens[0]}`, redacted.map, [tokens[0]]),
    "test@example.com test@example.com",
  );
  assertRejects(
    async () => rehydrateProductOutput(Array(9).fill(tokens[0]).join(" "), redacted.map, [tokens[0]]),
    ProductRedactionError,
    "duplicated_placeholder",
  );
  assertRejects(async () => rehydrateProductOutput("⟦PD_EMAIL_9999⟧", redacted.map, []), ProductRedactionError, "unknown_placeholder");
});

Deno.test("a chunk boundary through an identifier emits only its server-owned placeholder", () => {
  const raw = "test@example.com";
  const input = `Преди ${raw} след`;
  const redacted = redactProductSource(input);
  const startInsideIdentifier = Array.from("Преди test@").length;
  const endInsideIdentifier = Array.from("Преди test@example").length;
  const safe = redactedSourceRange(input, redacted.map, startInsideIdentifier, endInsideIdentifier);
  assertEquals(safe, redacted.map.orderedTokens[0]);
  assertEquals(safe.includes("test@"), false);
  assertEquals(safe.includes("example"), false);
});

Deno.test("one bounded passport call uses the server-owned current route and content-free telemetry", async () => {
  let request: unknown;
  const model: ProductModelPort = {
    invoke: async (input) => {
      request = input;
      return {
        output: { passport: { title: "Договор", document_type: "Договор за услуги", parties: [], governing_law: null, signature_state: null } },
        inputTokens: 100, outputTokens: 50, elapsedMs: 7,
      };
    },
  };
  const result = await new ProductGenerationRuntime(model, legal).runStep(state());
  const sent = request as { model: string; callId: string; routeKey: string };
  assert(["google/gemini-3.1-flash-lite", "google/gemini-3.8-flash"].includes(sent.model));
  assertEquals(sent.routeKey, "passport");
  assertEquals(result.nextCursor.stage, "review");
  assertEquals((result.artifact.payload as { passport: { title: string } }).passport.title, "Договор");
  assertEquals(result.telemetry?.callId, sent.callId);
  assertEquals(JSON.stringify(result.telemetry).includes("ДОГОВОР"), false);
  assertEquals(result.usage.calls, 1);
  assertEquals(result.callIds.length, 1);
  assertEquals(result.artifact.version, 1);
  assertEquals(PRODUCT_GENERATION_POLICY_VERSION, state().bounds.policyVersion);
});

Deno.test("reported model usage above the per-call bound fails before checkpoint", async () => {
  const model: ProductModelPort = { invoke: async () => ({ output: {}, inputTokens: 9_999_999, outputTokens: 1, elapsedMs: 1 }) };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state()), ProductGenerationError, "budget_exceeded");
});

Deno.test("60 000 code points expose all ten review batches without ordinal gaps", async () => {
  const longSource = "Договорна клауза за цена и срок. ".repeat(1_875).slice(0, 60_000);
  const longBinding = { ...binding, char_count: Array.from(longSource).length };
  const longBounds = computeProductCostBounds("contract_check", longBinding.char_count, classifyDocumentBeforeAI(longSource));
  const seen: string[] = [];
  const model: ProductModelPort = { invoke: async (request) => {
    seen.push(request.callId);
    return { output: [], inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
  } };
  const runtime = new ProductGenerationRuntime(model, legal);
  for (let batch = 0; batch < 10; batch += 1) {
    const result = await runtime.runStep(state({
      sourceText: longSource, binding: longBinding, bounds: longBounds,
      cursor: { stage: "review", batch_index: batch, chunk_index: batch * 3 },
    }));
    assertEquals(result.callIds.length, 1);
  }
  assertEquals(seen.length, 10);
  assertEquals(new Set(seen).size, 10);
});

Deno.test("60 000 code points traverse every product route exactly once per bounded step", async () => {
  const longSource = "Договорна клауза за цена и срок. ".repeat(1_875).slice(0, 60_000);
  const longBinding = { ...binding, char_count: Array.from(longSource).length };
  for (const productId of ["contract_check", "contract_improve", "negotiation_package"] as const) {
    const bounds = computeProductCostBounds(productId, longBinding.char_count, classifyDocumentBeforeAI(longSource));
    const calls: string[] = [];
    const model: ProductModelPort = { invoke: async (request) => {
      calls.push(request.routeKey);
      const output = request.routeKey === "passport"
        ? { passport: { title: "Договор", document_type: "Договор", parties: [], governing_law: null, signature_state: null } }
        : request.routeKey === "review" || request.routeKey === "corrections" ? []
        : request.routeKey === "negotiation" ? { objectives: [], red_lines: [], acceptable_concessions: [], fallbacks: [], negotiation_questions: [], actions: [] }
        : request.routeKey === "messages" ? { drafts: [{ tone: "neutral", subject: "Тема", body: "Текст" }, { tone: "firm", subject: "Тема", body: "Текст" }] }
        : { executive_summary: "Обобщение", priority_summary: [], termination: { summary: "Няма извод.", spans: [] }, disputes: { summary: "Няма извод.", spans: [] }, absence_checks: [], missing_protections: [], questions: [] };
      return { output, inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
    } };
    const runtime = new ProductGenerationRuntime(model, legal);
    await runtime.runStep(state({ productId, sourceText: longSource, binding: longBinding, bounds }));
    for (const stage of productId === "contract_check" ? ["review"] : ["review", "corrections"]) {
      for (let batch = 0; batch < 10; batch += 1) await runtime.runStep(state({ productId, sourceText: longSource, binding: longBinding, bounds, cursor: { stage: stage as "review" | "corrections", batch_index: batch, chunk_index: batch * 3 } }));
    }
    if (productId === "negotiation_package") {
      await runtime.runStep(state({ productId, sourceText: longSource, binding: longBinding, bounds, cursor: { stage: "negotiation", batch_index: 0, chunk_index: 0 } }));
      await runtime.runStep(state({ productId, sourceText: longSource, binding: longBinding, bounds, cursor: { stage: "messages", batch_index: 0, chunk_index: 0 } }));
    }
    const expected = productId === "contract_check" ? 11 : productId === "contract_improve" ? 21 : 23;
    assertEquals(calls.length, expected);
    assertEquals(calls.filter((route) => route === "review").length, 10);
    assertEquals(calls.filter((route) => route === "corrections").length, productId === "contract_check" ? 0 : 10);
  }
});

Deno.test("invalid batch gets exactly one bounded repair attempt", async () => {
  const routes: string[] = [];
  const model: ProductModelPort = { invoke: async (request) => {
    routes.push(request.routeKey);
    return { output: request.routeKey === "review" ? { invalid: true } : [], inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
  } };
  const result = await new ProductGenerationRuntime(model, legal).runStep(state({
    cursor: { stage: "review", batch_index: 0, chunk_index: 0 },
  }));
  assertEquals(routes, ["review", "review_repair"]);
  assertEquals(result.telemetry?.repairCount, 1);
  assertEquals(result.callIds.length, 2);
});

Deno.test("completed external call replays without a second priced invocation", async () => {
  let calls = 0;
  const response = { output: { passport: { title: "Договор", document_type: "Договор за услуги", parties: [], governing_law: null, signature_state: null } }, inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
  const store: ProductCallStore = {
    reserve: async () => ({ status: "complete", response }),
    complete: async () => { throw new Error("must not complete replay"); },
  };
  const model: ProductModelPort = { invoke: async () => { calls += 1; return response; } };
  await new ProductGenerationRuntime(model, legal, store).runStep(state());
  assertEquals(calls, 0);
});

Deno.test("an incomplete durable reservation never causes a duplicate priced call", async () => {
  let calls = 0;
  const store: ProductCallStore = {
    reserve: async () => ({ status: "pending" }),
    complete: async () => { throw new Error("must not complete pending call"); },
  };
  const model: ProductModelPort = { invoke: async () => { calls += 1; return { output: {}, inputTokens: 1, outputTokens: 1, elapsedMs: 1 }; } };
  await assertRejects(() => new ProductGenerationRuntime(model, legal, store).runStep(state()), ProductGenerationError, "invalid_cursor");
  assertEquals(calls, 0);
});

Deno.test("array call responses are reserved, completed, and replayed by canonical bytes", async () => {
  let calls = 0;
  let completed: ProductModelResponse | undefined;
  const store: ProductCallStore = {
    reserve: async () => completed
      ? { status: "complete", response: completed }
      : { status: "acquired", reservationToken: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" },
    complete: async (_request, response) => { completed = response; },
  };
  const model: ProductModelPort = { invoke: async () => { calls += 1; return { output: [], inputTokens: 1, outputTokens: 1, elapsedMs: 1 }; } };
  const runtime = new ProductGenerationRuntime(model, legal, store);
  const reviewState = state({ cursor: { stage: "review", batch_index: 0, chunk_index: 0 } });
  await runtime.runStep(reviewState);
  await runtime.runStep(reviewState);
  assertEquals(calls, 1);
});

Deno.test("deep schemas reject malformed correction options and invented fields", async () => {
  const model: ProductModelPort = { invoke: async () => ({
    output: [{ id: "c1", title: "Клауза", mode: "replace", original_text: "ДОГОВОР", rationale: "Причина", span: { start: 0, end: 7, excerpt: "ДОГОВОР" }, options: [{ stance: "balanced", replacement_text: "A", trade_off: "A" }], invented: true }],
    inputTokens: 1, outputTokens: 1, elapsedMs: 1,
  }) };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state({ productId: "contract_improve", cursor: { stage: "corrections", batch_index: 0, chunk_index: 0 }, bounds: computeProductCostBounds("contract_improve", binding.char_count, classifyDocumentBeforeAI(source)) })), ProductGenerationError, "invalid_model_output");
});

Deno.test("unrelated summary may omit source placeholders", async () => {
  const raw = "test@example.com";
  const withIdentifier = `${source}\nИмейл ${raw}`;
  const model: ProductModelPort = { invoke: async () => ({ output: { passport: { title: "Договор", document_type: "Договор", parties: [], governing_law: null, signature_state: null } }, inputTokens: 1, outputTokens: 1, elapsedMs: 1 }) };
  const result = await new ProductGenerationRuntime(model, legal).runStep(state({
    sourceText: withIdentifier, binding: { ...binding, char_count: Array.from(withIdentifier).length },
    bounds: computeProductCostBounds("contract_check", Array.from(withIdentifier).length, classifyDocumentBeforeAI(withIdentifier)),
  }));
  assertEquals(result.nextCursor.stage, "review");
});

Deno.test("context identifiers are absent from every outbound request", async () => {
  const raw = "test@example.com";
  const withIdentifier = `${source}\nИмейл ${raw}`;
  let outbound = "";
  const model: ProductModelPort = { invoke: async (request) => {
    outbound = JSON.stringify(request.payload);
    const tokens = [...outbound.matchAll(/⟦PD_[A-Z_]+_[0-9]{4}⟧/gu)].map((match) => match[0]);
    return { output: { passport: { title: tokens[0] ?? "Договор", document_type: tokens[1] ?? "Договор", parties: [], governing_law: null, signature_state: null } }, inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
  } };
  await new ProductGenerationRuntime(model, legal).runStep(state({
    sourceText: withIdentifier,
    binding: { ...binding, char_count: Array.from(withIdentifier).length },
    context: { role: `Възложител ${raw}` },
    bounds: computeProductCostBounds("contract_check", Array.from(withIdentifier).length, classifyDocumentBeforeAI(withIdentifier)),
  }));
  assertEquals(outbound.includes(raw), false);
  assert(outbound.includes("⟦PD_EMAIL_"));
});

Deno.test("late-chunk PII never appears in primary or repair payloads", async () => {
  const values = ["late@example.com", "BG80BNBG96611020345678", "9001010008", "+359 888 123 456", "ул. Витоша 12"];
  const suffix = `\n${values.join(" | ")}`;
  const longSource = `${"Договорна клауза за цена и срок. ".repeat(1_875).slice(0, 60_000 - Array.from(suffix).length)}${suffix}`;
  const outbound: string[] = [];
  const model: ProductModelPort = { invoke: async (request) => {
    outbound.push(JSON.stringify(request.payload));
    return { output: request.routeKey === "review" ? { invalid: true } : [], inputTokens: 1, outputTokens: 1, elapsedMs: 1 };
  } };
  const longBinding = { ...binding, char_count: Array.from(longSource).length };
  const bounds = computeProductCostBounds("contract_check", longBinding.char_count, classifyDocumentBeforeAI(longSource));
  const result = await new ProductGenerationRuntime(model, legal).runStep(state({ sourceText: longSource, binding: longBinding, bounds, cursor: { stage: "review", batch_index: 9, chunk_index: 27 } }));
  assertEquals(result.telemetry?.repairCount, 1);
  for (const payload of outbound) for (const value of values) assertEquals(payload.includes(value), false);
});

// Преразказан „цитат“ пада, защото не е дословен текст от източника. Кодът е
// `invalid_evidence`: закотвянето е мястото, където това се доказва.
Deno.test("a paraphrased quote is rejected instead of anchored", async () => {
  const raw = "test@example.com";
  const withIdentifier = `Имейл ${raw} е адресът за уведомяване.`;
  const start = 0;
  const end = Array.from(`Имейл ${raw}`).length;
  const model: ProductModelPort = { invoke: async () => ({
    output: [{ kind: "obligation", id: "o1", party: "you", summary: "Уведомяване", deadline: null, span: { start, end, excerpt: "Имейл адрес" } }],
    inputTokens: 1, outputTokens: 1, elapsedMs: 1,
  }) };
  const localBinding = { ...binding, char_count: Array.from(withIdentifier).length };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state({
    sourceText: withIdentifier, binding: localBinding,
    bounds: computeProductCostBounds("contract_check", localBinding.char_count, classifyDocumentBeforeAI(withIdentifier)),
    cursor: { stage: "review", batch_index: 0, chunk_index: 0 },
  })), ProductGenerationError, "invalid_evidence");
});

// Дословен цитат, който покрива заличена стойност, но е БЕЗ нейния маркер, е
// отказ: така не може да се промъкне възстановена лична стойност или изтрит
// маркер в доказателството.
Deno.test("a literal quote over a redacted value must carry its placeholder", async () => {
  const raw = "test@example.com";
  const withIdentifier = `Имейл ${raw} е адресът за уведомяване.`;
  const model: ProductModelPort = { invoke: async () => ({
    // Отместванията са умишлено неверни: сървърът закотвя по самия цитат.
    output: [{ kind: "obligation", id: "o1", party: "you", summary: "Уведомяване", deadline: null, span: { start: 999, end: 1200, excerpt: "Имейл  е адресът за уведомяване." } }],
    inputTokens: 1, outputTokens: 1, elapsedMs: 1,
  }) };
  const localBinding = { ...binding, char_count: Array.from(withIdentifier).length };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state({
    sourceText: withIdentifier, binding: localBinding,
    bounds: computeProductCostBounds("contract_check", localBinding.char_count, classifyDocumentBeforeAI(withIdentifier)),
    cursor: { stage: "review", batch_index: 0, chunk_index: 0 },
  })), ProductGenerationError);
});

// Дословен цитат с маркера на място минава: отместванията идват от сървъра.
Deno.test("a literal quote with its placeholder anchors on server offsets", async () => {
  const raw = "test@example.com";
  const withIdentifier = `Имейл ${raw} е адресът за уведомяване.`;
  const model: ProductModelPort = { invoke: async () => ({
    output: [{ kind: "obligation", id: "o1", party: "you", summary: "Уведомяване", deadline: null, span: { start: 999, end: 1200, excerpt: "Имейл ⟦PD_EMAIL_0001⟧ е адресът за уведомяване." } }],
    inputTokens: 1, outputTokens: 1, elapsedMs: 1,
  }) };
  const localBinding = { ...binding, char_count: Array.from(withIdentifier).length };
  const result = await new ProductGenerationRuntime(model, legal).runStep(state({
    sourceText: withIdentifier, binding: localBinding,
    bounds: computeProductCostBounds("contract_check", localBinding.char_count, classifyDocumentBeforeAI(withIdentifier)),
    cursor: { stage: "review", batch_index: 0, chunk_index: 0 },
  }));
  const items = result.artifact?.payload as Array<Record<string, unknown>>;
  const span = items[0].span as { start: number; end: number; excerpt: string };
  assertEquals(span.start, 0);
  // Запазеният артефакт остава заличен: маркерът си стои вместо личната стойност.
  assertEquals(span.excerpt, "Имейл ⟦PD_EMAIL_0001⟧ е адресът за уведомяване.");
});