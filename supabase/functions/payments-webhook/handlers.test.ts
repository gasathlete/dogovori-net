/* eslint-disable @typescript-eslint/no-explicit-any */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type SnapshotPurchaseKind,
  type WebhookDeps,
  classifySnapshotPurchaseKind,
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
  const rpcArgs: Array<{ fn: string; args: unknown }> = [];
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
    rpcArgs,
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push(fn);
      rpcArgs.push({ fn, args });
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

/**
 * Deps с шпиони: брои Stripe line-item заявките и изпратените имейли, за да
 * може „нула външни действия“ да се твърди, а не да се предполага.
 */
// deno-lint-ignore no-explicit-any
function makeSpyDeps(db: any) {
  const lineItemCalls: string[] = [];
  const emails: string[] = [];
  const deps = makeDeps(db, {
    createStripe: () => ({
      checkout: {
        sessions: {
          listLineItems: (id: string) => {
            lineItemCalls.push(id);
            return Promise.resolve({ data: [] });
          },
        },
      },
      subscriptions: { retrieve: () => Promise.resolve({ metadata: {} }) },
    }),
    sendEmail: (_db: unknown, template: string) => {
      emails.push(template);
      return Promise.resolve({});
    },
  });
  return { deps, lineItemCalls, emails };
}

const productSession = {
  id: "cs_product_reversal",
  mode: "payment",
  livemode: false,
  payment_intent: "pi_product",
  metadata: {
    purchase_kind: "product",
    productId: "contract_check",
    userId: "staff_1",
    intakeId: "intake_1",
    sourceDocumentId: "doc_1",
    environment: "sandbox",
  },
};

function makeReversalDeps(
  db: any,
  sessions: unknown[] = [productSession],
  over: Record<string, unknown> = {},
) {
  const emails: string[] = [];
  const listCalls: unknown[] = [];
  const chargeCalls: string[] = [];
  const deps = makeDeps(db, {
    createStripe: () => ({
      checkout: {
        sessions: {
          list: (args: unknown) => {
            listCalls.push(args);
            return Promise.resolve({ data: sessions });
          },
          listLineItems: () => Promise.resolve({ data: [] }),
        },
      },
      charges: {
        retrieve: (id: string) => {
          chargeCalls.push(id);
          return Promise.resolve({ payment_intent: "pi_product" });
        },
      },
      subscriptions: { retrieve: () => Promise.resolve({ metadata: {} }) },
      ...over,
    }),
    sendEmail: (_db: unknown, template: string) => {
      emails.push(template);
      return Promise.resolve({});
    },
  });
  return { deps, emails, listCalls, chargeCalls };
}

/** Първият ред, подаден на `order_snapshots.upsert`. */
// deno-lint-ignore no-explicit-any
function snapshotRow(db: any): Record<string, unknown> {
  const write = db.calls.find((c: Call) => c.table === "order_snapshots" && c.op === "upsert");
  return (write?.args?.[0] ?? {}) as Record<string, unknown>;
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
    mode: "payment", payment_status: "paid",
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
    mode: "payment", payment_status: "paid",
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
  const session = { id: "cs_3", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } };
  await handleCheckoutCompleted(makeDeps(db), session, "live");
  const writes = db.calls.filter((c) => c.table === "order_snapshots" && c.op === "upsert");
  assertEquals(writes.length, 1);
  assertEquals((writes[0].args?.[1] as { onConflict?: string })?.onConflict, "stripe_session_id");
});

Deno.test("duplicate delivery of the same session stays idempotent", async () => {
  const db = makeDb();
  const session = { id: "cs_3", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } };
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
  const session = { id: "cs_3", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } };
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
    data: { object: { id: "cs_4", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } } },
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

// ---------------------------------------------------------------------------
// Stage 2d0 — истина за плащането
// ---------------------------------------------------------------------------

const UNPAID_STATUSES: Array<string | undefined> = [undefined, "unpaid", "no_payment_required"];

for (const status of UNPAID_STATUSES) {
  Deno.test(`недоказано плащане (${status ?? "missing"}) не прави НИЩО`, async () => {
    const db = makeDb();
    const { deps, lineItemCalls, emails } = makeSpyDeps(db);
    const session: Record<string, unknown> = {
      id: "cs_unpaid",
      mode: "payment",
      amount_total: 290,
      customer_email: "a@b.bg",
      metadata: { userId: "u1", type: "strict_doc_unlock", doc_key: "nda" },
    };
    if (status !== undefined) session.payment_status = status;
    await handleCheckoutCompleted(deps, session, "live");
    assertEquals(db.calls.length, 0);
    assertEquals(db.rpcCalls.length, 0);
    assertEquals(lineItemCalls.length, 0);
    assertEquals(emails.length, 0);
  });
}

Deno.test("неплатена сесия не хвърля — забавеното плащане може да успее по-късно", async () => {
  const db = makeDb();
  await handleCheckoutCompleted(makeDeps(db), {
    id: "cs_async_pending",
    mode: "payment",
    payment_status: "unpaid",
    metadata: { userId: "u1" },
  }, "live");
  assertEquals(db.calls.length, 0);
});

Deno.test("async_payment_succeeded с paid минава по същия идемпотентен път", async () => {
  const db = makeDb();
  const object = { id: "cs_async", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } };
  await dispatchEvent(makeDeps(db), { type: "checkout.session.async_payment_succeeded", data: { object } }, "live");
  const writes = db.calls.filter((c) => c.table === "order_snapshots");
  assertEquals(writes.length, 1);
  assertEquals(writes[0].op, "upsert");
  assertEquals((writes[0].args?.[1] as { onConflict?: string })?.onConflict, "stripe_session_id");
});

Deno.test("async_payment_succeeded без paid се игнорира", async () => {
  const db = makeDb();
  await dispatchEvent(makeDeps(db), {
    type: "checkout.session.async_payment_succeeded",
    data: { object: { id: "cs_async2", mode: "payment", payment_status: "unpaid", metadata: { userId: "u1" } } },
  }, "live");
  assertEquals(db.calls.length, 0);
});

Deno.test("sandbox staff guard важи и за async_payment_succeeded", async () => {
  const db = makeDb({ rpc: () => ({ data: false, error: null }) });
  await dispatchEvent(makeDeps(db), {
    type: "checkout.session.async_payment_succeeded",
    data: { object: { id: "cs_async3", mode: "payment", payment_status: "paid", amount_total: 290, metadata: { userId: "u1" } } },
  }, "sandbox");
  assertEquals(db.calls.length, 0);
  assertEquals(db.rpcCalls, ["is_staff"]);
});

Deno.test("snapshot записва точното окръжение и доказания статус", async () => {
  for (const env of ["live", "sandbox"] as const) {
    const db = makeDb({ rpc: () => ({ data: true, error: null }) });
    await handleCheckoutCompleted(makeDeps(db), {
      id: `cs_env_${env}`,
      mode: "payment",
      payment_status: "paid",
      amount_total: 290,
      metadata: { userId: "u1", priceId: "five_operations" },
    }, env);
    const row = snapshotRow(db);
    assertEquals(row.environment, env);
    assertEquals(row.payment_status, "paid");
  }
});

const KIND_CASES: Array<{ kind: SnapshotPurchaseKind; session: Record<string, unknown> }> = [
  { kind: "team", session: { mode: "subscription", metadata: { userId: "u1", kind: "team", teamId: "t1" } } },
  { kind: "subscription", session: { mode: "subscription", metadata: { userId: "u1", priceId: "professional_monthly" } } },
  { kind: "strict_unlock", session: { mode: "payment", metadata: { userId: "u1", type: "strict_doc_unlock", doc_key: "nda" } } },
  { kind: "branding", session: { mode: "payment", metadata: { userId: "u1", type: "branding_unlock" } } },
  { kind: "entry_pack", session: { mode: "payment", metadata: { userId: "u1", priceId: "five_operations" } } },
  { kind: "topup", session: { mode: "payment", metadata: { userId: "u1", lookup_key: "topup_50" } } },
  { kind: "one_time", session: { mode: "payment", metadata: { userId: "u1", priceId: "single_contract" } } },
  { kind: "unknown", session: { mode: "payment", metadata: { userId: "u1" } } },
  { kind: "unknown", session: { mode: "payment", metadata: { userId: "u1", kind: "vip_lifetime", priceId: "made_up_key" } } },
];

Deno.test("класификаторът на вида покупка е затворен", () => {
  for (const c of KIND_CASES) {
    assertEquals(classifySnapshotPurchaseKind(c.session), c.kind);
  }
  // Регресия: само exact metadata.kind === "team" е team; teamId сам по себе
  // си не променя вида на абонамента.
  assertEquals(classifySnapshotPurchaseKind({ mode: "subscription", metadata: { userId: "u1", teamId: "t1" } }), "subscription");
  assertEquals(classifySnapshotPurchaseKind({ mode: "subscription", metadata: { userId: "u1", kind: "team", teamId: "t1" } }), "team");
  // Произволна metadata никога не става вид.
  assertEquals(classifySnapshotPurchaseKind({ mode: "payment", metadata: { kind: "team" } }), "unknown");
  assertEquals(classifySnapshotPurchaseKind({ mode: "setup", metadata: {} }), "unknown");
});

Deno.test("snapshot записва вида покупка от класификатора", async () => {
  for (const c of KIND_CASES) {
    const db = makeDb({ rpc: () => ({ data: true, error: null }) });
    await handleCheckoutCompleted(makeDeps(db), {
      id: `cs_kind_${c.kind}_${Math.random()}`,
      payment_status: "paid",
      amount_total: 290,
      ...c.session,
    }, "live");
    assertEquals(snapshotRow(db).purchase_kind, c.kind);
  }
});

// ---------------------------------------------------------------------------
// Gate 6 — product refund/dispute truth
// ---------------------------------------------------------------------------

function reversalEvent(type: string, object: Record<string, unknown>, id = "evt_reversal") {
  return { type, id, created: 1_800_000_000, data: { object } };
}

Deno.test("full product refund records exact-session reversal and sends no email", async () => {
  const db = makeDb({
    rpc: (fn) => fn === "is_staff"
      ? { data: true, error: null }
      : { data: { ok: true }, error: null },
  });
  const { deps, emails, listCalls } = makeReversalDeps(db);
  await dispatchEvent(deps, reversalEvent("charge.refunded", {
    id: "ch_1",
    payment_intent: "pi_product",
    amount: 299,
    amount_refunded: 299,
  }), "sandbox");

  assertEquals(listCalls, [{ payment_intent: "pi_product", limit: 3 }]);
  assertEquals(db.rpcCalls, ["is_staff", "record_product_payment_reversal"]);
  assertEquals(db.rpcArgs[1].args, {
    p_session_id: "cs_product_reversal",
    p_environment: "sandbox",
    p_event_id: "evt_reversal",
    p_event_at: new Date(1_800_000_000 * 1000).toISOString(),
    p_action: "refund_full",
  });
  assertEquals(emails.length, 0);
});

Deno.test("partial refund is acknowledged without lookup, write, or email", async () => {
  const db = makeDb();
  const { deps, emails, listCalls } = makeReversalDeps(db);
  await dispatchEvent(deps, reversalEvent("charge.refunded", {
    payment_intent: "pi_product",
    amount: 299,
    amount_refunded: 100,
  }), "sandbox");
  assertEquals(listCalls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
  assertEquals(emails.length, 0);
});

for (const c of [
  { type: "charge.dispute.created", status: "needs_response", action: "dispute_created" },
  { type: "charge.dispute.closed", status: "won", action: "dispute_won" },
  { type: "charge.dispute.closed", status: "lost", action: "dispute_lost" },
]) {
  Deno.test(`${c.type}/${c.status} maps to ${c.action} without email`, async () => {
    const db = makeDb({
      rpc: (fn) => fn === "is_staff"
        ? { data: true, error: null }
        : { data: { ok: true }, error: null },
    });
    const { deps, emails } = makeReversalDeps(db);
    await dispatchEvent(deps, reversalEvent(c.type, {
      id: "dp_1",
      payment_intent: "pi_product",
      status: c.status,
    }), "sandbox");
    assertEquals((db.rpcArgs.at(-1)?.args as { p_action?: string }).p_action, c.action);
    assertEquals(emails.length, 0);
  });
}

Deno.test("non-final dispute close is ignored", async () => {
  const db = makeDb();
  const { deps, listCalls } = makeReversalDeps(db);
  await dispatchEvent(deps, reversalEvent("charge.dispute.closed", {
    payment_intent: "pi_product",
    status: "warning_closed",
  }), "sandbox");
  assertEquals(listCalls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("missing or ambiguous product session is ignored fail-closed", async () => {
  for (const sessions of [[], [productSession, { ...productSession, id: "cs_other" }]]) {
    const db = makeDb();
    const { deps, emails } = makeReversalDeps(db, sessions);
    await dispatchEvent(deps, reversalEvent("charge.dispute.created", {
      payment_intent: "pi_product",
    }), "live");
    assertEquals(db.rpcCalls.length, 0);
    assertEquals(emails.length, 0);
  }
});

Deno.test("dispute can resolve payment intent through its exact charge", async () => {
  const db = makeDb({
    rpc: (fn) => fn === "is_staff"
      ? { data: true, error: null }
      : { data: { ok: true }, error: null },
  });
  const { deps, chargeCalls } = makeReversalDeps(db);
  await dispatchEvent(deps, reversalEvent("charge.dispute.created", { charge: "ch_exact" }), "sandbox");
  assertEquals(chargeCalls, ["ch_exact"]);
  assertEquals(db.rpcCalls.includes("record_product_payment_reversal"), true);
});

Deno.test("sandbox reversal for non-staff product owner performs no write", async () => {
  const db = makeDb({ rpc: () => ({ data: false, error: null }) });
  const { deps, emails } = makeReversalDeps(db);
  await dispatchEvent(deps, reversalEvent("charge.dispute.created", {
    payment_intent: "pi_product",
  }), "sandbox");
  assertEquals(db.rpcCalls, ["is_staff"]);
  assertEquals(emails.length, 0);
});

Deno.test("reversal RPC error fails closed so Stripe retries", async () => {
  const liveSession = {
    ...productSession,
    livemode: true,
    metadata: { ...productSession.metadata, environment: "live" },
  };
  const db = makeDb({ rpc: () => ({ data: null, error: { message: "db_down" } }) });
  const { deps, emails } = makeReversalDeps(db, [liveSession]);
  await assertRejects(
    () => dispatchEvent(deps, reversalEvent("charge.refunded", {
      payment_intent: "pi_product",
      amount: 299,
      amount_refunded: 299,
    }), "live"),
    Error,
    "record_product_payment_reversal failed",
  );
  assertEquals(emails.length, 0);
});
