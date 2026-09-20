import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANON_DELIVERY_CAP,
  anonRequestDigest,
  cancelAnonDelivery,
  commitAnonDelivery,
  type LedgerDb,
  readAnonDeliveryState,
  reserveAnonDelivery,
} from "./anon-delivery-ledger.ts";

const OP = "11111111-2222-4333-8444-555555555555";
const DIGEST = "a".repeat(64);

function db(
  handler: (name: string, args: Record<string, unknown>) => {
    data: unknown;
    error: { message: string } | null;
  },
): LedgerDb & { calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(handler(name, args));
    },
  };
}

Deno.test("отпечатъкът е каноничен 64-символен малки букви SHA-256", async () => {
  const a = await anonRequestDigest(["ip", OP, "въпрос"]);
  const b = await anonRequestDigest(["ip", OP, "въпрос"]);
  const c = await anonRequestDigest(["ip", OP, "друг въпрос"]);
  assertEquals(/^[0-9a-f]{64}$/.test(a), true);
  assertEquals(a, b);
  assertEquals(a === c, false);
});

Deno.test("резервацията изисква UUID и валиден отпечатък, без RPC", async () => {
  const bad = db(() => ({ data: { ok: true }, error: null }));
  assertEquals(
    (await reserveAnonDelivery(bad, {
      operationId: "not-a-uuid",
      identityHash: "h",
      requestDigest: DIGEST,
    })).kind,
    "conflict",
  );
  assertEquals(
    (await reserveAnonDelivery(bad, {
      operationId: OP,
      identityHash: "h",
      requestDigest: "ABC",
    })).kind,
    "conflict",
  );
  assertEquals(bad.calls.length, 0);
});

Deno.test("резервацията заема място и връща оставащото право", async () => {
  const d = db(() => ({
    data: { ok: true, state: "reserved", remaining: 4, delivered: 1 },
    error: null,
  }));
  const res = await reserveAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
  });
  assertEquals(res, { kind: "reserved", remaining: 4, delivered: 1, retry: false });
  assertEquals(d.calls[0].name, "anon_delivery_reserve");
  assertEquals(d.calls[0].args.p_cap, ANON_DELIVERY_CAP);
});

Deno.test("потвърдена операция се повтаря ТОЧНО, без нов модел", async () => {
  const d = db(() => ({
    data: { ok: true, replay: true, state: "committed", response: { reply: "точен отговор" } },
    error: null,
  }));
  const res = await reserveAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
  });
  assertEquals(res.kind, "replay");
  if (res.kind === "replay") assertEquals(res.response.reply, "точен отговор");
});

Deno.test("потвърдена операция без запазен отговор е недостъпност, не повторение", async () => {
  const d = db(() => ({
    data: { ok: true, replay: true, state: "committed", response: {} },
    error: null,
  }));
  const res = await reserveAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
  });
  assertEquals(res.kind, "unavailable");
});

Deno.test("шестото едновременно място се отказва като лимит преди модела", async () => {
  const d = db(() => ({
    data: { ok: false, reason: "limit_reached", delivered: 5 },
    error: null,
  }));
  assertEquals(
    (await reserveAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
    })).kind,
    "limit_reached",
  );
});

Deno.test("текуща операция е повтаряема, не изразходвано право", async () => {
  const d = db(() => ({
    data: { ok: false, reason: "in_progress", retry_after_seconds: 7 },
    error: null,
  }));
  const res = await reserveAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
  });
  assertEquals(res.kind, "in_progress");
  if (res.kind === "in_progress") assertEquals(res.retryAfterSeconds, 7);
});

Deno.test("различен отпечатък със същия ключ е сблъсък на обвързването", async () => {
  const d = db(() => ({ data: { ok: false, reason: "binding_conflict" }, error: null }));
  assertEquals(
    (await reserveAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
    })).kind,
    "conflict",
  );
});

Deno.test("инфраструктурна грешка е недостъпност — никога ново право или лимит", async () => {
  const d = db(() => ({ data: null, error: { message: "boom" } }));
  const reserve = await reserveAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
  });
  assertEquals(reserve.kind, "unavailable");
  assertEquals(
    (await commitAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
      response: { reply: "x" },
    })).kind,
    "unavailable",
  );
  assertEquals(
    (await cancelAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
      reason: "not_delivered",
    })).kind,
    "uncertain",
  );
  assertEquals((await readAnonDeliveryState(d, "h")).unavailable, true);
});

Deno.test("потвърждаването праща точния отговор и обвързването", async () => {
  const d = db(() => ({ data: { ok: true, remaining: 3 }, error: null }));
  const res = await commitAnonDelivery(d, {
    operationId: OP,
    identityHash: "h",
    requestDigest: DIGEST,
    response: { reply: "здравейте", remaining: 4 },
  });
  assertEquals(res, { kind: "committed", remaining: 3, replay: false });
  assertEquals(d.calls[0].name, "anon_delivery_commit");
  assertEquals(d.calls[0].args.p_operation_id, OP);
  assertEquals(d.calls[0].args.p_request_digest, DIGEST);
});

Deno.test("загубена надпревара при потвърждаване е лимит, не тих успех", async () => {
  const d = db(() => ({ data: { ok: false, reason: "limit_reached" }, error: null }));
  assertEquals(
    (await commitAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
      response: { reply: "x" },
    })).kind,
    "limit_reached",
  );
});

Deno.test("отмяната освобождава мястото със записана причина", async () => {
  const d = db(() => ({ data: { ok: true }, error: null }));
  assertEquals(
    (await cancelAnonDelivery(d, {
      operationId: OP,
      identityHash: "h",
      requestDigest: DIGEST,
      reason: "not_delivered",
    })).kind,
    "cancelled",
  );
  assertEquals(d.calls[0].args.p_reason, "not_delivered");
});
