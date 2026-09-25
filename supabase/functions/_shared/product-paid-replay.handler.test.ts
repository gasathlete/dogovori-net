// Платени OFF пътища с ИСТИНСКИ обработчици и пълна синтетична верига
// entitlement + order_snapshot + intake + документ + уточнение.
// Deno.serve е прихванат, fetch е изцяло подменен с памет-база — нищо не излиза.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PRODUCT_INTEGRATION_ENV } from "./product-integration.ts";
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import { canonicalize, sha256Hex } from "./canonical-digest.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;
type Row = Record<string, unknown>;

const USER_ID = "99999999-8888-4777-8666-555555555555";
const OTHER_ID = "77777777-8888-4777-8666-555555555555";
const ENT_ID = "55555555-6666-4777-8888-999999999999";
const INTAKE_ID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const REF_ID = "88888888-9999-4aaa-8bbb-cccccccccccc";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
for (
  const k of [
    PRODUCT_INTEGRATION_ENV.checkoutEnabled,
    PRODUCT_INTEGRATION_ENV.fulfillmentEnabled,
    PRODUCT_INTEGRATION_ENV.zeroRetention,
  ]
) Deno.env.delete(k);

const FIX = JSON.parse(
  await Deno.readTextFile(new URL("./test-fixtures/negotiation-package.json", import.meta.url)),
);
const SOURCE_TEXT: string = FIX.source_text;
const SOURCE_HASH = await sha256Hex(SOURCE_TEXT);
const withHash = (r: Row) => {
  const c = structuredClone(r) as Row & { source: Row };
  c.source.source_hash = SOURCE_HASH;
  return c;
};
const BASE = withHash(FIX.base);
const REFINED = withHash(FIX.refined);
const B = BASE.source as Row;
const INSTRUCTION = "Моля, направете писмата по-кратки и по-учтиви.";
const KEY = "k-1";
const BASE_DIGEST = await sha256Hex(canonicalize(BASE));
const REFINED_CANONICAL = canonicalize(REFINED);
const REFINED_DIGEST = await sha256Hex(REFINED_CANONICAL);

const CONTEXT = {
  role: "Изпълнител",
  objective: "Да ограничим отговорността си",
  preferred_position: "balanced",
  counterparty_context: "Голям корпоративен клиент",
};
const STRIPE = {
  stripe_price_id: "price_syn_799",
  stripe_price_lookup_key: "negotiation_package_799",
  stripe_session_id: "cs_test_syn",
  stripe_event_id: "evt_syn",
};

function world(over: { ent?: Row; ref?: Row | null } = {}): Record<string, Row[]> {
  const ent: Row = {
    id: ENT_ID, user_id: USER_ID, product_id: "negotiation_package", status: "ready",
    result: BASE, result_schema_version: 2, intake_id: INTAKE_ID, ...STRIPE,
    paid_at: "2026-09-12T09:00:00.000Z", amount_cents: 799, currency: "eur", environment: "sandbox",
    source_document_id: B.document_id, source_hash: SOURCE_HASH, source_updated_at: B.source_updated_at,
    source_char_count: B.char_count, source_char_unit: B.char_unit, source_kind: B.source_kind,
    source_page_count: B.page_count, source_extraction_status: "full",
    generation_policy_version: PRODUCT_GENERATION_POLICY_VERSION, ...over.ent,
  };
  const snapshot: Row = {
    id: "snap-1", purchase_kind: "product", product_id: "negotiation_package", payment_status: "paid",
    ...STRIPE, paid_at: ent.paid_at, product_intake_id: INTAKE_ID,
    product_source_document_id: B.document_id, product_source_hash: SOURCE_HASH,
    product_source_updated_at: B.source_updated_at, product_source_char_count: B.char_count,
    product_source_char_unit: B.char_unit, product_source_kind: B.source_kind,
    product_source_pages: B.page_count, product_source_extraction_status: "full",
    environment: "sandbox", price_amount: 7.99, currency: "eur", ai_notice_version: "ai-2026-09",
    terms_accepted: true, immediate_performance_consent: true, withdrawal_loss_acknowledged: true,
    consent_recorded_at: "2026-09-12T08:59:00.000Z", tax_behavior: "inclusive", tax_amount_cents: 133,
  };
  const intake: Row = {
    id: INTAKE_ID, user_id: USER_ID, product_id: "negotiation_package",
    uploaded_contract_id: B.document_id, source_hash: SOURCE_HASH, source_updated_at: B.source_updated_at,
    source_char_count: B.char_count, source_char_unit: B.char_unit, source_kind: B.source_kind,
    source_page_count: B.page_count, source_extraction_status: "full", context: CONTEXT, status: "paid",
    environment: "sandbox", generation_policy_version: PRODUCT_GENERATION_POLICY_VERSION,
    expected_amount_cents: 799, currency: "eur", stripe_price_id: STRIPE.stripe_price_id,
    stripe_price_lookup_key: STRIPE.stripe_price_lookup_key, terms_version: "t-1", privacy_version: "p-1",
    refund_version: "r-1", ai_notice_version: "ai-2026-09", withdrawal_version: "w-1",
    terms_accepted: true, ai_ack_accepted: true, immediate_performance_consent: true,
    withdrawal_loss_acknowledged: true,
  };
  const doc: Row = {
    id: B.document_id, user_id: USER_ID, extracted_text: SOURCE_TEXT, text_hash: SOURCE_HASH,
    updated_at: B.source_updated_at, product_extraction_status: "full",
    product_extracted_chars: B.char_count, product_source_pages: B.page_count, product_source_kind: B.source_kind,
  };
  const ref: Row | null = over.ref === null ? null : {
    id: REF_ID, user_id: USER_ID, entitlement_id: ENT_ID, product_id: "negotiation_package",
    status: "succeeded", base_result_digest: BASE_DIGEST,
    instruction_digest: "", idempotency_key: KEY, expected_refinement_version: 0, refinement_version: 1,
    result: REFINED, result_canonical: REFINED_CANONICAL, result_digest: REFINED_DIGEST, ...over.ref,
  };
  return {
    product_entitlements: [ent], order_snapshots: [snapshot], product_checkout_intakes: [intake],
    uploaded_contracts: [doc], product_result_refinements: ref ? [ref] : [],
  };
}
const INSTRUCTION_DIGEST = await sha256Hex(INSTRUCTION);

const cache = new Map<string, Handler>();
async function load(path: string): Promise<Handler> {
  if (cache.has(path)) return cache.get(path)!;
  let h: Handler | null = null;
  const orig = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (x: any) => {
    h = typeof x === "function" ? x : x?.handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
  };
  try { await import(path); } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  assert(h, `handler not captured: ${path}`);
  cache.set(path, h!);
  return h!;
}

interface Call { method: string; url: string }
const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Само-четящи RPC. product_reconciliation_state е четене на състояние (източник).
const READ_RPCS = ["/rpc/product_rollout_capability", "/rpc/is_staff", "/rpc/product_reconciliation_state"];
function install(calls: Call[], db: Record<string, Row[]>) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    const u = new URL(url);
    if (u.pathname.startsWith("/auth/v1/user")) {
      return J({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    }
    if (u.pathname === "/rest/v1/rpc/product_reconciliation_state") {
      return J({ ok: true, job: null, refinement: null, terminal: null });
    }
    const m = u.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (m && method === "GET" && db[m[1]]) {
      let rows = db[m[1]];
      for (const [k, v] of u.searchParams) {
        if (!v.startsWith("eq.")) continue;
        rows = rows.filter((r) => String(r[k]) === v.slice(3));
      }
      return J(rows);
    }
    return J({ error: "stub" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}
const mutation = (c: Call) =>
  c.url.includes("api.stripe.com") || c.url.includes("ai.gateway") || c.url.includes("/storage/v1/") ||
  (c.url.includes("/rpc/") && !READ_RPCS.some((r) => c.url.includes(r))) ||
  (c.url.includes("/rest/v1/") && !c.url.includes("/rpc/") && !["GET", "HEAD"].includes(c.method));
const touched = (calls: Call[], part: string) => calls.some((c) => c.url.includes(part));

const post = (body: unknown) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tkn" },
    body: JSON.stringify(body),
  });
const REFINE = {
  entitlement_id: ENT_ID, instruction: INSTRUCTION, idempotency_key: KEY,
  expected_result_digest: BASE_DIGEST, expected_refinement_version: 0,
};
const okRef = { instruction_digest: INSTRUCTION_DIGEST };

async function runRefine(body: Row, db: Record<string, Row[]>) {
  const h = await load("../refine-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls, db);
  try {
    const res = await h(post(body));
    return { res, j: await res.json(), calls };
  } finally { restore(); }
}

// ------------------------------------------------ refine-product: replay
T("refine-product: успешно уточнение се повтаря точно при OFF и без ключ за доставчик", async () => {
  Deno.env.delete("LOVABLE_API_KEY");
  const { res, j, calls } = await runRefine(REFINE, world({ ref: okRef }));
  assertEquals(res.status, 200, JSON.stringify(j));
  assertEquals(j.status, "ready");
  assertEquals(j.replay, true);
  assertEquals(j.result, REFINED);
  assertEquals(j.result_digest, REFINED_DIGEST);
  assertEquals(j.base_result_digest, BASE_DIGEST);
  assertEquals(Object.keys(j).sort(), ["base_result_digest", "correlation_id", "replay", "result", "result_digest", "status"]);
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "/rest/v1/uploaded_contracts"), "източникът не се чете при повторение");
  assert(!touched(calls, "load_product_result_state"), "текущата версия не се чете");
  assert(!touched(calls, "product_rollout_capability"), "кранът не е нужен за повторение");
  assert(touched(calls, "/rest/v1/order_snapshots") && touched(calls, "/rest/v1/product_checkout_intakes"),
    "плащането се проверява изцяло");
});

for (
  const [label, body] of [
    ["остаряло указание", { ...REFINE, instruction: "Моля, направете писмата по-твърди и по-кратки." }],
    ["остарял оригинал", { ...REFINE, expected_result_digest: "b".repeat(64) }],
    ["остаряла версия", { ...REFINE, expected_refinement_version: 1 }],
  ] as const
) {
  T(`refine-product: ${label} при същия ключ → 409 idempotency_conflict, без запис`, async () => {
    const { res, j, calls } = await runRefine(body, world({ ref: okRef }));
    assertEquals(res.status, 409, JSON.stringify(j));
    assertEquals(j.error, "idempotency_conflict");
    assert(!("result" in j));
    assertEquals(calls.filter(mutation), []);
    assert(!touched(calls, "/rest/v1/uploaded_contracts"));
  });
}

T("refine-product: нов ключ при OFF → 503, без заемане/доставчик/запис", async () => {
  Deno.env.set("LOVABLE_API_KEY", "stub-gateway-key");
  const { res, j, calls } = await runRefine({ ...REFINE, idempotency_key: "k-2" }, world({ ref: okRef }));
  Deno.env.delete("LOVABLE_API_KEY");
  assertEquals(res.status, 503, JSON.stringify(j));
  assert(typeof j.error === "string" && j.error.length > 0);
  assert(!("result" in j));
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "begin_product_result_refinement"));
  assert(!touched(calls, "reserve_product_result_refinement_call"));
  assert(touched(calls, "/rest/v1/uploaded_contracts"), "новата заявка минава по текущия източник");
  console.log("refine new OFF code:", j.error);
});

T("refine-product: нова заявка без запис на уточнение при OFF → 503, без запис", async () => {
  const { res, j, calls } = await runRefine(REFINE, world({ ref: null }));
  assertEquals(res.status, 503, JSON.stringify(j));
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "begin_product_result_refinement"));
});

T("refine-product: чужда покупка → 404, уточненията не се четат", async () => {
  const { res, j, calls } = await runRefine(REFINE, world({ ent: { user_id: OTHER_ID }, ref: okRef }));
  assertEquals(res.status, 404, JSON.stringify(j));
  assert(!("result" in j));
  assert(!touched(calls, "/rest/v1/product_result_refinements"));
  assertEquals(calls.filter(mutation), []);
});

T("refine-product: уточнение на друг потребител със същия ключ не се връща", async () => {
  const { res, j, calls } = await runRefine(REFINE, world({ ref: { ...okRef, user_id: OTHER_ID } }));
  assert(res.status !== 200, JSON.stringify(j));
  assert(!("result" in j));
  assertEquals(calls.filter(mutation), []);
});

T("refine-product: върната/неплатена покупка не получава повторение", async () => {
  for (const ent of [{ status: "refunded" }, { stripe_event_id: null }]) {
    const { res, j, calls } = await runRefine(REFINE, world({ ent, ref: okRef }));
    assertEquals(res.status, 409, JSON.stringify(j));
    assert(!("result" in j));
    assert(!touched(calls, "/rest/v1/product_result_refinements"));
  }
  const { res, j } = await runRefine(REFINE, (() => {
    const w = world({ ref: okRef });
    w.order_snapshots[0].payment_status = "refunded";
    return w;
  })());
  assertEquals(res.status, 409, JSON.stringify(j));
  assertEquals(j.error, "payment_unverified");
});

T("refine-product: подменен записан резултат → 409 result_invalid", async () => {
  const tampered = structuredClone(REFINED) as unknown as Row & { payload: { messages: Row[] } };
  tampered.payload.messages[0].body = "Подменен текст.";
  for (
    const ref of [
      { ...okRef, result: tampered },
      { ...okRef, result_digest: "c".repeat(64) },
      { ...okRef, result: BASE, result_canonical: canonicalize(BASE), result_digest: BASE_DIGEST },
    ]
  ) {
    const { res, j, calls } = await runRefine(REFINE, world({ ref }));
    assertEquals(res.status, 409, JSON.stringify(j));
    assertEquals(j.error, "result_invalid");
    assertEquals(calls.filter(mutation), []);
  }
});

// ------------------------------------------------ fulfill-product
async function runFulfill(db: Record<string, Row[]>) {
  const h = await load("../fulfill-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls, db);
  try {
    const res = await h(post({ entitlement_id: ENT_ID }));
    return { res, j: await res.json(), calls };
  } finally { restore(); }
}

T("fulfill-product: валидно платено ново право при OFF → 503, без задача/доставчик/запис", async () => {
  Deno.env.set("LOVABLE_API_KEY", "stub-gateway-key");
  const { res, j, calls } = await runFulfill(world({ ent: { status: "paid", result: null, result_schema_version: null } }));
  Deno.env.delete("LOVABLE_API_KEY");
  assertEquals(res.status, 503, JSON.stringify(j));
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "claim_product_job"));
  assert(touched(calls, "/rest/v1/uploaded_contracts"), "веригата стига до текущия източник");
  console.log("fulfill new OFF code:", j.error);
});

T("fulfill-product: готово право при OFF → точно повторение на записания резултат", async () => {
  const { res, j, calls } = await runFulfill(world());
  assertEquals(res.status, 200, JSON.stringify(j));
  assertEquals(j.status, "ready");
  assertEquals(j.result, BASE);
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "/rest/v1/uploaded_contracts"));
  assert(!touched(calls, "product_rollout_capability"));
});

// ------------------------------------------------ всички env флагове "true"
// Дори ако оператор по погрешка включи всички текущи флагове, неудостовереният
// произход на източника затваря НОВАТА работа. Готовите/повторените платени
// резултати остават достъпни, а истината за плащане/връщане не се променя.
const ALL_FLAGS: Record<string, string> = {
  [PRODUCT_INTEGRATION_ENV.checkoutEnabled]: "true",
  [PRODUCT_INTEGRATION_ENV.fulfillmentEnabled]: "true",
  [PRODUCT_INTEGRATION_ENV.zeroRetention]: "true",
  LOVABLE_API_KEY: "stub-gateway-key",
  STRIPE_LIVE_API_KEY: "sk_live_stub",
  PAYMENTS_LIVE_WEBHOOK_SECRET: "whsec_stub",
};
async function withAllFlags<T>(fn: () => Promise<T>): Promise<T> {
  for (const [k, v] of Object.entries(ALL_FLAGS)) Deno.env.set(k, v);
  try { return await fn(); } finally { for (const k of Object.keys(ALL_FLAGS)) Deno.env.delete(k); }
}

T("fulfill-product: всички флагове true + ново платено право → 503 trusted_source_unavailable, без задача/доставчик/запис", async () => {
  const { res, j, calls } = await withAllFlags(() =>
    runFulfill(world({ ent: { status: "paid", result: null, result_schema_version: null } }))
  );
  assertEquals(res.status, 503, JSON.stringify(j));
  assertEquals(j.error, "trusted_source_unavailable");
  assert(!("result" in j));
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "claim_product_job"));
  assert(!touched(calls, "ai.gateway"));
});

T("fulfill-product: всички флагове true + готово право → точно повторение", async () => {
  const { res, j, calls } = await withAllFlags(() => runFulfill(world()));
  assertEquals(res.status, 200, JSON.stringify(j));
  assertEquals(j.result, BASE);
  assertEquals(calls.filter(mutation), []);
});

T("refine-product: всички флагове true + нов ключ → 503 trusted_source_unavailable, без заемане/доставчик", async () => {
  const { res, j, calls } = await withAllFlags(() =>
    runRefine({ ...REFINE, idempotency_key: "k-all" }, world({ ref: okRef }))
  );
  assertEquals(res.status, 503, JSON.stringify(j));
  assertEquals(j.error, "trusted_source_unavailable");
  assertEquals(calls.filter(mutation), []);
  assert(!touched(calls, "begin_product_result_refinement"));
  assert(!touched(calls, "reserve_product_result_refinement_call"));
});

T("refine-product: всички флагове true + записано уточнение → точно повторение", async () => {
  const { res, j, calls } = await withAllFlags(() => runRefine(REFINE, world({ ref: okRef })));
  assertEquals(res.status, 200, JSON.stringify(j));
  assertEquals(j.replay, true);
  assertEquals(j.result, REFINED);
  assertEquals(calls.filter(mutation), []);
});

T("refine-product: всички флагове true не възстановяват върната покупка", async () => {
  const { res, j } = await withAllFlags(() => runRefine(REFINE, world({ ent: { status: "refunded" }, ref: okRef })));
  assertEquals(res.status, 409, JSON.stringify(j));
  assert(!("result" in j));
});
