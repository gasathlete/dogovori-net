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

const INTAKE = {
  id: "in_1",
  user_id: "u1",
  product_id: "contract_check",
  source_hash: "h1",
  uploaded_contract_id: "doc_1",
  source_updated_at: "2026-09-01T00:00:00Z",
  environment: "live",
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
    metadata: {
      type: "product",
      userId: "u1",
      productId: "contract_check",
      lookupKey: "contract_check_299",
      intakeId: "in_1",
      sourceHash: "h1",
      sourceDocumentId: "doc_1",
      environment: "live",
      terms_accepted: "true",
      ai_ack_accepted: "true",
      immediate_performance_consent: "true",
      withdrawal_loss_acknowledged: "true",
    },
    ...over,
  };
}

const CHECK_ITEM = [{
  quantity: 1,
  amount_total: 299,
  currency: "eur",
  price: {
    active: true,
    type: "one_time",
    currency: "eur",
    unit_amount: 299,
    recurring: null,
    lookup_key: "contract_check_299",
  },
}];

Deno.test("платена продуктова сесия записва точно една привилегия без операции", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live");
  assertEquals(db.rpcCalls.map((c) => c.fn), ["record_product_entitlement"]);
  const args = db.rpcCalls[0].args as Record<string, unknown>;
  assertEquals(args.p_product_id, "contract_check");
  assertEquals(args.p_amount_cents, 299);
  const snapshot = db.calls.find((c) => c.table === "order_snapshots");
  const row = snapshot?.args?.[0] as Record<string, unknown>;
  assertEquals(row.purchase_kind, "product");
  assertEquals(row.product_id, "contract_check");
  assertEquals(row.payment_status, "paid");
  assertEquals(row.terms_accepted, true);
  assertEquals(row.immediate_performance_consent, true);
  assertEquals(row.withdrawal_loss_acknowledged, true);
});

Deno.test("неплатена продуктова сесия не пише нищо", async () => {
  const db = makeDb();
  await handleCheckoutCompleted(
    makeDeps(db, CHECK_ITEM),
    productSession({ payment_status: "unpaid" }),
    "live",
  );
  assertEquals(db.calls.length, 0);
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("грешна сума по сесията е fail-closed", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() =>
    handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession({ amount_total: 199 }), "live")
  );
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("несъвпадащ intake е fail-closed", async () => {
  const db = makeDb({
    results: {
      product_checkout_intakes: { data: { ...INTAKE, user_id: "u2" }, error: null },
    },
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live"));
  assertEquals(db.rpcCalls.length, 0);
});

Deno.test("конфликтен повторен запис хвърля, за да повтори Stripe", async () => {
  const db = makeDb({
    results: { product_checkout_intakes: { data: INTAKE, error: null } },
    rpc: () => ({ data: null, error: { message: "session conflict" } }),
  });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live"));
});

Deno.test("идемпотентен повторен запис е успех", async () => {
  const db = makeDb({
    results: { product_checkout_intakes: { data: INTAKE, error: null } },
    rpc: () => ({ data: { ok: true, created: false }, error: null }),
  });
  await handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "live");
  assertEquals(db.calls.some((c) => c.table === "order_snapshots"), true);
});

Deno.test("окръжението на сесията трябва да съвпада", async () => {
  const db = makeDb({ results: { product_checkout_intakes: { data: INTAKE, error: null } } });
  await assertRejects(() => handleCheckoutCompleted(makeDeps(db, CHECK_ITEM), productSession(), "sandbox"));
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
