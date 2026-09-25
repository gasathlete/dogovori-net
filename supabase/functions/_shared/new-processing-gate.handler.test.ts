// Тестове на СЪЩИНСКИТЕ обработчици: прихващаме Deno.serve, подменяме fetch.
// Нито една заявка не излиза навън; Stripe/доставчик/запис се броят като
// нарушение, ако бъдат достигнати в OFF режим.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isNewProcessingOpen, NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";

// Supabase клиентът пуска таймер за refresh; не е мрежа.
const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

type Handler = (req: Request) => Promise<Response> | Response;
const USER_ID = "99999999-8888-4777-8666-555555555555";
const OP_ID = "11111111-2222-4333-8444-555555555555";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
Deno.env.set("STRIPE_SANDBOX_API_KEY", "sk_test_stub");
Deno.env.set("STRIPE_LIVE_API_KEY", "sk_live_stub");
for (const k of Object.values(NEW_PROCESSING_FLAGS)) Deno.env.delete(k);

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
  try {
    await import(path);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  assert(h, `handler not captured: ${path}`);
  cache.set(path, h!);
  return h!;
}

interface Call { method: string; url: string }
type Lookup = "absent" | "committed";

function installFetch(calls: Call[], lookup: Lookup) {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  const orig = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(json({ id: USER_ID, aud: "authenticated", email: "t@example.test" }));
    }
    if (url.includes("/rpc/assistant_turn_lookup")) {
      return Promise.resolve(json(lookup === "committed"
        ? { status: "committed", thread_id: null, result: { events: [{ event: "delta", data: { t: "ok" } }] } }
        : { status: "absent" }));
    }
    return Promise.resolve(json({ error: "unexpected" }, 500));
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const isForbidden = (c: Call) =>
  !c.url.includes("/rpc/assistant_turn_lookup") && !c.url.includes("/auth/v1/user") && (
  c.url.includes("stripe.com") ||
  c.url.includes("ai.gateway") ||
  c.url.includes("lovable.dev") ||
  (c.url.includes("/rest/v1/") && c.method !== "GET") ||
  c.url.includes("/rpc/"));

const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });

T("флаг: само точен 'true' отваря", () => {
  for (const v of [undefined, "", "TRUE", "1", "yes", " true"]) {
    assertEquals(isNewProcessingOpen("assistant", () => v), false);
  }
  assertEquals(isNewProcessingOpen("assistant", () => "true"), true);
});

const checkouts: Array<[string, Record<string, unknown>]> = [
  ["../create-checkout/index.ts", { priceId: "pro_monthly", returnUrl: "https://x/r", environment: "live", allowPromotionCodes: true }],
  ["../create-strict-unlock-checkout/index.ts", { doc_key: "nda", return_url: "https://x/r", environment: "live" }],
];

for (const [path, body] of checkouts) {
  T(`${path}: OFF → 503, без Stripe и без запис`, async () => {
    const h = await load(path);
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const res = await h(post({ ...body, enabled: true, flag: "true" }));
      assertEquals(res.status, 503);
      const j = await res.json();
      assertEquals(j.code, "checkout_prelaunch_closed");
      assertEquals(calls.filter(isForbidden), []);
    } finally { restore(); }
  });

  T(`${path}: OPTIONS 2xx и липсващ auth = 401`, async () => {
    const h = await load(path);
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
      assert(o.status < 300);
      await o.body?.cancel();
      const r = await h(post(body, false));
      assertEquals(r.status, 401);
      await r.body?.cancel();
      assertEquals(calls.length, 0);
    } finally { restore(); }
  });
}

T("assistant-chat: OFF + нов ход → 503, без доставчик и без запис", async () => {
  const h = await load("../assistant-chat/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const res = await h(post({ operationId: OP_ID, message: "Какъв е срокът на предизвестие?" }));
    assertEquals(res.status, 503);
    assertEquals((await res.json()).code, "assistant_prelaunch_closed");
    assertEquals(calls.filter(isForbidden), []);
    assert(calls.some((c) => c.url.includes("/rpc/assistant_turn_lookup")));
  } finally { restore(); }
});

T("assistant-chat: OFF + записан ход → възпроизвеждане", async () => {
  const h = await load("../assistant-chat/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "committed");
  try {
    const res = await h(post({ operationId: OP_ID, message: "Какъв е срокът на предизвестие?" }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "text/event-stream");
    assert((await res.text()).includes('"t":"ok"'));
    assertEquals(calls.filter(isForbidden), []);
  } finally { restore(); }
});

T("assistant-chat: OPTIONS и 401 без auth", async () => {
  const h = await load("../assistant-chat/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assert(o.status < 300);
    await o.body?.cancel();
    const r = await h(post({ operationId: OP_ID, message: "x" }, false));
    assertEquals(r.status, 401);
    await r.body?.cancel();
    assertEquals(calls.length, 0);
  } finally { restore(); }
});
