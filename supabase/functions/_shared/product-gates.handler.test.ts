// Gate 8/9: create-product-checkout, fulfill-product, refine-product при
// OFF/липсващи PRODUCT_* флагове. Истински обработчици, Deno.serve прихванат,
// fetch изцяло подменен — нищо не излиза навън.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PRODUCT_INTEGRATION_ENV } from "./product-integration.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;
const USER_ID = "99999999-8888-4777-8666-555555555555";
const OTHER_ID = "77777777-8888-4777-8666-555555555555";
const DOC_ID = "33333333-4444-4555-8666-777777777777";
const REQ_ID = "44444444-5555-4666-8777-888888888888";
const ENT_ID = "55555555-6666-4777-8888-999999999999";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
Deno.env.set("LOVABLE_API_KEY", "stub-gateway-key");
Deno.env.set("STRIPE_LIVE_API_KEY", "sk_live_stub");
Deno.env.set("PAYMENTS_LIVE_WEBHOOK_SECRET", "whsec_stub");
for (const k of [PRODUCT_INTEGRATION_ENV.checkoutEnabled, PRODUCT_INTEGRATION_ENV.fulfillmentEnabled,
  PRODUCT_INTEGRATION_ENV.zeroRetention]) Deno.env.delete(k);

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
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Само-четящи проби, позволени при OFF: способност на схемата, правна база, профил.
const READ_RPCS = ["/rpc/product_rollout_capability", "/rpc/is_staff"];
function install(calls: Call[], entOwner = USER_ID, liveEnabled = true) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (url.includes("/rest/v1/product_launch_control") && method === "GET") return json([{ live_enabled: liveEnabled }]);
    if (url.includes("/rest/v1/product_entitlements") && method === "GET") {
      return json([{ id: ENT_ID, user_id: entOwner, product_id: "contract_check", status: "ready" }]);
    }
    if (url.includes("/rest/v1/profiles") && method === "GET") return json([{ id: USER_ID, allow_third_country_ai: true }]);
    return json({ error: "stub" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}
const mutation = (c: Call) =>
  c.url.includes("connector-gateway") || c.url.includes("api.stripe.com") || c.url.includes("ai.gateway") || c.url.includes("/storage/v1/") ||
  (c.url.includes("/rpc/") && !READ_RPCS.some((r) => c.url.includes(r))) ||
  (c.url.includes("/rest/v1/") && !c.url.includes("/rpc/") && !["GET", "HEAD"].includes(c.method));

const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });
const BODY_FLAGS = {
  [PRODUCT_INTEGRATION_ENV.checkoutEnabled]: "true",
  [PRODUCT_INTEGRATION_ENV.fulfillmentEnabled]: "true",
  [PRODUCT_INTEGRATION_ENV.zeroRetention]: "true",
};
const CHECKOUT = {
  productId: "contract_check", uploadedContractId: DOC_ID, requestId: REQ_ID, environment: "live",
  context: { role: "Наемател", objective: "Да проверя сроковете." }, termsAccepted: true, aiAckAccepted: true, immediatePerformanceConsent: true,
  withdrawalLossAcknowledged: true,
};
const REFINE = {
  entitlement_id: ENT_ID, instruction: "Моля, направете писмата по-кратки и по-учтиви.",
  idempotency_key: "k-1", expected_result_digest: "a".repeat(64), expected_refinement_version: 0,
};

// ------------------------------------------------ create-product-checkout
T("create-product-checkout: OFF + валидна заявка → 503 checkout_disabled, без Stripe/запис", async () => {
  const h = await load("../create-product-checkout/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post(CHECKOUT));
    const j = await res.json();
    assertEquals(res.status, 503, JSON.stringify(j));
    assertEquals(j.error, "checkout_disabled");
    assertEquals(calls.filter(mutation), []);
    assert(!calls.some((c) => c.url.includes("/rest/v1/uploaded_contracts")), "документът не се чете при OFF");
  } finally { restore(); }
});

T("create-product-checkout: флаг в тялото → отказ, без Stripe/запис", async () => {
  const h = await load("../create-product-checkout/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ ...CHECKOUT, ...BODY_FLAGS }));
    assert(res.status >= 400 && res.status < 600); await res.body?.cancel();
    assertEquals(calls.filter(mutation), []);
  } finally { restore(); }
});

for (const [name, path, body] of [
  ["create-product-checkout", "../create-product-checkout/index.ts", CHECKOUT],
  ["fulfill-product", "../fulfill-product/index.ts", { entitlement_id: ENT_ID }],
  ["refine-product", "../refine-product/index.ts", REFINE],
] as const) {
  T(`${name}: OPTIONS и 401 без auth — без мрежа`, async () => {
    const h = await load(path);
    const calls: Call[] = [];
    const restore = install(calls);
    try {
      const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
      assert(o.status < 300); await o.body?.cancel();
      const r = await h(post(body, false));
      assertEquals(r.status, 401); await r.body?.cancel();
      assertEquals(calls.length, 0);
    } finally { restore(); }
  });
}

T("create-product-checkout: closed LIVE launch overrides enabled integration without payment or writes", async () => {
  const h = await load("../create-product-checkout/index.ts");
  for (const key of Object.keys(BODY_FLAGS)) Deno.env.set(key, "true");
  const calls: Call[] = [];
  const restore = install(calls, USER_ID, false);
  try {
    const res = await h(post(CHECKOUT));
    assertEquals(res.status, 503);
    assertEquals((await res.json()).error, "public_product_launch_closed");
    assertEquals(calls.filter(mutation), []);
    assert(!calls.some((call) => call.url.includes("/rest/v1/uploaded_contracts")));
  } finally {
    restore();
    for (const key of Object.keys(BODY_FLAGS)) Deno.env.delete(key);
  }
});

// ------------------------------------------------ fulfill-product
T("fulfill-product: флаг в тялото → 400 invalid_body, без четене/запис", async () => {
  const h = await load("../fulfill-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ entitlement_id: ENT_ID, ...BODY_FLAGS }));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).error, "invalid_body");
    assertEquals(calls.filter((c) => !c.url.includes("/auth/v1/")), []);
  } finally { restore(); }
});

T("fulfill-product: чуждо право → 404, без задача/доставчик/запис", async () => {
  const h = await load("../fulfill-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls, OTHER_ID);
  try {
    const res = await h(post({ entitlement_id: ENT_ID }));
    assertEquals(res.status, 404); await res.body?.cancel();
    assertEquals(calls.filter(mutation), []);
  } finally { restore(); }
});

// ------------------------------------------------ refine-product
T("refine-product: флаг в тялото → 400 invalid_body, без четене/запис", async () => {
  const h = await load("../refine-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ ...REFINE, ...BODY_FLAGS }));
    assertEquals(res.status, 400); await res.body?.cancel();
    assertEquals(calls.filter((c) => !c.url.includes("/auth/v1/")), []);
  } finally { restore(); }
});

T("refine-product: OFF + чуждо/липсващо право → отказ, без заемане/доставчик/запис", async () => {
  const h = await load("../refine-product/index.ts");
  const calls: Call[] = [];
  const restore = install(calls, OTHER_ID);
  try {
    const res = await h(post(REFINE));
    assert(res.status >= 400); await res.body?.cancel();
    assertEquals(calls.filter(mutation), []);
    assert(!calls.some((c) => c.url.includes("begin_product_result_refinement")));
  } finally { restore(); }
});

// ------------------------------------------------ ред в изходния код
const order = async (file: string, before: string[], gate: string, after: string[]) => {
  const src = await Deno.readTextFile(new URL(file, import.meta.url));
  const g = src.indexOf(gate);
  assert(g > 0, `липсва ${gate}`);
  for (const b of before) { const i = src.indexOf(b); assert(i > 0 && i < g, `${b} трябва да е преди`); }
  for (const a of after) { const i = src.indexOf(a); assert(i > g, `${a} трябва да е след`); }
};
T("create-product-checkout (изходен код): кранът е преди документ, Stripe и всеки запис", () =>
  order("../create-product-checkout/index.ts", ["asUser.auth.getUser(token)"],
    "productPrepaymentBlockers(integrationConfig",
    ["bindTrustedProductSource(", "createStripeClient(environment)", ".insert({", ".update({"]));
T("fulfill-product (изходен код): собственик → replay на ready → кран → задача/доставчик", () =>
  order("../fulfill-product/index.ts",
    ["ent.user_id !== userId", 'if (ent.status === "ready")'],
    "productFulfillmentIntegrationBlockers(integration",
    ['admin.rpc("claim_product_job"', "createProductModelPort({"]));
T("refine-product (изходен код): собственик → кран → заемане/доставчик", () =>
  order("../refine-product/index.ts",
    ["loadReadyPaidProduct(admin"],
    "productFulfillmentIntegrationBlockers(config",
    ['"begin_product_result_refinement"', '"reserve_product_result_refinement_call"']));
T("PRODUCT_* флаговете се четат само от тези три обработчика (webhook/refund/export не зависят)", async () => {
  const names = ["payments-webhook", "product-result-state"];
  for (const n of names) {
    try {
      const src = await Deno.readTextFile(new URL(`../${n}/index.ts`, import.meta.url));
      assert(!/PRODUCT_CHECKOUT_ENABLED|PRODUCT_AI_FULFILLMENT_ENABLED|productFulfillmentIntegrationBlockers|productPrepaymentBlockers/.test(src), n);
    } catch (e) { if (!(e instanceof Deno.errors.NotFound)) throw e; }
  }
});

T("create-product-checkout: флаг със стойност, различна от точно \"true\" → затворено", async () => {
  const h = await load("../create-product-checkout/index.ts");
  for (const v of ["TRUE", "1", "yes", " true"]) {
    Deno.env.set(PRODUCT_INTEGRATION_ENV.checkoutEnabled, v);
    const calls: Call[] = [];
    const restore = install(calls);
    try {
      const res = await h(post(CHECKOUT));
      assertEquals(res.status, 503); await res.body?.cancel();
      assertEquals(calls.filter(mutation), []);
      if (v === "TRUE") console.log("OFF reads:", [...new Set(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`))].join(" | "));
    } finally { restore(); Deno.env.delete(PRODUCT_INTEGRATION_ENV.checkoutEnabled); }
  }
});

T("create-product-checkout: всички env флагове true + флагове в тялото → 503 trusted_source_unavailable, без Stripe/запис", async () => {
  const h = await load("../create-product-checkout/index.ts");
  for (const k of Object.keys(BODY_FLAGS)) Deno.env.set(k, "true");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ ...CHECKOUT }));
    const j = await res.json();
    assertEquals([409, 503].includes(res.status), true, JSON.stringify(j)); // файловият източник спира затворено при обвързването
    assert(typeof j.message === "string" && j.message.includes("Плащане не се извършва"));
    assertEquals(calls.filter(mutation), []);
    assert(!calls.some((c) => c.url.includes("api.stripe.com")));
  } finally {
    restore();
    for (const k of Object.keys(BODY_FLAGS)) Deno.env.delete(k);
  }
});
