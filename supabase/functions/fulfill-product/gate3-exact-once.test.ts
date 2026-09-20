/**
 * GATE 3 — точно един платен резултат от една покупка.
 *
 * Тестовете са МРЕЖОВО ТИХИ: няма доставчик, няма Stripe, няма база. Проверяват
 * се поведението на трайния запис на извикванията и изходният договор на трите
 * функции по платения път.
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createProductCallStore } from "../_shared/product-call-store.ts";
import { ProductUncertainCallError } from "../_shared/product-reconciliation.ts";

const REQUEST = Object.freeze({
  callId: "job-1:passport",
  cursorKey: "passport:0:0",
  routeKey: "passport",
  model: "google/gemini-3.8-flash",
  requestDigest: "a".repeat(64),
  maxInputTokens: 1000,
  maxOutputTokens: 1000,
  payload: Object.freeze({ stage: "passport" }),
  // deno-lint-ignore no-explicit-any
}) as any;

function rpcClient(handler: (name: string) => { data?: unknown; error?: unknown }) {
  const names: string[] = [];
  return {
    names,
    rpc(name: string) {
      names.push(name);
      const out = handler(name);
      return Promise.resolve({ data: out.data ?? null, error: out.error ?? null });
    },
  };
}

Deno.test("заявено, но неприключено извикване е НЕИЗЯСНЕНО, не повторимо", async () => {
  const db = rpcClient(() => ({ data: { ok: true, status: "pending" } }));
  const store = createProductCallStore(db, "job-1", "lease-1");
  const error = await assertRejects(() => store.reserve(REQUEST), ProductUncertainCallError);
  assertEquals((error as ProductUncertainCallError).code, "call_completion_unknown");
  assertEquals((error as ProductUncertainCallError).callId, "job-1:passport");
  // Нито едно второ извикване на доставчик не е възможно: само резервацията.
  assertEquals(db.names, ["reserve_product_generation_call"]);
});

Deno.test("вече приключено извикване се ПОВТАРЯ от записа, без нов доставчик", async () => {
  const stored = { output: { ok: true }, inputTokens: 10, outputTokens: 20, elapsedMs: 5 };
  const db = rpcClient(() => ({ data: { ok: true, status: "complete", response: stored } }));
  const store = createProductCallStore(db, "job-1", "lease-1");
  const result = await store.reserve(REQUEST);
  assertEquals(result.status, "complete");
  assertEquals((result as { response: typeof stored }).response.inputTokens, 10);
});

Deno.test("незаписан отговор след доставчика е НЕИЗЯСНЕН, не провал", async () => {
  for (const out of [{ error: { message: "timeout" } }, { data: { ok: false, reason: "x" } }]) {
    const db = rpcClient(() => out);
    const store = createProductCallStore(db, "job-1", "lease-1");
    const error = await assertRejects(
      () =>
        store.complete(
          REQUEST,
          { output: { a: 1 }, inputTokens: 1, outputTokens: 1, elapsedMs: 1 },
          "res-1",
          10,
        ),
      ProductUncertainCallError,
    );
    assertEquals((error as ProductUncertainCallError).code, "call_record_unknown");
  }
});

/* ------------------------- договор на изходния код ------------------------- */

const fulfil = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const refine = await Deno.readTextFile(
  new URL("../refine-product/index.ts", import.meta.url),
);
const download = await Deno.readTextFile(
  new URL("../download-document/index.ts", import.meta.url),
);

Deno.test("състоянието за изясняване се чете ПРЕДИ заявяването на задача", () => {
  const read = fulfil.indexOf("readProductReconciliationState");
  const claim = fulfil.indexOf('admin.rpc("claim_product_job"');
  assert(read > 0 && claim > 0 && read < claim, "четенето трябва да е преди заявяването");
  assert(fulfil.includes('fail("reconciliation_required", 409'));
});

Deno.test("неизясненото състояние на задачата НЕ освобождава наем и НЕ маркира провал", () => {
  const start = fulfil.indexOf("if (error instanceof ProductUncertainCallError)");
  assert(start > 0, "границата трябва да съществува");
  const branch = fulfil.slice(start, fulfil.indexOf("const gateway =", start));
  assert(branch.includes("markProductJobReconciliation"));
  assert(!branch.includes("release_product_job_lease"));
  assert(!branch.includes("fail_product_job"));
  assert(!/refund|restore/i.test(branch));
});

Deno.test("уточнението не се освобождава след докосване на доставчика", () => {
  assert(refine.includes("let providerAttempted = false;"));
  assert(refine.includes("providerAttempted = true;"));
  const catchStart = refine.lastIndexOf("} catch (error) {");
  const tail = refine.slice(catchStart);
  const guard = tail.indexOf("if (providerAttempted)");
  const free = tail.indexOf("await failRefinement(code)");
  assert(guard > 0 && free > guard, "освобождаването трябва да е след проверката");
  // Неприключеното и незаписаното извикване вече не освобождават уточнението.
  assert(!refine.includes('await failRefinement("call_completion_unknown")'));
  assert(!refine.includes('await failRefinement("persist_failed")'));
  assert(refine.includes('reconcileRefinement("call_completion_unknown"'));
  assert(refine.includes('reconcileRefinement("call_record_unknown"'));
  assert(refine.includes('reconcileRefinement("persist_unknown"'));
});

Deno.test("уточнението чете състоянието за изясняване преди наема и доставчика", () => {
  const read = refine.indexOf("readProductReconciliationState");
  const begin = refine.indexOf('admin.rpc("begin_product_result_refinement"');
  const provider = refine.indexOf("port.invoke(request)");
  assert(read > 0 && read < begin && begin < provider);
});

Deno.test("свалянето отказва всяка платена/продуктова самоличност от браузъра", () => {
  assert(download.includes("paid_result_not_exportable"));
  assert(download.includes("ALLOWED_BODY_KEYS"));
  for (const forbidden of ["entitlement_id", "result_digest", "product_id", "session_id\","]) {
    if (forbidden === 'session_id",') continue;
    assert(
      !download.includes(`"${forbidden}"`),
      `платената самоличност ${forbidden} не бива да се приема`,
    );
  }
});

Deno.test("свалянето не изнася текст на грешка, база или документ", () => {
  assert(!download.includes("(e as Error).message"));
  assert(!download.includes("consumeErr.message"));
  assert(!download.includes("saveErr.message"));
  assert(!download.includes("userErr?.message"));
  assert(download.includes('error: "internal"'));
});

Deno.test("повторното сваляне на записан документ остава безплатно и без квота", () => {
  const start = download.indexOf("if (saved_document_id) {");
  const block = download.slice(start, download.indexOf("if (!planRow)", start));
  assert(block.includes("free: true"));
  assert(!block.includes("consume_quota"));
  assert(!block.includes("refund_quota"));
  assert(!block.includes(".update("));
});
