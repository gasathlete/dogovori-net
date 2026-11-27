// Пети пакет: generate-linked-document и generate-contract — истински
// обработчици (Deno.serve прихванат, fetch изцяло подменен).
// negotiation-strategy — OPTIONS/401 по време на изпълнение; преградата само
// по реда в изходния код (изисква анализ с доказателства и текущи правни
// източници; не е надеждно stub-нат тук).
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
    if (url.includes("/rpc/ai_document_operation_lookup")) {
      return json(mode === "committed" ? { status: "committed", result: { title: "Записан", replayed: true } } : { status: "absent" });
    }
    if (url.includes("/rpc/quota_operation_lookup")) {
      return json(mode === "committed"
        ? { status: "committed", charged: true, result_ref: { contract: { title: "Записан" }, replayed: true } }
        : { status: "absent" });
    }
    if (url.includes("/rpc/anon_delivery_lookup")) return json({ status: "absent" });
    // generate-contract: дневният лимит (само четене) стои преди преградата.
    if (url.includes("/rest/v1/ai_usage") && (method === "GET" || method === "HEAD")) {
      return new Response(null, { status: 200, headers: { "content-range": "0-0/0" } });
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const READ_RPCS = ["/rpc/ai_document_operation_lookup", "/rpc/quota_operation_lookup", "/rpc/anon_delivery_lookup"];
const forbidden = (c: Call) =>
  !READ_RPCS.some((r) => c.url.includes(r)) && (
    c.url.includes("ai.gateway") || c.url.includes("stripe") || c.url.includes("/storage/v1/") ||
    c.url.includes("/rpc/") || (c.url.includes("/rest/v1/") && c.method !== "GET" && c.method !== "HEAD") ||
    c.url.includes("/rest/v1/illegal") || c.url.includes("/rest/v1/legal_")
  );

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });

const GLD = "../generate-linked-document/index.ts";
const GC = "../generate-contract/index.ts";
const NS = "../negotiation-strategy/index.ts";
const GLD_BODY = {
  kind: "appendix", operation_id: OP_ID, parent_slug: "uslugi", number: "1", notes: "Срок",
  parent_contract: { title: "Договор за услуги", clauses: [{ number: "1", title: "Предмет", body: "Поддръжка." }] },
};
const GC_BODY = {
  sector: "услуги", contractName: "Договор за услуги", documentName: "Договор за услуги",
  parties: {}, answers: { q1: "поддръжка" }, questions: [{ id: "q1", label: "Предмет" }],
  operation_id: OP_ID, userConfirmed: true,
};

async function run(path: string, body: unknown, mode: Mode, auth = true) {
  const calls: Call[] = [];
  const restore = installFetch(calls, mode, auth);
  try {
    const h = await load(path);
    const res = await h(post({ ...(body as object), ...BODY_FLAGS }, auth));
    return { res, payload: await res.json().catch(() => ({})), calls };
  } finally { restore(); }
}

T("generate-linked-document: нов документ при OFF → 503, без модел/резервация/лимит/запис дори с флагове в тялото", async () => {
  const { res, payload, calls } = await run(GLD, GLD_BODY, "absent");
  assertEquals(res.status, 503);
  assertEquals(payload.code, "generation_prelaunch_closed");
  assertEquals(payload.charge_state, "not_charged");
  assert(!calls.some(forbidden), JSON.stringify(calls));
  assert(!calls.some((c) => c.url.includes("/rest/v1/ai_usage")), "rate-limit read must be after gate");
});

T("generate-linked-document: записан резултат се възпроизвежда при OFF", async () => {
  const { res, payload, calls } = await run(GLD, GLD_BODY, "committed");
  assertEquals(res.status, 200);
  assertEquals(payload.title, "Записан");
  assert(!calls.some(forbidden));
});

T("generate-contract (вписан): нов документ при OFF → 503, без модел/резервация/запис", async () => {
  const { res, payload, calls } = await run(GC, GC_BODY, "absent");
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "generation_prelaunch_closed");
  assert(!calls.some(forbidden), JSON.stringify(calls));
});

T("generate-contract (вписан): записан резултат се възпроизвежда при OFF", async () => {
  const { res, payload, calls } = await run(GC, GC_BODY, "committed");
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(res.headers.get("X-Operation-Replay"), "true");
  assertEquals(payload.contract?.title, "Записан");
  assert(!calls.some(forbidden));
});

T("generate-contract (анонимен): изисква вход → 401, без anon резервация/модел", async () => {
  const { res, payload, calls } = await run(GC, GC_BODY, "absent", false);
  assertEquals(res.status, 401, JSON.stringify(payload));
  assertEquals(payload.error, "auth_required");
  assertEquals(payload.message, "Влезте в профила си, за да изготвите документ.");
  assert(!calls.some(forbidden), JSON.stringify(calls));
});

T("OPTIONS → 2xx без мрежа; 401 без вход (linked, negotiation)", async () => {
  for (const p of [GLD, GC, NS]) {
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const h = await load(p);
      const r = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
      assert(r.status < 300, p);
      await r.body?.cancel();
      assertEquals(calls.length, 0, p);
    } finally { restore(); }
  }
  for (const p of [GLD, NS]) {
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent", false);
    try {
      const h = await load(p);
      const r = await h(post({ analysis_id: OP_ID, ...GLD_BODY }, false));
      assertEquals(r.status, 401, p);
      await r.body?.cancel();
      assert(!calls.some(forbidden), p);
    } finally { restore(); }
  }
});

T("ред в изходния код: преградата е след възпроизвеждането и преди ключ/лимит/резервация/модел", async () => {
  const order = async (f: string, before: string, after: string[]) => {
    const s = await Deno.readTextFile(new URL(f, import.meta.url));
    const g = s.indexOf(`isNewProcessingOpen(`);
    assert(g > 0 && s.indexOf(before) < g, `${f}: replay before gate`);
    for (const a of after) { const i = s.indexOf(a, 0); assert(i > g, `${f}: ${a} after gate`); }
  };
  await order(NS, `existing.kind === "committed"`, [`Deno.env.get("LOVABLE_API_KEY")`, "reserveDocumentOperation(ledger", "GATEWAY_URL, "]);
  await order(GLD, `existing.kind === "committed"`, [`.eq("function_name", "generate-linked-document")`, "reserveDocumentOperation(ledger", "ai.gateway.lovable.dev/v1"]);
  await order(GC, `anonLookup.status === "committed"`, ["guardIllegalContent({", "reserveAnonDelivery(ledgerDb", "reserveQuota(ledgerDb", "ai.gateway.lovable.dev/v1"]);
});
