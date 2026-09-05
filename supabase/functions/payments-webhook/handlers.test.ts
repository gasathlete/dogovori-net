import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type WebhookDeps,
  dispatchEvent,
  handleCheckoutCompleted,
  handleSubscriptionCreated,
} from "./handlers.ts";

type Result = { data: unknown; error: { message?: string } | null };

interface Call {
  table: string;
  op: string;
}

/** Минимален chainable двойник на Supabase клиент. */
function makeDb(opts: {
  results?: Record<string, Result>;
  rpc?: (fn: string, args: unknown) => Result;
} = {}) {
  const calls: Call[] = [];
  const rpcCalls: string[] = [];
  const results = opts.results ?? {};

  function builder(table: string) {
    let op = "select";
    const result = (): Result => results[`${table}.${op}`] ?? results[table] ?? { data: [{ id: "row" }], error: null };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
      // deno-lint-ignore no-explicit-any
      then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
    };
    for (const m of ["update", "insert", "upsert", "delete"]) {
      b[m] = () => {
        op = m;
        calls.push({ table, op: m });
        return b;
      };
    }
    return b;
  }

  return {
    calls,
    rpcCalls,
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push(fn);
      return Promise.resolve(opts.rpc ? opts.rpc(fn, args) : { data: true, error: null });
    },
  };
}

// deno-lint-ignore no-explicit-any
function makeDeps(db: any, over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db,
    createStripe: () => ({
      checkout: { sessions: { listLineItems: () => Promise.resolve({ data: [] }) } },
      subscriptions: { retrieve: () => Promise.resolve({ metadata: {} }) },
    }),
    sendEmail: () => Promise.resolve({}),
    ...over,
  };
}

const activeSub = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  metadata: { userId: "u1" },
  items: { data: [{ price: { lookup_key: "professional_monthly" }, current_period_end: 1900000000 }] },
};

Deno.test("paid plan write: download_quota DB error propagates", async () => {
  const db = makeDb({ results: { "download_quota.update": { data: null, error: { message: "boom" } } } });
  await assertRejects(
    () => handleSubscriptionCreated(makeDeps(db), activeSub, "live"),
    Error,
    "download_quota paid plan update failed",
  );
});

Deno.test("paid plan write: zero matching rows fails closed", async () => {
  const db = makeDb({ results: { "download_quota.update": { data: [], error: null } } });
  await assertRejects(
    () => handleSubscriptionCreated(makeDeps(db), activeSub, "live"),
    Error,
    "matched no rows",
  );
});

Deno.test("subscriptions upsert error propagates", async () => {
  const db = makeDb({ results: { "subscriptions.upsert": { data: null, error: { message: "nope" } } } });
  await assertRejects(
    () => handleSubscriptionCreated(makeDeps(db), activeSub, "live"),
    Error,
    "subscriptions upsert failed",
  );
});

Deno.test("branding unlock DB error propagates (paid entitlement)", async () => {
  const db = makeDb({ results: { "branding_unlocks.upsert": { data: null, error: { message: "denied" } } } });
  const session = {
    id: "cs_1",
    mode: "payment",
    amount_total: 990,
    metadata: { userId: "u1", type: "branding_unlock" },
  };
  await assertRejects(
    () => handleCheckoutCompleted(makeDeps(db), session, "live"),
    Error,
    "branding_unlocks upsert failed",
  );
});

Deno.test("strict unlock DB error still fails closed", async () => {
  const db = makeDb({ results: { "strict_doc_unlocks.upsert": { data: null, error: { message: "x" } } } });
  const session = {
    id: "cs_2",
    mode: "payment",
    amount_total: 290,
    metadata: { userId: "u1", type: "strict_doc_unlock", doc_key: "nda" },
  };
  await assertRejects(
    () => handleCheckoutCompleted(makeDeps(db), session, "live"),
    Error,
    "strict_doc_unlocks upsert failed",
  );
});

Deno.test("order snapshot failure stays non-fatal", async () => {
  const db = makeDb({ results: { "order_snapshots.insert": { data: null, error: { message: "snap" } } } });
  const session = { id: "cs_3", mode: "payment", amount_total: 290, metadata: { userId: "u1" } };
  await handleCheckoutCompleted(makeDeps(db), session, "live");
});

Deno.test("sandbox blocked event performs no write", async () => {
  const db = makeDb({ rpc: () => ({ data: false, error: null }) });
  await dispatchEvent(makeDeps(db), {
    type: "checkout.session.completed",
    data: { object: { id: "cs_4", mode: "payment", amount_total: 290, metadata: { userId: "u1" } } },
  }, "sandbox");
  assertEquals(db.calls.length, 0);
  assertEquals(db.rpcCalls, ["is_staff"]);
});

Deno.test("sandbox event with staff owner is processed", async () => {
  const db = makeDb({ rpc: (fn) => (fn === "is_staff" ? { data: true, error: null } : { data: { ok: true }, error: null }) });
  await dispatchEvent(makeDeps(db), {
    type: "customer.subscription.created",
    data: { object: activeSub },
  }, "sandbox");
  assertEquals(db.calls.some((c) => c.table === "subscriptions"), true);
});

Deno.test("live event bypasses staff check", async () => {
  const db = makeDb();
  await dispatchEvent(makeDeps(db), {
    type: "customer.subscription.created",
    data: { object: activeSub },
  }, "live");
  assertEquals(db.rpcCalls.includes("is_staff"), false);
  assertEquals(db.calls.some((c) => c.table === "download_quota"), true);
});

Deno.test("team subscription state error propagates and is env scoped", async () => {
  const db = makeDb({ results: { "teams.update": { data: [], error: null } } });
  await assertRejects(
    () =>
      handleSubscriptionCreated(makeDeps(db), {
        ...activeSub,
        metadata: { kind: "team", teamId: "t1" },
      }, "live"),
    Error,
    "teams subscription state update matched no rows",
  );
});
