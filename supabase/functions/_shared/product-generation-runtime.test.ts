import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";
import { computeProductCostBounds, PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import {
  ProductGenerationError,
  ProductGenerationRuntime,
  type ProductGenerationState,
  type ProductLegalBasisPort,
  type ProductModelPort,
} from "./product-generation-runtime.ts";
import { PRODUCT_SOURCE_CHAR_UNIT } from "./product-source.ts";
import { redactProductSource, rehydrateProductOutput, ProductRedactionError } from "./product-secure-redaction.ts";

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
  assertRejects(async () => rehydrateProductOutput(`${tokens[0]} ${tokens[0]}`, redacted.map, [tokens[0]]), ProductRedactionError, "duplicated_placeholder");
  assertRejects(async () => rehydrateProductOutput("⟦PD_EMAIL_9999⟧", redacted.map, []), ProductRedactionError, "unknown_placeholder");
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
  assertEquals(result.nextCursor.stage, "passport");
  assertEquals(result.telemetry.callId, sent.callId);
  assertEquals(JSON.stringify(result.telemetry).includes("ДОГОВОР"), false);
  assertEquals(result.usage.calls, 1);
  assertEquals(result.artifact.version, 1);
  assertEquals(PRODUCT_GENERATION_POLICY_VERSION, state().bounds.policyVersion);
});

Deno.test("reported model usage above the per-call bound fails before checkpoint", async () => {
  const model: ProductModelPort = { invoke: async () => ({ output: {}, inputTokens: 9_999_999, outputTokens: 1, elapsedMs: 1 }) };
  await assertRejects(() => new ProductGenerationRuntime(model, legal).runStep(state()), ProductGenerationError, "budget_exceeded");
});