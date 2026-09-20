import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANON_FREE_MESSAGES,
  ANON_ENTITLEMENT_WINDOW_S,
  anonEntitlementKey,
  consumeAnonDelivered,
  readAnonEntitlement,
} from "./anon-entitlement.ts";

/** Минимален двойник на rate_limit_buckets + rate_limit_check (атомарен ред). */
function fakeDb(initial?: { count: number; window_start: string }) {
  const rows = new Map<string, { count: number; window_start: string }>();
  if (initial) rows.set(anonEntitlementKey("ip"), initial);
  const calls: string[] = [];
  // deno-lint-ignore no-explicit-any
  const db: any = {
    from: () => ({
      select: () => ({
        eq: (_c: string, key: string) => ({
          maybeSingle: () =>
            Promise.resolve({ data: rows.get(key) ?? null, error: null }),
        }),
      }),
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      const key = String(args._key);
      const max = Number(args._max);
      const windowS = Number(args._window_s);
      const now = Date.now();
      let row = rows.get(key);
      if (!row || (now - new Date(row.window_start).getTime()) / 1000 >= windowS) {
        row = { count: 0, window_start: new Date(now).toISOString() };
        rows.set(key, row);
      }
      if (row.count >= max) {
        return Promise.resolve({ data: { ok: false, remaining: 0, retry_after_s: 60 }, error: null });
      }
      row.count += 1;
      return Promise.resolve({ data: { ok: true, remaining: max - row.count, retry_after_s: 0 }, error: null });
    },
  };
  return { db, rows, calls };
}

Deno.test("нов посетител има пълно право", async () => {
  const { db } = fakeDb();
  const state = await readAnonEntitlement(db, "ip");
  assertEquals(state.remaining, ANON_FREE_MESSAGES);
  assertEquals(state.exhausted, false);
});

Deno.test("четенето не изразходва право", async () => {
  const { db, calls } = fakeDb();
  await readAnonEntitlement(db, "ip");
  await readAnonEntitlement(db, "ip");
  assertEquals(calls.length, 0);
});

Deno.test("правото се изчерпва точно след 5 доставени отговора", async () => {
  const { db } = fakeDb();
  for (let i = 0; i < ANON_FREE_MESSAGES; i++) {
    const r = await consumeAnonDelivered(db, "ip");
    assertEquals(r.ok, true);
  }
  const overflow = await consumeAnonDelivered(db, "ip");
  assertEquals(overflow.ok, false);
  assertEquals((await readAnonEntitlement(db, "ip")).exhausted, true);
});

Deno.test("паралелни доставки не надхвърлят лимита", async () => {
  const { db } = fakeDb();
  const results = await Promise.all(
    Array.from({ length: 12 }, () => consumeAnonDelivered(db, "ip")),
  );
  assertEquals(results.filter((r) => r.ok).length, ANON_FREE_MESSAGES);
});

Deno.test("изчистена история в браузъра не връща право", async () => {
  const { db } = fakeDb({
    count: ANON_FREE_MESSAGES,
    window_start: new Date().toISOString(),
  });
  // Клиентът може да изпрати празна история — сървърът пази състоянието.
  assertEquals((await readAnonEntitlement(db, "ip")).exhausted, true);
});

Deno.test("изтекъл прозорец дава ново право", async () => {
  const old = new Date(Date.now() - (ANON_ENTITLEMENT_WINDOW_S + 60) * 1000).toISOString();
  const { db } = fakeDb({ count: ANON_FREE_MESSAGES, window_start: old });
  const state = await readAnonEntitlement(db, "ip");
  assertEquals(state.remaining, ANON_FREE_MESSAGES);
});

Deno.test("грешка при запис не твърди изразходвано право", async () => {
  // deno-lint-ignore no-explicit-any
  const db: any = { rpc: () => Promise.resolve({ data: null, error: { message: "db down" } }) };
  const r = await consumeAnonDelivered(db, "ip");
  assertEquals(r.ok, false);
});

Deno.test("грешка при ЧЕТЕНЕ не дава свежо право (fail-closed)", async () => {
  // deno-lint-ignore no-explicit-any
  const db: any = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "db down" } }) }),
      }),
    }),
  };
  const state = await readAnonEntitlement(db, "ip");
  assertEquals(state.unavailable, true);
  assertEquals(state.remaining, 0);
  // Недостъпността НЕ е изчерпан лимит.
  assertEquals(state.exhausted, false);
});

Deno.test("грешка при запис се докладва като недостъпност, не като лимит", async () => {
  // deno-lint-ignore no-explicit-any
  const db: any = { rpc: () => Promise.resolve({ data: null, error: { message: "db down" } }) };
  const r = await consumeAnonDelivered(db, "ip");
  assertEquals(r.ok, false);
  assertEquals(r.unavailable, true);
  assertEquals(r.exhausted, false);
});

Deno.test("неуспешен опит се освобождава, за да не изгаря повторния опит", async () => {
  const { db, rows } = fakeDb();
  const res = await reserveAnonOperation(db, "ip", "req-1");
  assertEquals(res.ok, true);
  // Второ резервиране със същия ключ би било отказано...
  assertEquals((await reserveAnonOperation(db, "ip", "req-1")).replay, true);
  // ...но след освобождаване същият UUID работи отново.
  const released = await releaseAnonOperation(db, "ip", "req-1");
  assertEquals(released.released, true);
  assertEquals(rows.has(anonOperationKey("ip", "req-1")), false);
  assertEquals((await reserveAnonOperation(db, "ip", "req-1")).ok, true);
});

