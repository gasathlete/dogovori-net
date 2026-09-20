/**
 * GATE 2 — трайна идентичност и точно еднократно изпълнение на четирите
 * документни операции с модел. Тестът е БЕЗ мрежа: RPC клиентът е двойник,
 * който записва извикванията, така че редът на стъпките е проверим.
 */
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AI_DOCUMENT_PURPOSES,
  asOperationId,
  canonicalDocumentBinding,
  cancelDocumentOperation,
  commitDocumentOperation,
  lookupDocumentOperation,
  markDocumentModelStarted,
  markDocumentReconciliation,
  ocrPageSequenceDigest,
  PROVIDER_CALL_BUDGET,
  ProviderCallBudget,
  reserveDocumentOperation,
  type LedgerRpc,
} from "./ai-document-ledger.ts";

function fakeRpc(
  responses: Record<string, { data: unknown; error: { message: string } | null }>,
): LedgerRpc & { calls: Array<{ name: string; params: Record<string, unknown> }> } {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(name, params) {
      calls.push({ name, params });
      return Promise.resolve(responses[name] ?? { data: { status: "absent" }, error: null });
    },
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

Deno.test("operation_id: приема само валиден UUID, нищо не се поправя тихо", () => {
  assertEquals(asOperationId("not-a-uuid"), null);
  assertEquals(asOperationId(""), null);
  assertEquals(asOperationId(42), null);
  assertEquals(asOperationId(undefined), null);
  const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  assertEquals(asOperationId(uuid), uuid);
  assertEquals(asOperationId(` ${uuid.toUpperCase()} `), uuid);
});

Deno.test("обвързването е каноничен SHA-256 и се променя при всяка значима разлика", async () => {
  const base = {
    purpose: "correct_uploaded" as const,
    userId: "u-1",
    resourceId: "doc-1",
    resourceVersion: "v-1",
    options: { a: 1, b: [1, 2], c: { d: true } },
  };
  const a = await canonicalDocumentBinding(base);
  assert(HEX64.test(a), "обвързването е 64 шестнадесетични знака");
  // Различен ред на ключовете дава СЪЩИЯ отпечатък.
  const reordered = await canonicalDocumentBinding({
    ...base,
    options: { c: { d: true }, b: [1, 2], a: 1 },
  });
  assertEquals(reordered, a);
  const variants = await Promise.all([
    canonicalDocumentBinding({ ...base, purpose: "negotiation_strategy" }),
    canonicalDocumentBinding({ ...base, userId: "u-2" }),
    canonicalDocumentBinding({ ...base, resourceId: "doc-2" }),
    canonicalDocumentBinding({ ...base, resourceVersion: "v-2" }),
    canonicalDocumentBinding({ ...base, options: { ...base.options, a: 2 } }),
    canonicalDocumentBinding({ ...base, options: { ...base.options, b: [2, 1] } }),
  ]);
  for (const v of variants) assert(v !== a, "различен вход трябва да дава различно обвързване");
});

Deno.test("OCR обвързване: подредени отпечатъци на страници, без байтове", async () => {
  const p1 = "data:image/png;base64,AAAA";
  const p2 = "data:image/png;base64,BBBB";
  const first = await ocrPageSequenceDigest([p1, p2]);
  const again = await ocrPageSequenceDigest([p1, p2]);
  const swapped = await ocrPageSequenceDigest([p2, p1]);
  assertEquals(first.digest, again.digest);
  assert(first.digest !== swapped.digest, "редът на страниците е част от обвързването");
  const serialized = JSON.stringify(first);
  assert(!serialized.includes("AAAA") && !serialized.includes("BBBB"), "няма base64 съдържание");
  assert(!serialized.includes("data:image"), "няма data URL в обвързването");
  for (const page of first.pages) assert(HEX64.test(page.sha256));
});

Deno.test("бюджетът за повиквания към доставчика е точен и непреодолим", () => {
  assertEquals(PROVIDER_CALL_BUDGET.correct_uploaded, 2);
  assertEquals(PROVIDER_CALL_BUDGET.generate_linked_document, 1);
  assertEquals(PROVIDER_CALL_BUDGET.negotiation_strategy, 2);
  assertEquals(PROVIDER_CALL_BUDGET.ocr_contract, 12);
  for (const purpose of AI_DOCUMENT_PURPOSES) {
    const budget = new ProviderCallBudget(purpose);
    for (let i = 0; i < budget.max; i++) budget.take();
    assertEquals(budget.used, PROVIDER_CALL_BUDGET[purpose]);
    assertEquals(budget.remaining, 0);
    assertThrows(() => budget.take(), Error, "provider_call_budget_exceeded");
  }
});

Deno.test("грешка от базата НИКОГА не се тълкува като липсваща операция", async () => {
  const db = fakeRpc({
    ai_document_operation_lookup: { data: null, error: { message: "boom" } },
    ai_document_operation_reserve: { data: null, error: { message: "boom" } },
    ai_document_operation_commit: { data: null, error: { message: "boom" } },
  });
  const args = {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    purpose: "correct_uploaded" as const,
    binding: "b",
  };
  assertEquals((await lookupDocumentOperation(db, args)).kind, "unavailable");
  assertEquals((await reserveDocumentOperation(db, args)).kind, "unavailable");
  assertEquals(
    (await commitDocumentOperation(db, { ...args, result: {} })).kind,
    "unavailable",
  );
});

Deno.test("завършена операция се връща като повторение, без ново изпълнение", async () => {
  const db = fakeRpc({
    ai_document_operation_lookup: {
      data: { status: "committed", result: { ok: true }, replay: true },
      error: null,
    },
  });
  const outcome = await lookupDocumentOperation(db, {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    purpose: "ocr_contract",
    binding: "b",
  });
  assertEquals(outcome.kind, "committed");
  if (outcome.kind === "committed") {
    assertEquals(outcome.replay, true);
    assertEquals(outcome.result, { ok: true });
  }
  assertEquals(db.calls.length, 1, "търсенето е само едно четене");
});

Deno.test("конфликт и изтекъл резултат са детерминирани, без резервация", async () => {
  const conflict = await lookupDocumentOperation(
    fakeRpc({
      ai_document_operation_lookup: {
        data: { status: "conflict", reason: "binding_mismatch" },
        error: null,
      },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "correct_uploaded",
      binding: "b",
    },
  );
  assertEquals(conflict.kind, "conflict");
  if (conflict.kind === "conflict") assertEquals(conflict.reason, "binding_mismatch");
  const expired = await lookupDocumentOperation(
    fakeRpc({
      ai_document_operation_lookup: { data: { status: "response_expired" }, error: null },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "correct_uploaded",
      binding: "b",
    },
  );
  assertEquals(expired.kind, "response_expired");
});

Deno.test("неуредена или изтекла резервация блокира нова операция", async () => {
  for (const reason of ["reconciliation_required", "lease_expired", "unresolved_operation"]) {
    const outcome = await reserveDocumentOperation(
      fakeRpc({
        ai_document_operation_reserve: {
          data: { status: "reconciliation", reason },
          error: null,
        },
      }),
      {
        operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        userId: "u-1",
        purpose: "correct_uploaded",
        binding: "b",
      },
    );
    assertEquals(outcome.kind, "reconciliation");
    if (outcome.kind === "reconciliation") assertEquals(outcome.reason, reason);
  }
});

Deno.test("само един едновременен победител: вторият получава изчакване", async () => {
  const outcome = await reserveDocumentOperation(
    fakeRpc({
      ai_document_operation_reserve: {
        data: { status: "in_progress", retry_after_seconds: 7, model_started: true },
        error: null,
      },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "ocr_contract",
      binding: "b",
    },
  );
  assertEquals(outcome.kind, "in_progress");
  if (outcome.kind === "in_progress") {
    assertEquals(outcome.retryAfterSeconds, 7);
    assertEquals(outcome.modelStarted, true);
  }
});

Deno.test("без трайно начало НЯМА право на повикване към доставчика", async () => {
  const notStarted = await markDocumentModelStarted(
    fakeRpc({
      ai_document_operation_mark_model_started: {
        data: { status: "already_started" },
        error: null,
      },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "correct_uploaded",
      binding: "b",
    },
  );
  assertEquals(notStarted.ok, false);
  assertEquals(notStarted.outcome.kind, "in_progress");

  const failed = await markDocumentModelStarted(
    fakeRpc({
      ai_document_operation_mark_model_started: { data: null, error: { message: "boom" } },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "correct_uploaded",
      binding: "b",
    },
  );
  assertEquals(failed.ok, false);
  assertEquals(failed.outcome.kind, "unavailable");

  const ok = await markDocumentModelStarted(
    fakeRpc({
      ai_document_operation_mark_model_started: { data: { status: "ok" }, error: null },
    }),
    {
      operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      userId: "u-1",
      purpose: "correct_uploaded",
      binding: "b",
    },
  );
  assertEquals(ok.ok, true);
});

Deno.test("потвърждаването праща резултат, счетоводство и най-много една бизнес промяна", async () => {
  const db = fakeRpc({
    ai_document_operation_commit: {
      data: { status: "committed", result: { corrected: true } },
      error: null,
    },
  });
  const outcome = await commitDocumentOperation(db, {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    purpose: "negotiation_strategy",
    binding: "b",
    result: { corrected: true },
    usageFunction: "negotiation-strategy",
    business: { kind: "negotiation_strategy", analysis_id: "a-1" },
    resultTtlSeconds: 86400,
  });
  assertEquals(outcome.kind, "committed");
  assertEquals(db.calls.length, 1, "потвърждаването е ЕДНО атомарно извикване");
  const params = db.calls[0].params;
  assertEquals(params.p_usage_function, "negotiation-strategy");
  assertEquals(params.p_result_ttl_seconds, 86400);
  assertEquals((params.p_business as Record<string, unknown>).kind, "negotiation_strategy");
});

Deno.test("отмяната е преди модела, уреждането е след модела и не връща квота", async () => {
  const cancelDb = fakeRpc({
    ai_document_operation_cancel: {
      data: { status: "reserved", wave_ops: 0, lease_seconds: 0 },
      error: null,
    },
  });
  await cancelDocumentOperation(cancelDb, {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    reason: "legal_unavailable",
  });
  assertEquals(cancelDb.calls[0].name, "ai_document_operation_cancel");
  assertEquals(cancelDb.calls[0].params.p_reason, "legal_unavailable");

  const reconcileDb = fakeRpc({
    ai_document_operation_mark_reconciliation: {
      data: { status: "reconciliation", reason: "provider_uncertainty" },
      error: null,
    },
  });
  const outcome = await markDocumentReconciliation(reconcileDb, {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    reason: "provider_uncertainty",
  });
  assertEquals(outcome.kind, "reconciliation");
  // Уреждането НЕ вика отмяна и НЕ възстановява квота.
  assertEquals(reconcileDb.calls.length, 1);
  assertEquals(reconcileDb.calls[0].name, "ai_document_operation_mark_reconciliation");
});

Deno.test("резервацията праща точния брой платими операции за атомарна вълна", async () => {
  const db = fakeRpc({
    ai_document_operation_reserve: {
      data: { status: "reserved", wave_ops: 9, lease_seconds: 600 },
      error: null,
    },
  });
  await reserveDocumentOperation(db, {
    operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    userId: "u-1",
    purpose: "ocr_contract",
    binding: "b",
    waveOps: 9,
    waveKind: "contract",
    leaseSeconds: 600,
  });
  assertEquals(db.calls[0].params.p_wave_ops, 9);
  assertEquals(db.calls[0].params.p_wave_kind, "contract");
  assertEquals(db.calls[0].params.p_lease_seconds, 600);
});

Deno.test("недостатъчна квота е отказ, не резервация", async () => {
  for (const status of ["denied", "quota_exhausted"]) {
    const outcome = await reserveDocumentOperation(
      fakeRpc({
        ai_document_operation_reserve: {
          data: { status, reason: "insufficient_quota" },
          error: null,
        },
      }),
      {
        operationId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        userId: "u-1",
        purpose: "ocr_contract",
        binding: "b",
        waveOps: 4,
      },
    );
    assertEquals(outcome.kind, "quota_exhausted");
  }
});
