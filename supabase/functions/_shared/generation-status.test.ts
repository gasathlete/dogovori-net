// Unit tests за статусите на generation jobs и класификацията на грешки.
// Изпълняват се с: deno test --allow-net --allow-env supabase/functions/_shared/generation-status.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  STORED_STATUS,
  classifyUpstreamFailure,
  isTerminalStatus,
  isValidIdempotencyKey,
  normalizeJobStatus,
} from "./generation-status.ts";

Deno.test("normalizeJobStatus: съхраненото 'done' и каноничното 'completed' са едно и също", () => {
  assertEquals(normalizeJobStatus("done"), "completed");
  assertEquals(normalizeJobStatus("completed"), "completed");
  assertEquals(normalizeJobStatus("DONE"), "completed");
  assertEquals(normalizeJobStatus("success"), "completed");
});

Deno.test("normalizeJobStatus: error/failed → error, rejected остава, всичко друго е running", () => {
  assertEquals(normalizeJobStatus("error"), "error");
  assertEquals(normalizeJobStatus("failed"), "error");
  assertEquals(normalizeJobStatus("rejected"), "rejected");
  assertEquals(normalizeJobStatus("running"), "running");
  assertEquals(normalizeJobStatus("queued"), "running");
  assertEquals(normalizeJobStatus(null), "running");
  assertEquals(normalizeJobStatus(undefined), "running");
});

Deno.test("STORED_STATUS: в базата успехът се пише като 'done' (без пренаписване на историята)", () => {
  assertEquals(STORED_STATUS.completed, "done");
  assertEquals(STORED_STATUS.running, "running");
  assertEquals(STORED_STATUS.error, "error");
  assertEquals(STORED_STATUS.rejected, "rejected");
  // Всичко записано се нормализира обратно към каноничното.
  for (const [canonical, stored] of Object.entries(STORED_STATUS)) {
    assertEquals(normalizeJobStatus(stored), canonical);
  }
});

Deno.test("isTerminalStatus: done/completed/error/rejected са крайни, running не е", () => {
  assert(isTerminalStatus("done"));
  assert(isTerminalStatus("completed"));
  assert(isTerminalStatus("error"));
  assert(isTerminalStatus("rejected"));
  assert(!isTerminalStatus("running"));
  assert(!isTerminalStatus(null));
});

Deno.test("isValidIdempotencyKey: приема само безопасни ключове 8–128 символа", () => {
  assert(isValidIdempotencyKey("gen:abc123:0f9e8d7c"));
  assert(isValidIdempotencyKey("a".repeat(128)));
  assert(!isValidIdempotencyKey("short"));
  assert(!isValidIdempotencyKey("a".repeat(129)));
  assert(!isValidIdempotencyKey("has space 12345"));
  assert(!isValidIdempotencyKey("semi;colon12345"));
  assert(!isValidIdempotencyKey(12345678));
  assert(!isValidIdempotencyKey(null));
  assert(!isValidIdempotencyKey(undefined));
});

Deno.test("classifyUpstreamFailure: кодът от тялото има приоритет пред всичко", () => {
  assertEquals(
    classifyUpstreamFailure({ httpStatus: 500, bodyCode: "quota_exceeded", bodyError: "timeout" }),
    "quota_exceeded",
  );
});

Deno.test("classifyUpstreamFailure: текстът разпознава timeout / JSON / AI upstream", () => {
  assertEquals(classifyUpstreamFailure({ thrown: "The operation was aborted" }), "job_timeout");
  assertEquals(classifyUpstreamFailure({ bodyError: "Request timed out" }), "job_timeout");
  assertEquals(classifyUpstreamFailure({ bodyError: "Отговорът не може да бъде парснат като JSON" }), "ai_parse_failed");
  assertEquals(classifyUpstreamFailure({ thrown: "AiJsonUnparsableError: unparsable" }), "ai_parse_failed");
  assertEquals(classifyUpstreamFailure({ bodyError: "AI Gateway недостъпен" }), "ai_upstream_error");
  assertEquals(classifyUpstreamFailure({ bodyError: "Моделът върна празен отговор" }), "ai_upstream_error");
});

Deno.test("classifyUpstreamFailure: HTTP статусите се превеждат в стабилни кодове", () => {
  assertEquals(classifyUpstreamFailure({ httpStatus: 401 }), "auth_required");
  assertEquals(classifyUpstreamFailure({ httpStatus: 402 }), "quota_exceeded");
  assertEquals(classifyUpstreamFailure({ httpStatus: 429 }), "rate_limited");
  assertEquals(classifyUpstreamFailure({ httpStatus: 422 }), "special_category_blocked");
  assertEquals(classifyUpstreamFailure({ httpStatus: 500 }), "internal_error");
  assertEquals(classifyUpstreamFailure({ httpStatus: 503 }), "internal_error");
});

Deno.test("classifyUpstreamFailure: неясна причина → background_failure при изключение, иначе unknown", () => {
  assertEquals(classifyUpstreamFailure({ thrown: "boom" }), "background_failure");
  assertEquals(classifyUpstreamFailure({}), "unknown");
  assertEquals(classifyUpstreamFailure({ httpStatus: 200 }), "unknown");
});

Deno.test("classifyUpstreamFailure: никога не връща суров текст на грешката", () => {
  const raw = "Иван Петров, ЕГН 8001011234, тел. 0888123456 — нещо се обърка";
  const code = classifyUpstreamFailure({ httpStatus: 500, bodyError: raw });
  assert(!code.includes("Иван"));
  assert(!code.includes("8001011234"));
  assert(/^[a-z_]+$/.test(code));
});
