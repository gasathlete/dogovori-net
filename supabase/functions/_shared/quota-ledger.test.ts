import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BILLING_RECONCILIATION_REQUIRED,
  cancelQuota,
  commitQuota,
  nextLedgerState,
  reserveQuota,
} from "./quota-ledger.ts";

type Row = { state: string; charged: boolean; source: string };

/** Минимален двойник на SQL семантиката, за да се тества контрактът. */
function fakeDb(opts: { fail?: string; bonus?: boolean; sessionReuse?: boolean } = {}) {
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
          return Promise.resolve({
            data: { ok: existing.state !== "cancelled", replay: true, state: existing.state, charged: existing.charged, source: existing.source },
            error: null,
          });
        }
        const source = opts.sessionReuse ? "session_reuse" : opts.bonus ? "bonus" : "free_plan";
        const charged = !opts.sessionReuse;
        ledger.set(id, { state: "reserved", charged, source });
        return Promise.resolve({ data: { ok: true, replay: false, state: "reserved", charged, source }, error: null });
      }
      if (name === "quota_commit") {
        const row = ledger.get(id);
        if (!row) return Promise.resolve({ data: { ok: false, reason: "unknown_operation" }, error: null });
        if (row.state === "cancelled") {
          return Promise.resolve({ data: { ok: false, reason: "commit_after_cancel" }, error: null });
        }
        const replay = row.state === "committed";
        row.state = "committed";
        return Promise.resolve({ data: { ok: true, replay, state: "committed", charged: row.charged }, error: null });
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

const base = { operationId: "op-1", userId: "u-1", kind: "template" as const, purpose: "test" };

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
