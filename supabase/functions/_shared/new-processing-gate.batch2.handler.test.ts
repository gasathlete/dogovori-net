// Втори пакет: download-blank и create-team. Истинските обработчици,
// Deno.serve прихванат, fetch изцяло подменен — нищо не излиза навън.
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
  try { await import(path); } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  assert(h, `handler not captured: ${path}`);
  cache.set(path, h!);
  return h!;
}

interface Call { method: string; url: string }
const BUCKET = "document-blanks";
const PATH = `u/${USER_ID}/blank.docx`;

function installFetch(calls: Call[], mode: "absent" | "committed") {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  let digest = "";
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (url.includes("/rpc/quota_operation_lookup")) {
      try { digest = JSON.parse(body).p_request_digest ?? ""; } catch { /* */ }
      return json(mode === "committed"
        ? { status: "committed", charged: true, source: "pro",
            result_ref: { bucket: BUCKET, path: PATH, filename: "blank.docx", citations: [] } }
        : { status: "absent" });
    }
    if (url.includes("/rpc/storage_artifact_lookup")) {
      return json({ found: true, ready: true, user_id: USER_ID, purpose: "download_blank",
        request_digest: digest, bucket: BUCKET, path: PATH });
    }
    if (url.includes(`/storage/v1/object/list/${BUCKET}`)) return json([{ name: "blank.docx" }]);
    if (url.includes(`/storage/v1/object/sign/${BUCKET}`)) return json({ signedURL: `/object/sign/${BUCKET}/${PATH}?token=t` });
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const READ_RPCS = ["/rpc/quota_operation_lookup", "/rpc/storage_artifact_lookup"];
const isForbidden = (c: Call) =>
  !READ_RPCS.some((r) => c.url.includes(r)) &&
  !c.url.includes("/auth/v1/") &&
  !c.url.includes("/storage/v1/object/list/") &&
  !c.url.includes("/storage/v1/object/sign/") && (
    c.url.includes("stripe.com") ||
    c.url.includes("ai.gateway") ||
    c.url.includes("/rpc/") ||
    c.url.includes("/storage/v1/") ||
    (c.url.includes("/rest/v1/") && c.method !== "GET")
  );

const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });

// Опит да се „включи“ флаг от тялото — трябва да бъде игнориран.
const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));

const BLANK = {
  sector_id: "nedvizhimi-imoti",
  document_name: "Договор за наем",
  sector_title: "Недвижими имоти",
  operation_id: OP_ID,
};

T("download-blank: OFF + нова операция → 503, без модел/резервация/storage", async () => {
  const h = await load("../download-blank/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const res = await h(post({ ...BLANK, ...BODY_FLAGS, enabled: true }));
    assertEquals(res.status, 503);
    const j = await res.json();
    assertEquals(j.code, "blank_prelaunch_closed");
    assertEquals(j.charge_state, "not_charged");
    assertEquals(calls.filter(isForbidden), []);
    assert(!calls.some((c) => c.url.includes("/rpc/quota_reserve")));
  } finally { restore(); }
});

T("download-blank: OFF + вече завършена операция → възпроизвеждане", async () => {
  const h = await load("../download-blank/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "committed");
  try {
    const res = await h(post(BLANK));
    const j = await res.json();
    assertEquals(res.status, 200, JSON.stringify(j));
    assertEquals(j.replay, true);
    assertEquals(j.charge_state, "charged");
    assertEquals(calls.filter(isForbidden), []);
  } finally { restore(); }
});

T("download-blank: OPTIONS и 401 без auth", async () => {
  const h = await load("../download-blank/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assert(o.status < 300); await o.body?.cancel();
    const r = await h(post(BLANK, false));
    assertEquals(r.status, 401); await r.body?.cancel();
    assertEquals(calls.length, 0);
  } finally { restore(); }
});

T("create-team: OFF → 503 преди запис на екип и Stripe", async () => {
  const h = await load("../create-team/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const res = await h(post({ name: "Екип", seats: 3, billing: "yearly", returnUrl: "https://x/r",
      environment: "live", ...BODY_FLAGS }));
    assertEquals(res.status, 503);
    assertEquals((await res.json()).code, "checkout_prelaunch_closed");
    assertEquals(calls.filter(isForbidden), []);
    assert(!calls.some((c) => c.url.includes("/rest/v1/")));
  } finally { restore(); }
});

T("create-team: OPTIONS и 401 без auth", async () => {
  const h = await load("../create-team/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assert(o.status < 300); await o.body?.cancel();
    const r = await h(post({}, false));
    assertEquals(r.status, 401); await r.body?.cancel();
    assertEquals(calls.length, 0);
  } finally { restore(); }
});

T("top-up през create-checkout: OFF → 503 дори с флаг в тялото", async () => {
  const h = await load("../create-checkout/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "absent");
  try {
    const res = await h(post({ priceId: "topup_10", returnUrl: "https://x/r", environment: "live", ...BODY_FLAGS }));
    assertEquals(res.status, 503);
    assertEquals((await res.json()).code, "checkout_prelaunch_closed");
    assertEquals(calls.filter(isForbidden), []);
  } finally { restore(); }
});
