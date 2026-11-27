// Шести пакет: assistant-chat-anon и build-custom-contract — истински
// обработчици (Deno.serve прихванат, fetch изцяло подменен, без мрежа).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;
const USER_ID = "99999999-8888-4777-8666-555555555555";
const OP_ID = "11111111-2222-4333-8444-555555555555";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
Deno.env.set("LOVABLE_API_KEY", "stub-gateway-key");
Deno.env.set("ANON_IDENTITY_SECRET", "stub-anon-identity-secret-0123456789");
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
type Mode = "absent" | "committed";

function installFetch(calls: Call[], mode: Mode, authed = true) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) {
      return authed ? json({ id: USER_ID, aud: "authenticated", email: "t@example.test" }) : json({ msg: "bad" }, 401);
    }
    if (url.includes("/rpc/anon_delivery_lookup")) {
      return json(mode === "committed"
        ? { status: "committed", response: { reply: "Записан отговор", replayed: true } }
        : { status: "absent" });
    }
    if (url.includes("/rpc/quota_operation_lookup")) {
      return json(mode === "committed"
        ? { status: "committed", charged: false, result_ref: { contract: { title: "Записан" } } }
        : { status: "absent" });
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const READ_RPCS = ["/rpc/anon_delivery_lookup", "/rpc/quota_operation_lookup"];
const forbidden = (c: Call) =>
  !READ_RPCS.some((r) => c.url.includes(r)) && (
    c.url.includes("ai.gateway") || c.url.includes("stripe") || c.url.includes("/storage/v1/") ||
    c.url.includes("/rpc/") || (c.url.includes("/rest/v1/") && c.method !== "GET" && c.method !== "HEAD") ||
    c.url.includes("/rest/v1/ai_usage") || c.url.includes("/rest/v1/illegal") || c.url.includes("/rest/v1/legal_") ||
    c.url.includes("rate_limit")
  );

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });

const ANON = "../assistant-chat-anon/index.ts";
const BCC = "../build-custom-contract/index.ts";
const ANON_BODY = { request_id: OP_ID, messages: [{ role: "user", content: "Какво е срок за предизвестие?" }] };
const BCC_BODY = { name: "Договор за поддръжка", category: "услуги", operation_id: OP_ID, subject: "Поддръжка на сайт" };

async function run(path: string, body: unknown, mode: Mode, auth = true) {
  const calls: Call[] = [];
  const restore = installFetch(calls, mode, auth);
  try {
    const h = await load(path);
    const res = await h(post({ ...(body as object), ...BODY_FLAGS, enabled: true }, auth));
    return { res, payload: await res.json().catch(() => ({})), calls };
  } finally { restore(); }
}

T("assistant-chat-anon: нов въпрос при OFF → 503, без резервация/лимит/заземяване/модел дори с флагове в тялото", async () => {
  const { res, payload, calls } = await run(ANON, ANON_BODY, "absent", false);
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "assistant_prelaunch_closed");
  assertEquals(payload.free_message_consumed, false);
  assert(!calls.some(forbidden), JSON.stringify(calls));
  assert(!calls.some((c) => c.url.includes("anon_delivery_reserve")));
});

T("assistant-chat-anon: вече доставен отговор се връща точно при OFF", async () => {
  const { res, payload, calls } = await run(ANON, ANON_BODY, "committed", false);
  assertEquals(res.status, 200);
  assertEquals(payload.reply, "Записан отговор");
  assert(!calls.some(forbidden));
});

T("build-custom-contract: нов документ при OFF → 503, без модел/резервация/журнал/лимит", async () => {
  const { res, payload, calls } = await run(BCC, BCC_BODY, "absent");
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "generation_prelaunch_closed");
  assertEquals(payload.charge_state, "not_charged");
  assert(!calls.some(forbidden), JSON.stringify(calls));
});

T("build-custom-contract: записан документ се възпроизвежда при OFF", async () => {
  const { res, payload, calls } = await run(BCC, BCC_BODY, "committed");
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(payload.contract?.title, "Записан");
  assert(!calls.some(forbidden));
});

T("OPTIONS → 2xx без мрежа; build-custom-contract без вход → 401", async () => {
  for (const p of [ANON, BCC]) {
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const r = await (await load(p))(new Request("http://stub.local/fn", { method: "OPTIONS" }));
      assert(r.status < 300, p);
      await r.body?.cancel();
      assertEquals(calls.length, 0, p);
    } finally { restore(); }
  }
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent", false);
  try {
    const r = await (await load(BCC))(post(BCC_BODY, false));
    assertEquals(r.status, 401);
    await r.body?.cancel();
    assert(!calls.some(forbidden));
  } finally { restore(); }
});

T("ред в изходния код: преградата е преди резервация/журнал/ключ/модел", async () => {
  const order = async (f: string, before: string | null, after: string[]) => {
    const s = await Deno.readTextFile(new URL(f, import.meta.url));
    const g = s.indexOf("isNewProcessingOpen(");
    assert(g > 0);
    if (before) assert(s.indexOf(before) < g, `${f}: ${before} before gate`);
    for (const a of after) assert(s.indexOf(a) > g, `${f}: ${a} after gate`);
  };
  await order(ANON, null, ["reserveAnonDelivery(ledger", `Deno.env.get("LOVABLE_API_KEY")`, "checkRateLimitStrict(\n", "ai.gateway.lovable.dev/v1"]);
  await order(BCC, `lookup.status === "committed"`, ["guardIllegalContent({", `Deno.env.get("LOVABLE_API_KEY")`, "reserveQuotaNoCharge(ledgerDb", "ai.gateway.lovable.dev/v1"]);
});
