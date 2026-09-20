import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cancelQuota,
  isOperationInProgress,
  operationInProgressResponse,
  reserveQuota,
} from "./quota-ledger.ts";

/**
 * ИСТИНА ЗА ОТМЯНАТА (миграция 0029): когато отменената операция НАИСТИНА е
 * таксувана, редът в quota_session_charges се маха, затова следващ опит по
 * същия ключ таксува ТОЧНО веднъж наново. Ако отмяната е на нетаксувана
 * (session_reuse) операция, повторният опит остава безплатен.
 *
 * Двойникът долу моделира точно този SQL инвариант.
 */
function fakeDb(opts: { sessionReuse?: boolean } = {}) {
  type Row = {
    state: string;
    charged: boolean;
    source: string;
    cancelledAt: string | null;
    sessionKey: string;
  };
  const ledger = new Map<string, Row>();
  const sessionCharges = new Set<string>();
  let planCharges = 0;
  return {
    sessionCharges,
    planCharges: () => planCharges,
    rpc(name: string, args: Record<string, unknown>) {
      const id = String(args.p_operation_id);
      const sessionKey = `${args.p_session_id ?? ""}|${args.p_doc_key ?? ""}`;
      if (name === "quota_reserve") {
        const existing = ledger.get(id);
        if (existing) {
          if (existing.state !== "cancelled") {
            return Promise.resolve({
              data: { ok: true, replay: true, state: existing.state, charged: existing.charged, source: existing.source, result_ref: null },
              error: null,
            });
          }
          if (existing.cancelledAt === null) {
            return Promise.resolve({
              data: { ok: false, reason: "cancellation_unproven", state: "cancelled", replay: true },
              error: null,
            });
          }
          ledger.delete(id);
        }
        const reuse = opts.sessionReuse || sessionCharges.has(sessionKey);
        if (!reuse) {
          sessionCharges.add(sessionKey);
          planCharges++;
        }
        ledger.set(id, {
          state: "reserved",
          charged: !reuse,
          source: reuse ? "session_reuse" : "free_plan",
          cancelledAt: null,
          sessionKey,
        });
        return Promise.resolve({
          data: { ok: true, replay: false, state: "reserved", charged: !reuse, source: reuse ? "session_reuse" : "free_plan", retry: !!existing, result_ref: null },
          error: null,
        });
      }
      if (name === "quota_cancel") {
        const row = ledger.get(id);
        if (!row) return Promise.resolve({ data: { ok: false, reason: "unknown_operation" }, error: null });
        if (row.charged) {
          // Таксуваната операция освобождава и резервацията на сесията.
          sessionCharges.delete(row.sessionKey);
          planCharges--;
        }
        row.state = "cancelled";
        row.charged = false;
        row.cancelledAt = new Date().toISOString();
        return Promise.resolve({ data: { ok: true, replay: false, state: "cancelled", charged: false }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected rpc" } });
    },
    from() {
      return { insert: () => Promise.resolve({ error: null }) };
    },
  };
}

const base = {
  operationId: "11111111-1111-4111-8111-111111111111",
  userId: "u-1",
  kind: "template" as const,
  purpose: "download_blank",
  sessionId: "s-1",
  docKey: "d-1",
  requestDigest: "a".repeat(64),
};

Deno.test("таксувана отмяна маха реда за сесията и повторният опит таксува веднъж", async () => {
  const db = fakeDb();
  const first = await reserveQuota(db, base);
  assertEquals(first.status, "reserved");
  assertEquals(db.planCharges(), 1);

  const cancelled = await cancelQuota(db, base.operationId, "ai_gateway_500");
  assertEquals(cancelled.status, "settled");
  assertEquals(db.sessionCharges.size, 0);
  assertEquals(db.planCharges(), 0);

  const retry = await reserveQuota(db, base);
  assertEquals(retry.status, "reserved");
  assertEquals((retry as { charged: boolean }).charged, true);
  // ТОЧНО едно таксуване общо след отмяна и повторение.
  assertEquals(db.planCharges(), 1);
});

Deno.test("отмяна на нетаксувана (session_reuse) операция остава безплатна", async () => {
  const db = fakeDb({ sessionReuse: true });
  const first = await reserveQuota(db, base);
  assertEquals((first as { charged: boolean }).charged, false);
  assertEquals(db.planCharges(), 0);
  await cancelQuota(db, base.operationId, "ai_gateway_500");
  const retry = await reserveQuota(db, base);
  assertEquals((retry as { charged: boolean }).charged, false);
  assertEquals(db.planCharges(), 0);
});

Deno.test("повторение на още течаща операция е 'в ход', не ново изпълнение", async () => {
  const db = fakeDb();
  await reserveQuota(db, base);
  const replay = await reserveQuota(db, base);
  assertEquals(isOperationInProgress(replay as Parameters<typeof isOperationInProgress>[0]), true);
  const res = operationInProgressResponse({}, 4);
  assertEquals(res.status, 409);
  assertEquals(res.headers.get("Retry-After"), "4");
  const body = await res.json();
  assertEquals(body.code, "operation_in_progress");
  assertEquals(body.retry_after_seconds, 4);
  assertEquals(body.charge_state, "reserved");
});

Deno.test("потвърдена операция НЕ се смята за 'в ход'", () => {
  assertEquals(
    isOperationInProgress({ status: "reserved", replay: true, ledgerState: "committed" }),
    false,
  );
});
