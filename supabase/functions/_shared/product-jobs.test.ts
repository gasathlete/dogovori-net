import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AWAITING_GENERATION_CURSOR,
  INITIAL_CURSOR,
  PRODUCT_JOB_MAX_ATTEMPTS,
  PRODUCT_STAGE_SEQUENCE,
  ZERO_USAGE,
  allowedNextStages,
  cursorAdvances,
  cursorKey,
  isLeaseActive,
  isLeaseStale,
  isTerminalFailure,
  jobIdempotencyKey,
  parseJobCursor,
  resolveProductGenerationAdapter,
  usageWithinBounds,
} from "./product-jobs.ts";
import { computeProductCostBounds } from "./product-generation-policy.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";

const cls = classifyDocumentBeforeAI("Настоящият договор урежда отношенията между страните. ".repeat(40));
const bounds = computeProductCostBounds("contract_check", 10_000, cls);

Deno.test("повреден курсор се отхвърля, не се поправя наум", () => {
  assertEquals(parseJobCursor(null), null);
  assertEquals(parseJobCursor([]), null);
  assertEquals(parseJobCursor({ stage: "не_съществува", batch_index: 0, chunk_index: 0 }), null);
  assertEquals(parseJobCursor({ stage: "review", batch_index: -1, chunk_index: 0 }), null);
  assertEquals(parseJobCursor({ stage: "review", batch_index: 1.5, chunk_index: 0 }), null);
  assertEquals(parseJobCursor({ stage: "review", batch_index: 1, chunk_index: 2 }), {
    stage: "review",
    batch_index: 1,
    chunk_index: 2,
  });
});

Deno.test("последователността на етапите е ПРОДУКТОВА", () => {
  assertEquals([...PRODUCT_STAGE_SEQUENCE.contract_check], [
    "queued", "awaiting_generation", "passport", "review", "synthesis", "completed",
  ]);
  assert(!PRODUCT_STAGE_SEQUENCE.contract_check.includes("corrections"));
  assert(PRODUCT_STAGE_SEQUENCE.contract_improve.includes("corrections"));
  assert(PRODUCT_STAGE_SEQUENCE.negotiation_package.includes("messages"));
  // Терминалните етапи нямат следващ законен етап.
  assertEquals([...allowedNextStages("contract_check", "completed")], []);
  assertEquals([...allowedNextStages("contract_check", "failed")], []);
});

Deno.test("курсорът само напредва по законния продуктов ред", () => {
  assert(cursorAdvances("contract_check", INITIAL_CURSOR, AWAITING_GENERATION_CURSOR));
  assertFalse(cursorAdvances("contract_check", AWAITING_GENERATION_CURSOR, INITIAL_CURSOR));
  assertFalse(cursorAdvances("contract_check", AWAITING_GENERATION_CURSOR, AWAITING_GENERATION_CURSOR));
  // Няма пряк скок от queued към completed.
  assertFalse(cursorAdvances("contract_check", INITIAL_CURSOR, {
    stage: "completed", batch_index: 0, chunk_index: 0,
  }));
  // Проверката НЕ минава през corrections.
  assertFalse(cursorAdvances("contract_check", { stage: "review", batch_index: 0, chunk_index: 0 }, {
    stage: "corrections", batch_index: 0, chunk_index: 0,
  }));
  assert(cursorAdvances("contract_improve", { stage: "review", batch_index: 0, chunk_index: 0 }, {
    stage: "corrections", batch_index: 0, chunk_index: 0,
  }));
  // Нов етап започва от нула.
  assertFalse(cursorAdvances("contract_check", { stage: "review", batch_index: 2, chunk_index: 0 }, {
    stage: "synthesis", batch_index: 2, chunk_index: 0,
  }));
  // В същия етап индексите растат строго.
  assert(cursorAdvances("contract_check", { stage: "review", batch_index: 1, chunk_index: 0 }, {
    stage: "review", batch_index: 2, chunk_index: 0,
  }));
  assertFalse(cursorAdvances("contract_check", { stage: "review", batch_index: 2, chunk_index: 5 }, {
    stage: "review", batch_index: 2, chunk_index: 4,
  }));
});

Deno.test("ключът на стъпката и на идемпотентността са стабилни", () => {
  assertEquals(cursorKey(AWAITING_GENERATION_CURSOR), "awaiting_generation:0:0");
  const id = "11111111-2222-3333-4444-555555555555";
  assertEquals(
    jobIdempotencyKey(id, AWAITING_GENERATION_CURSOR),
    jobIdempotencyKey(id, AWAITING_GENERATION_CURSOR),
  );
  assert(
    jobIdempotencyKey(id, AWAITING_GENERATION_CURSOR) !==
      jobIdempotencyKey(id, { stage: "review", batch_index: 0, chunk_index: 0 }),
  );
  assert(
    jobIdempotencyKey(id, AWAITING_GENERATION_CURSOR) !==
      jobIdempotencyKey(id, AWAITING_GENERATION_CURSOR, "друга.версия"),
  );
});

Deno.test("постоянната грешка е крайна, повторяемата не е", () => {
  assert(isTerminalFailure("failed", "permanent"));
  assertFalse(isTerminalFailure("failed", "retryable"));
  assertFalse(isTerminalFailure("review", "permanent"));
  assertFalse(isTerminalFailure("review", null));
});

Deno.test("наемът е активен само докато не изтече", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  assert(isLeaseActive("2026-03-01T12:05:00.000Z", now));
  assertFalse(isLeaseActive("2026-03-01T11:55:00.000Z", now));
  assertFalse(isLeaseActive(null, now));
  assertFalse(isLeaseActive("не е дата", now));
  assert(isLeaseStale("2026-03-01T11:59:59.000Z", now));
});

Deno.test("разходът не може да надхвърли ОТДЕЛНИТЕ изчислени граници", () => {
  assert(usageWithinBounds(ZERO_USAGE, bounds));
  assertFalse(usageWithinBounds({ ...ZERO_USAGE, calls: bounds.maxModelCalls + 1 }, bounds));
  assertFalse(usageWithinBounds({ ...ZERO_USAGE, input_tokens: bounds.maxInputTokens + 1 }, bounds));
  assertFalse(usageWithinBounds({ ...ZERO_USAGE, output_tokens: bounds.maxOutputTokens + 1 }, bounds));
  assertFalse(
    usageWithinBounds({ ...ZERO_USAGE, cost_micro_usd: bounds.hardCostMicroUsd + 1 }, bounds),
  );
  // Разходът се води в micro-USD, не в milli-cents.
  assertEquals(Object.keys(ZERO_USAGE).includes("cost_milli_cents"), false);
});

Deno.test("в този етап НЯМА адаптер за генерация", () => {
  assertEquals(resolveProductGenerationAdapter(), null);
  assertEquals(PRODUCT_JOB_MAX_ATTEMPTS, 20);
});
