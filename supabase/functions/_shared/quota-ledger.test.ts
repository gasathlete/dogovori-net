import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BILLING_RECONCILIATION_REQUIRED,
  cancelQuota,
  commitQuota,
  nextLedgerState,
  reserveQuota,
} from "./quota-ledger.ts";

type Row = {
  state: string;
  charged: boolean;
  source: string;
  userId: string;
  kind: string;
  purpose: string;
  sessionId: string | null;
  docKey: string | null;
  batchId: string | null;
  requestDigest: string;
  resultRef: Record<string, unknown> | null;
  cancelledAt: string | null;
  reconciliationRequired: boolean;
};

/** Минимален двойник на SQL семантиката (0031), за да се тества контрактът. */
function fakeDb(
  opts: {
    fail?: string;
    bonus?: boolean;
    sessionReuse?: boolean;
    /** Отмяната е записана, но НЕ е доказана (cancelled_at IS NULL). */
    cancelUnproven?: boolean;
    /** Отменена операция, маркирана за изравняване. */
    cancelNeedsReconciliation?: boolean;
  } = {},
) {
  const ledger = new Map<string, Row>();
  const reconciliations: Record<string, unknown>[] = [];
  const calls: string[] = [];
  return {
    ledger,
    reconciliations,
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(name);
      if (opts.fail === name) {
        return Promise.resolve({ data: null, error: { message: "rpc down" } });
      }
      const id = String(args.p_operation_id);
      if (name === "quota_reserve") {
        const existing = ledger.get(id);
        if (existing) {
          // ПЪЛНО обвързване, включително batch_id: всяко несъответствие е конфликт.
          const mismatch = existing.userId !== String(args.p_user_id) ||
            existing.kind !== String(args.p_kind) ||
            existing.purpose !== String(args.p_purpose ?? "unspecified") ||
            existing.sessionId !== ((args.p_session_id ?? null) as string | null) ||
            existing.docKey !== ((args.p_doc_key ?? null) as string | null) ||
            existing.batchId !== ((args.p_batch_id ?? null) as string | null) ||
            existing.requestDigest !== String(args.p_request_digest);
          if (mismatch) {
            return Promise.resolve({ data: null, error: { message: "idempotency_key_conflict" } });
          }
          if (existing.state !== "cancelled") {
            return Promise.resolve({
              data: {
                ok: true,
                replay: true,
                state: existing.state,
                charged: existing.charged,
                source: existing.source,
                result_ref: existing.resultRef,
              },
              error: null,
            });
          }
          if (existing.reconciliationRequired) {
            return Promise.resolve({
              data: { ok: false, reason: "reconciliation_required", state: "cancelled", replay: true },
              error: null,
            });
          }
          if (existing.cancelledAt === null) {
            return Promise.resolve({
              data: { ok: false, reason: "cancellation_unproven", state: "cancelled", replay: true },
              error: null,
            });
          }
          // ДОКАЗАНА отмяна: нов опит по същия ключ таксува наново (retry).
          const source = opts.bonus ? "bonus" : "free_plan";
          Object.assign(existing, {
            state: "reserved",
            charged: true,
            source,
            resultRef: null,
            cancelledAt: null,
          });
          return Promise.resolve({
            data: { ok: true, replay: false, state: "reserved", charged: true, source, retry: true, result_ref: null },
            error: null,
          });
        }
        const source = opts.sessionReuse ? "session_reuse" : opts.bonus ? "bonus" : "free_plan";
        const charged = !opts.sessionReuse;
        ledger.set(id, {
          state: "reserved",
          charged,
          source,
          userId: String(args.p_user_id),
          kind: String(args.p_kind),
          purpose: String(args.p_purpose ?? "unspecified"),
          sessionId: (args.p_session_id ?? null) as string | null,
          docKey: (args.p_doc_key ?? null) as string | null,
          batchId: (args.p_batch_id ?? null) as string | null,
          requestDigest: String(args.p_request_digest),
          resultRef: null,
          cancelledAt: null,
          reconciliationRequired: false,
        });
        return Promise.resolve({
          data: { ok: true, replay: false, state: "reserved", charged, source, retry: false, result_ref: null },
          error: null,
        });
      }
      if (name === "quota_commit") {
        const row = ledger.get(id);
        if (!row) return Promise.resolve({ data: { ok: false, reason: "unknown_operation" }, error: null });
        if (row.state === "cancelled") {
          return Promise.resolve({ data: { ok: false, reason: "commit_after_cancel" }, error: null });
        }
        const replay = row.state === "committed";
        if (!replay && args.p_result_ref) {
          row.resultRef = args.p_result_ref as Record<string, unknown>;
        }
        row.state = "committed";
        return Promise.resolve({
          data: { ok: true, replay, state: "committed", charged: row.charged, result_ref: row.resultRef },
          error: null,
        });
      }
      if (name === "quota_cancel") {
        const row = ledger.get(id);
        if (!row) return Promise.resolve({ data: { ok: false, reason: "unknown_operation" }, error: null });
        if (row.state === "committed") {
          return Promise.resolve({ data: { ok: false, reason: "cancel_after_commit" }, error: null });
        }
        const replay = row.state === "cancelled";
        row.state = "cancelled";
        row.charged = false;
        row.resultRef = null;
        row.cancelledAt = opts.cancelUnproven ? null : new Date().toISOString();
        row.reconciliationRequired = !!opts.cancelNeedsReconciliation;
        return Promise.resolve({ data: { ok: true, replay, state: "cancelled", charged: false }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected rpc" } });
    },
    from(_table: string) {
      return {
        insert(rows: Record<string, unknown>) {
          reconciliations.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const base = {
  operationId: "op-1",
  userId: "u-1",
  kind: "template" as const,
  purpose: "test",
  requestDigest: "c".repeat(64),
};

Deno.test("чист контракт: разрешени и отхвърлени преходи", () => {
  assertEquals(nextLedgerState(null, "reserve"), { state: "reserved", ok: true, replay: false });
  assertEquals(nextLedgerState("reserved", "reserve").replay, true);
  assertEquals(nextLedgerState("reserved", "commit"), { state: "committed", ok: true, replay: false });
  assertEquals(nextLedgerState("committed", "commit").replay, true);
  assertEquals(nextLedgerState("reserved", "cancel"), { state: "cancelled", ok: true, replay: false });
  assertEquals(nextLedgerState("cancelled", "cancel").replay, true);
  assertEquals(nextLedgerState("cancelled", "commit").reason, "commit_after_cancel");
  assertEquals(nextLedgerState("committed", "cancel").reason, "cancel_after_commit");
});

Deno.test("нова резервация + потвърждение", async () => {
  const db = fakeDb();
  const r = await reserveQuota(db, base);
  assertEquals(r.status, "reserved");
  assertEquals((r as { charged: boolean }).charged, true);
  const c = await commitQuota(db, "op-1") as {
    status: string;
    state: string;
    replay: boolean;
  };
  assertEquals(c.status, "settled");
  assertEquals(c.state, "committed");
  assertEquals(c.replay, false);
});

Deno.test("нова резервация + отмяна", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  const c = await cancelQuota(db, "op-1", "model_failed");
  assertEquals(c, { status: "settled", state: "cancelled", replay: false });
  assertEquals(db.ledger.get("op-1")?.charged, false);
});

Deno.test("повторна резервация не таксува втори път", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  const again = await reserveQuota(db, base);
  assertEquals(again.status, "reserved");
  assertEquals((again as { replay: boolean }).replay, true);
  assertEquals(db.calls.filter((c) => c === "quota_reserve").length, 2);
  assertEquals(db.ledger.size, 1);
});

Deno.test("повторна отмяна е безопасна", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  await cancelQuota(db, "op-1", "x");
  const second = await cancelQuota(db, "op-1", "x");
  assertEquals(second, { status: "settled", state: "cancelled", replay: true });
});

Deno.test("отмяна след потвърждение се отхвърля и се записва за изравняване", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  await commitQuota(db, "op-1");
  const c = await cancelQuota(db, "op-1", "late");
  assertEquals(c.status, "unresolved");
  assertEquals((c as { reason: string }).reason, "cancel_after_commit");
  assertEquals(db.reconciliations.length, 1);
});

Deno.test("потвърждение след отмяна се отхвърля", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  await cancelQuota(db, "op-1", "x");
  const c = await commitQuota(db, "op-1");
  assertEquals(c.status, "unresolved");
  assertEquals((c as { reason: string }).reason, "commit_after_cancel");
});

Deno.test("грешка в RPC при отмяна не твърди charged:false", async () => {
  const db = fakeDb({ fail: "quota_cancel" });
  await reserveQuota(db, base);
  const c = await cancelQuota(db, "op-1", "http_error");
  assertEquals(c.status, "unresolved");
  assertEquals(db.reconciliations.length, 1);
  assertEquals(BILLING_RECONCILIATION_REQUIRED, "billing_reconciliation_required");
});

Deno.test("грешка в RPC при резервация е недостъпност, не отказ", async () => {
  const db = fakeDb({ fail: "quota_reserve" });
  const r = await reserveQuota(db, base);
  assertEquals(r.status, "unavailable");
});

Deno.test("едновременни заявки с един ключ водят до една резервация", async () => {
  const db = fakeDb();
  const [a, b] = await Promise.all([reserveQuota(db, base), reserveQuota(db, base)]);
  assertEquals(db.ledger.size, 1);
  const charged = [a, b].filter((x) => x.status === "reserved" && (x as { charged: boolean }).charged);
  // Двете връщат „резервирано", но таксуване има само веднъж в леджъра.
  assertEquals(charged.length >= 1, true);
  assertEquals(db.ledger.get("op-1")?.state, "reserved");
});

Deno.test("бонус и сесийно преизползване се записват като точен източник", async () => {
  const bonusDb = fakeDb({ bonus: true });
  const bonus = await reserveQuota(bonusDb, base);
  assertEquals((bonus as { source: string }).source, "bonus");

  const reuseDb = fakeDb({ sessionReuse: true });
  const reuse = await reserveQuota(reuseDb, { ...base, sessionId: "s", docKey: "d" });
  assertEquals((reuse as { source: string }).source, "session_reuse");
  assertEquals((reuse as { charged: boolean }).charged, false);
});

Deno.test("невалиден отпечатък на заявката е конфликт ПРЕДИ заявка към базата", async () => {
  let called = false;
  const db = {
    rpc: () => {
      called = true;
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as Parameters<typeof reserveQuota>[0];
  for (const digest of ["", "   ", "zz", "a".repeat(63)]) {
    const r = await reserveQuota(db, { ...base, requestDigest: digest });
    assertEquals(r.status, "conflict");
  }
  assertEquals(called, false);
});

Deno.test("чист контракт: нов опит по същия ключ само при ДОКАЗАНА отмяна", () => {
  assertEquals(
    nextLedgerState("cancelled", "reserve", { cancellationProven: true }),
    { state: "reserved", ok: true, replay: false, retry: true },
  );
  assertEquals(
    nextLedgerState("cancelled", "reserve", { cancellationProven: false }).reason,
    "cancellation_unproven",
  );
  assertEquals(nextLedgerState("cancelled", "reserve").ok, false);
  assertEquals(
    nextLedgerState("cancelled", "reserve", {
      cancellationProven: true,
      reconciliationRequired: true,
    }).reason,
    "reconciliation_required",
  );
});

Deno.test("доказана отмяна: същият ключ се резервира наново точно веднъж", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  await cancelQuota(db, "op-1", "ai_gateway_500");
  const retry = await reserveQuota(db, base);
  assertEquals(retry.status, "reserved");
  assertEquals((retry as { retry: boolean }).retry, true);
  assertEquals((retry as { charged: boolean }).charged, true);
  assertEquals((retry as { replay: boolean }).replay, false);
  assertEquals(db.ledger.get("op-1")?.state, "reserved");
});

Deno.test("недоказана отмяна НЕ се таксува втори път, а иска изравняване", async () => {
  const db = fakeDb({ cancelUnproven: true });
  await reserveQuota(db, base);
  await cancelQuota(db, "op-1", "x");
  const again = await reserveQuota(db, base);
  assertEquals(again.status, "reconciliation");
  assertEquals((again as { reason: string }).reason, "cancellation_unproven");
});

Deno.test("отмяна, чакаща изравняване, блокира нов опит", async () => {
  const db = fakeDb({ cancelNeedsReconciliation: true });
  await reserveQuota(db, base);
  await cancelQuota(db, "op-1", "x");
  const again = await reserveQuota(db, base);
  assertEquals(again.status, "reconciliation");
  assertEquals((again as { reason: string }).reason, "reconciliation_required");
});

Deno.test("различен batch_id по същия ключ е конфликт без таксуване", async () => {
  const db = fakeDb();
  await reserveQuota(db, { ...base, batchId: "b-1" });
  const conflict = await reserveQuota(db, { ...base, batchId: "b-2" });
  assertEquals(conflict.status, "conflict");
  assertEquals(db.ledger.get("op-1")?.batchId, "b-1");
});

Deno.test("различен отпечатък по същия ключ е конфликт", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  const conflict = await reserveQuota(db, { ...base, requestDigest: "d".repeat(64) });
  assertEquals(conflict.status, "conflict");
});

Deno.test("потвърденият резултат се връща при загубен отговор, без ново генериране", async () => {
  const db = fakeDb();
  await reserveQuota(db, { ...base, batchId: "b-1" });
  await commitQuota(db, "op-1", { contract: { title: "X" }, change_summary: "s" });
  const replay = await reserveQuota(db, { ...base, batchId: "b-1" });
  assertEquals(replay.status, "reserved");
  assertEquals((replay as { replay: boolean }).replay, true);
  assertEquals((replay as { charged: boolean }).charged, true);
  assertEquals(
    ((replay as { resultRef: Record<string, unknown> }).resultRef as { change_summary: string })
      .change_summary,
    "s",
  );
});
