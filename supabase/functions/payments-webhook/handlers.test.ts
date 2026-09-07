/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type WebhookDeps,
  dispatchEvent,
  handleCheckoutCompleted,
  handleInvoicePaymentFailed,
  handleSubscriptionCreated,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "./handlers.ts";

type Result = { data: unknown; error: { message?: string } | null };

interface Call {
  table: string;
  op: string;
  args?: unknown[];
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
      b[m] = (...args: unknown[]) => {
        op = m;
        calls.push({ table, op: m, args });
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

Deno.test("first delivery writes an idempotent order snapshot", async () => {
  const db = makeDb();
  const session = { id: "cs_3", mode: "payment", amount_total: 290, metadata: { userId: "u1" } };
  await handleCheckoutCompleted(makeDeps(db), session, "live");
  const writes = db.calls.filter((c) => c.table === "order_snapshots" && c.op === "upsert");
  assertEquals(writes.length, 1);
  assertEquals((writes[0].args?.[1] as { onConflict?: string })?.onConflict, "stripe_session_id");
});

Deno.test("duplicate delivery of the same session stays idempotent", async () => {
  const db = makeDb();
  const session = { id: "cs_3", mode: "payment", amount_total: 290, metadata: { userId: "u1" } };
  await handleCheckoutCompleted(makeDeps(db), session, "live");
  await handleCheckoutCompleted(makeDeps(db), session, "live");
  const writes = db.calls.filter((c) => c.table === "order_snapshots");
  assertEquals(writes.length, 2);
  assertEquals(writes.every((c) => c.op === "upsert"), true);
  // Идемпотентността идва от ON CONFLICT по сесията, не просто от два записа.
  assertEquals(
    writes.every((c) => (c.args?.[1] as { onConflict?: string })?.onConflict === "stripe_session_id"),
    true,
  );
  assertEquals(
    writes.every((c) => (c.args?.[0] as { stripe_session_id?: string })?.stripe_session_id === "cs_3"),
    true,
  );
});

Deno.test("order snapshot DB error fails closed so Stripe retries", async () => {
  const db = makeDb({ results: { "order_snapshots.upsert": { data: null, error: { message: "snap" } } } });
  const session = { id: "cs_3", mode: "payment", amount_total: 290, metadata: { userId: "u1" } };
  await assertRejects(
    () => handleCheckoutCompleted(makeDeps(db), session, "live"),
    Error,
    "order_snapshots upsert failed",
  );
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

// ---------------------------------------------------------------------------
// Zero-row gaps на индивидуалните абонаменти + stored user_id fallback
// ---------------------------------------------------------------------------

const canceledSub = {
  id: "sub_1",
  customer: "cus_1",
  status: "canceled",
  metadata: {},
  items: { data: [{ price: { lookup_key: "professional_monthly" }, current_period_end: 1 }] },
};

Deno.test("subscription.created without userId rejects", async () => {
  const db = makeDb();
  await assertRejects(
    () => handleSubscriptionCreated(makeDeps(db), { ...activeSub, metadata: {} }, "live"),
    Error,
    "subscription.created missing metadata.userId",
  );
  assertEquals(db.calls.length, 0);
});

Deno.test("individual subscription update rejects zero-row DB result", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [], error: null } } });
  await assertRejects(
    () => handleSubscriptionUpdated(makeDeps(db), activeSub, "live"),
    Error,
    "subscriptions update matched no rows",
  );
});

Deno.test("individual subscription delete rejects zero-row DB result", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [], error: null } } });
  await assertRejects(
    () => handleSubscriptionDeleted(makeDeps(db), canceledSub, "live"),
    Error,
    "subscriptions cancel update matched no rows",
  );
});

Deno.test("individual past_due update rejects zero-row DB result", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [], error: null } } });
  const deps = makeDeps(db, {
    createStripe: () => ({
      checkout: { sessions: { listLineItems: () => Promise.resolve({ data: [] }) } },
      subscriptions: { retrieve: () => Promise.resolve({ metadata: {} }) },
    }),
  });
  await assertRejects(
    () => handleInvoicePaymentFailed(deps, { id: "in_1", subscription: "sub_1" }, "live"),
    Error,
    "subscriptions past_due update matched no rows",
  );
});

Deno.test("stored user_id fallback drives quota update on subscription update", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [{ user_id: "stored_u" }], error: null } } });
  await handleSubscriptionUpdated(makeDeps(db), { ...activeSub, metadata: {} }, "live");
  assertEquals(db.calls.some((c) => c.table === "download_quota" && c.op === "update"), true);
});

Deno.test("stored user_id fallback drives free plan on subscription delete", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [{ user_id: "stored_u" }], error: null } } });
  await handleSubscriptionDeleted(makeDeps(db), canceledSub, "live");
  assertEquals(db.calls.some((c) => c.table === "download_quota" && c.op === "update"), true);
});

Deno.test("missing stored user_id leaves quota untouched (no crash)", async () => {
  const db = makeDb({ results: { "subscriptions.update": { data: [{ user_id: null }], error: null } } });
  await handleSubscriptionDeleted(makeDeps(db), canceledSub, "live");
  assertEquals(db.calls.some((c) => c.table === "download_quota"), false);
});
