import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lookupCommittedOperation } from "./quota-ledger.ts";
import { reserveAnonDelivery } from "./anon-delivery-ledger.ts";

const DIGEST = "a".repeat(64);
const OP = "11111111-1111-4111-8111-111111111111";

function lookupDb(row: Record<string, unknown> | null, error?: { message: string }) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    rpc(_fn: string, args: Record<string, unknown>) {
      calls.push(args);
      return Promise.resolve({ data: row, error: error ?? null });
    },
    from() {
      throw new Error("не се очаква запис при само-четящо търсене");
    },
  };
}

const base = {
  operationId: OP,
  userId: "22222222-2222-4222-8222-222222222222",
  kind: "download_contract" as const,
  purpose: "download-blank",
  sessionId: null,
  docKey: "doc-1",
  batchId: null,
  requestDigest: DIGEST,
};

Deno.test("липсваща операция е 'absent' и не пише нищо", async () => {
  const db = lookupDb({ status: "absent" });
  assertEquals(await lookupCommittedOperation(db, base), { status: "absent", reason: undefined });
  assertEquals(db.calls.length, 1);
});

Deno.test("доказано отменена операция е 'absent' с причина cancelled", async () => {
  const db = lookupDb({ status: "absent", reason: "cancelled" });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "absent",
    reason: "cancelled",
  });
});

Deno.test("различно обвързване е конфликт", async () => {
  const db = lookupDb({ status: "conflict", reason: "binding_conflict" });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "conflict",
    reason: "binding_conflict",
  });
});

Deno.test("невалиден отпечатък не стига до базата", async () => {
  const db = lookupDb({ status: "absent" });
  const out = await lookupCommittedOperation(db, { ...base, requestDigest: "кратък" });
  assertEquals(out, { status: "conflict", reason: "request_digest_required" });
  assertEquals(db.calls.length, 0);
});

Deno.test("завършена операция връща САМО записания резултат", async () => {
  const db = lookupDb({
    status: "committed",
    charged: true,
    source: "plan",
    result_ref: { bucket: "document-blanks", path: "req/x.docx" },
  });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "committed",
    charged: true,
    source: "plan",
    resultRef: { bucket: "document-blanks", path: "req/x.docx" },
  });
});

Deno.test("активна резервация е in_progress с изчакване", async () => {
  const db = lookupDb({ status: "in_progress", retry_after_seconds: 12 });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "in_progress",
    retryAfterSeconds: 12,
  });
});

Deno.test("недоказан изход е изравняване", async () => {
  const db = lookupDb({ status: "reconciliation", reason: "cancellation_unproven" });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "reconciliation",
    reason: "cancellation_unproven",
  });
});

Deno.test("непознат статус НЕ е 'няма операция'", async () => {
  const db = lookupDb({ status: "нещо" });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "unavailable",
    message: "unexpected_lookup_status:нещо",
  });
});

Deno.test("грешка в базата е недостъпност, не ново право", async () => {
  const db = lookupDb(null, { message: "connection reset" });
  assertEquals(await lookupCommittedOperation(db, base), {
    status: "unavailable",
    message: "connection reset",
  });
});

Deno.test("изтекъл запазен отговор е типизиран 'expired', а не празен отговор", async () => {
  const db = {
    rpc() {
      return Promise.resolve({ data: { ok: false, reason: "response_expired" }, error: null });
    },
    from() {
      throw new Error("няма запис");
    },
  };
  const out = await reserveAnonDelivery(db, {
    operationId: OP,
    identityHash: "b".repeat(64),
    requestDigest: DIGEST,
  });
  assertEquals(out, { kind: "expired", reason: "response_expired" });
});
