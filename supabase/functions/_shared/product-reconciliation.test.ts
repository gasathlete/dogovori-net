import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  markProductJobReconciliation,
  markProductRefinementReconciliation,
  PRODUCT_RECONCILIATION_MESSAGE,
  ProductUncertainCallError,
  readProductReconciliationState,
} from "./product-reconciliation.ts";

interface Call {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function client(handler: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const calls: Call[] = [];
  return {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const out = handler(name, args);
      return Promise.resolve({ data: out.data ?? null, error: out.error ?? null });
    },
  };
}

Deno.test("чистото състояние не блокира нищо", async () => {
  const db = client(() => ({ data: { ok: true, job: null, refinement: null } }));
  const state = await readProductReconciliationState(db, "u", "e");
  assertEquals(state, { jobRequired: false, refinementRequired: false, code: null });
});

Deno.test("неразрешено състояние се разпознава поотделно за задача и уточнение", async () => {
  const jobDb = client(() => ({ data: { ok: true, job: { job_id: "j", code: "call_completion_unknown" }, refinement: null } }));
  const jobState = await readProductReconciliationState(jobDb, "u", "e");
  assert(jobState.jobRequired);
  assertFalse(jobState.refinementRequired);
  assertEquals(jobState.code, "call_completion_unknown");

  const refDb = client(() => ({ data: { ok: true, job: null, refinement: { refinement_id: "r", code: "persist_unknown" } } }));
  const refState = await readProductReconciliationState(refDb, "u", "e");
  assertFalse(refState.jobRequired);
  assert(refState.refinementRequired);
});

Deno.test("нечетимо състояние е ЗАТВОРЕНО, не разрешено", async () => {
  for (const out of [{ error: { message: "down" } }, { data: { ok: false } }, { data: null }]) {
    const db = client(() => out);
    const state = await readProductReconciliationState(db, "u", "e");
    assert(state.jobRequired && state.refinementRequired, "нечетимото състояние трябва да блокира");
    assertEquals(state.code, "state_unreadable");
  }
});

Deno.test("вписването подава точно наема, кода и извикването", async () => {
  const db = client(() => ({ data: { ok: true } }));
  assert(await markProductJobReconciliation(db, "job-1", "lease-1", "call_completion_unknown", "job-1:passport"));
  assertEquals(db.calls[0].name, "mark_product_job_reconciliation");
  assertEquals(db.calls[0].args, {
    p_job_id: "job-1",
    p_lease_token: "lease-1",
    p_code: "call_completion_unknown",
    p_call_id: "job-1:passport",
  });

  const refDb = client(() => ({ data: { ok: true, replay: true } }));
  assert(await markProductRefinementReconciliation(refDb, "ref-1", "lease-2", "persist_unknown"));
  assertEquals(refDb.calls[0].name, "mark_product_refinement_reconciliation");
  assertEquals(refDb.calls[0].args.p_call_id, null);
});

Deno.test("провал при вписването не хвърля и не се преструва на успех", async () => {
  const failing = {
    rpc() {
      return Promise.reject(new Error("network"));
    },
  };
  assertFalse(await markProductJobReconciliation(failing, "j", "l", "call_record_unknown"));
  assertFalse(await markProductRefinementReconciliation(failing, "r", "l", "call_record_unknown"));
  const denied = client(() => ({ data: { ok: false, reason: "lease_mismatch" } }));
  assertFalse(await markProductJobReconciliation(denied, "j", "l", "call_record_unknown"));
});

Deno.test("неизясненото извикване носи затворен код, без текст от доставчик", () => {
  const error = new ProductUncertainCallError("provider_outcome_unknown", "job:passport");
  assertEquals(error.name, "ProductUncertainCallError");
  assertEquals(error.message, "provider_outcome_unknown");
  assertEquals(error.callId, "job:passport");
  assert(!/възстанов|refund/i.test(PRODUCT_RECONCILIATION_MESSAGE));
});
