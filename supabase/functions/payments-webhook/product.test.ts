/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Продуктовите покупки: точно една привилегия, никакви операции/кредити и
 * идемпотентност по Stripe сесия.
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type WebhookDeps,
  classifySnapshotPurchaseKind,
  handleCheckoutCompleted,
} from "./handlers.ts";

type Result = { data: unknown; error: { message?: string } | null };

interface Call {
  table: string;
  op: string;
  args?: unknown[];
}

function makeDb(opts: {
  results?: Record<string, Result>;
  rpc?: (fn: string, args: unknown) => Result;
} = {}) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: unknown }[] = [];
  const results = opts.results ?? {};

  function builder(table: string) {
    let op = "select";
    const result = (): Result =>
      results[`${table}.${op}`] ?? results[table] ?? { data: [{ id: "row" }], error: null };
    const b: any = {
      select: () => b,
      eq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
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
      rpcCalls.push({ fn, args });
      return Promise.resolve(opts.rpc ? opts.rpc(fn, args) : { data: { ok: true }, error: null });
    },
  };
}

const PROOF = { eventId: "evt_1", paidAt: "2026-09-10T09:00:00.000Z" };

const INTAKE = {
  id: "in_1",
  status: "checkout_created",
  user_id: "u1",
  product_id: "contract_check",
  source_hash: "a".repeat(64),
  uploaded_contract_id: "doc_1",
  source_updated_at: "2026-09-01T00:00:00Z",
  environment: "live",
  source_extraction_status: "full",
  source_char_count: 4200,
  stripe_session_id: "cs_p1",
  stripe_price_id: "price_1",
  stripe_price_lookup_key: "contract_check_299",
  expected_amount_cents: 299,
  currency: "eur",
  terms_accepted: true,
  ai_ack_accepted: true,
  immediate_performance_consent: true,
  withdrawal_loss_acknowledged: true,
  consent_recorded_at: "2026-09-01T00:00:00Z",
};

function makeDeps(db: any, lineItems: unknown[]): WebhookDeps {
  return {
    db,
    createStripe: () => ({
      checkout: { sessions: { listLineItems: () => Promise.resolve({ data: lineItems }) } },
      subscriptions: { retrieve: () => Promise.resolve({ metadata: {} }) },
    }),
    sendEmail: () => Promise.resolve({}),
  } as unknown as WebhookDeps;
}

function productSession(over: Record<string, unknown> = {}) {
  return {
    id: "cs_p1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 299,
    currency: "eur",
    livemode: true,
    // Само непрозрачни идентификатори: съгласията и хешът НЕ идват от Stripe.
    metadata: {
      purchase_kind: "product",
      userId: "u1",
      productId: "contract_check",
      intakeId: "in_1",
      sourceDocumentId: "doc_1",
      environment: "live",
    },
    ...over,
  };
}

const CHECK_ITEM = [{
  quantity: 1,
  amount_total: 299,
  currency: "eur",
  price: {
    id: "price_1",
    active: true,
    type: "one_time",
    currency: "eur",
    unit_amount: 299,
    recurring: null,
    lookup_key: "contract_check_299",
    tax_behavior: "inclusive",
    livemode: true,
  },
}];

Deno.test("платена продуктова сесия записва точно една привилегия без операции", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF);
  // Едно атомарно извикване прави и правото, и доказателството за поръчката.
  assertEquals(db.rpcCalls.map((c) => c.fn), ["record_product_purchase"]);
  const args = db.rpcCalls[0].args as Record<string, unknown>;
  assertEquals(args.p_product_id, "contract_check");
  assertEquals(args.p_amount_cents, 299);
  assertEquals(args.p_price_id, "price_1");
  assertEquals(args.p_currency, "eur");
  assertEquals(args.p_intake_id, "in_1");
  // Часът и идентификаторът идват от подписаното събитие, не от сървърния час.
  assertEquals(args.p_paid_at, PROOF.paidAt);
  assertEquals(args.p_stripe_event_id, "evt_1");
  // Никакъв отделен браузърно четим запис и никакви операции/кредити.
  assertEquals(db.calls.some((c) => c.table === "order_snapshots"), false);
  assertEquals(db.rpcCalls.some((c) => c.fn === "credit_topup_ops"), false);
});

Deno.test("грешен режим на продуктова сесия не създава нищо", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() =>
    handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession({ mode: "subscription" }), "live", PROOF)
  );
  assertEquals(db.rpcCalls.length, 0);
  assertEquals(db.calls.some((c) => c.table === "order_snapshots"), false);
});

Deno.test("липсващо доказателство за пълен източник е отказ", async () => {
  const db = makeDb({
    results: {
      product_checkout_intakes: {
        data: { ...INTAKE, source_extraction_status: null, source_char_count: null },
        error: null,
      },
    },
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF));
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("несъвпадаща цена по реда е отказ", async () => {
  const db = makeDb({
    results: {
      product_checkout_intakes: { data: { ...INTAKE, stripe_price_id: "price_other" }, error: null },
    },
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF));
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("неплатена продуктова сесия не пише нищо", async () => {
  const db = makeDb();
  await handleCheckoutCompleted(
    makeDeps(db, CHECK_ITEM),
    productSession({ payment_status: "unpaid" }),
    "live",
    PROOF,
  );
  assertEquals(db.calls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("грешна сума по сесията е fail-closed", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() =>
    handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession({ amount_total: 199 }), "live", PROOF)
  );
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("несъвпадащ intake е fail-closed", async () => {
  const db = makeDb({
    results: {
      product_checkout_intakes: { data: { ...INTAKE, user_id: "u2" }, error: null },
    },
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF));
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("конфликтен повторен запис хвърля, за да повтори Stripe", async () => {
  const db = makeDb({
    results: { product_checkout_intakes: { data: INTAKE, error: null } },
    rpc: () => ({ data: null, error: { message: "session conflict" } }),
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF));
});

Deno.test("идемпотентен повторен запис е успех", async () => {
  const db = makeDb({
    results: { product_checkout_intakes: { data: INTAKE, error: null } },
    rpc: () => ({ data: { ok: true, created: false }, error: null }),
  });
  await handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF);
  assertEquals(db.rpcCalls.map((c) => c.fn), ["record_product_purchase"]);
});

Deno.test("окръжението на сесията трябва да съвпада", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "sandbox", PROOF));
});

Deno.test("непознат productId не става вид покупка", () => {
  assertEquals(
    classifySnapshotPurchaseKind({
      mode: "payment",
      metadata: { type: "product", productId: "toString" },
    }),
    "unknown",
  );
});

Deno.test("без подписано събитие няма право", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live"));
  assertEquals(db.rpcCalls.length, 0);
  await assertRejects(() =>
    handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", {
      eventId: "evt_1",
      paidAt: "not-a-time",
    })
  );
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("половин състояние на заявката е отказ", async () => {
  for (const status of ["pending", "expired", "weird"]) {
    const db = makeDb({
      results: { product_checkout_intakes: { data: { ...INTAKE, status }, error: null } },
    });
    await assertRejects(() =>
      handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF)
    );
    assertEquals(db.rpcCalls.length, 0);
  }
});

Deno.test("повторна доставка от вече платена заявка минава през същия RPC", async () => {
  const db = makeDb({
    results: { product_checkout_intakes: { data: { ...INTAKE, status: "paid" }, error: null } },
    rpc: () => ({ data: { ok: true, created: false }, error: null }),
  });
  await handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live", PROOF);
  assertEquals(db.rpcCalls.map((c) => c.fn), ["record_product_purchase"]);
  assertEquals(
    (db.rpcCalls[0].args as Record<string, unknown>).p_stripe_event_id,
    "evt_1",
  );
});

Deno.test("event.created се превръща в точен час на плащане", async () => {
  const { eventProofFrom } = await import("./handlers.ts");
  assertEquals(eventProofFrom({ id: "evt_9", created: 1757502000 }), {
    eventId: "evt_9",
    paidAt: new Date(1757502000 * 1000).toISOString(),
  });
  assertEquals(eventProofFrom({ id: "evt_9" }), null);
  assertEquals(eventProofFrom({ created: 1757502000 }), null);
});
