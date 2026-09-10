import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AWAITING_GENERATION_CURSOR,
  INITIAL_CURSOR,
  PRODUCT_JOB_MAX_ATTEMPTS,
  ZERO_USAGE,
  cursorAdvances,
  cursorKey,
  isLeaseActive,
  isLeaseStale,
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

Deno.test("курсорът само напредва", () => {
  assert(cursorAdvances(INITIAL_CURSOR, AWAITING_GENERATION_CURSOR));
  assertFalse(cursorAdvances(AWAITING_GENERATION_CURSOR, INITIAL_CURSOR));
  assertFalse(cursorAdvances(AWAITING_GENERATION_CURSOR, AWAITING_GENERATION_CURSOR));
  assert(
    cursorAdvances(
      { stage: "review", batch_index: 1, chunk_index: 0 },
      { stage: "review", batch_index: 2, chunk_index: 0 },
    ),
  );
  assertFalse(
    cursorAdvances(
      { stage: "review", batch_index: 2, chunk_index: 5 },
      { stage: "review", batch_index: 2, chunk_index: 4 },
    ),
  );
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

Deno.test("наемът е активен само докато не изтече", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  assert(isLeaseActive("2026-03-01T12:05:00.000Z", now));
  assertFalse(isLeaseActive("2026-03-01T11:55:00.000Z", now));
  assertFalse(isLeaseActive(null, now));
  assertFalse(isLeaseActive("не е дата", now));
  assert(isLeaseStale("2026-03-01T11:59:59.000Z", now));
});

Deno.test("разходът не може да надхвърли изчислените граници", () => {
  assert(usageWithinBounds(ZERO_USAGE, bounds));
  assertFalse(
    usageWithinBounds({ ...ZERO_USAGE, calls: bounds.maxModelCalls + 1 }, bounds),
  );
  assertFalse(
    usageWithinBounds({ ...ZERO_USAGE, input_tokens: bounds.maxTotalTokens + 1 }, bounds),
  );
  assertFalse(
    usageWithinBounds({ ...ZERO_USAGE, cost_milli_cents: bounds.hardCostMilliCents + 1 }, bounds),
  );
});

Deno.test("в този етап НЯМА адаптер за генерация", () => {
  assertEquals(resolveProductGenerationAdapter(), null);
  assertEquals(PRODUCT_JOB_MAX_ATTEMPTS, 20);
});
