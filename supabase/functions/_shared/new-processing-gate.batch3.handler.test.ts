// Трети пакет: team-update-seats (увеличение), analyze-contract (нов анализ),
// review-document (ред на преградата). Истински обработчици, Deno.serve
// прихванат, fetch изцяло подменен — нищо не излиза навън.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

type Handler = (req: Request) => Promise<Response> | Response;
const USER_ID = "99999999-8888-4777-8666-555555555555";
const TEAM_ID = "22222222-3333-4444-8555-666666666666";
const CONTRACT_ID = "33333333-4444-4555-8666-777777777777";
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
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...extra } });

const isStripe = (c: Call) => c.url.includes("stripe");
const isAi = (c: Call) => c.url.includes("ai.gateway");
const isRestWrite = (c: Call) => c.url.includes("/rest/v1/") && !c.url.includes("/rpc/") && !["GET", "HEAD"].includes(c.method);

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });

// ---------------------------------------------------------------- seats
function installSeatsFetch(calls: Call[], seatCount: number | null) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (url.includes("/rpc/is_team_admin")) return json(true);
    if (url.includes("/rest/v1/teams") && method === "GET") {
      return json([{ id: TEAM_ID, seat_count: seatCount, stripe_subscription_id: "sub_stub", environment: "live" }]);
    }
    if (url.includes("/rest/v1/team_members")) return new Response(null, { status: 200, headers: { "Content-Range": "0-1/2" } });
    if (url.includes("/rest/v1/teams") && method === "PATCH") return json([{ id: TEAM_ID }]);
    if (url.includes("/rest/v1/team_audit_log")) return json(null, 201);
    if (isStripe({ method, url }) && url.includes("/subscriptions/sub_stub")) {
      return json({ id: "sub_stub", object: "subscription", items: { object: "list", data: [{ id: "si_stub" }] } });
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

T("team-update-seats: OFF + увеличение → 503, без Stripe и без запис", async () => {
  const h = await load("../team-update-seats/index.ts");
  const calls: Call[] = [];
  const restore = installSeatsFetch(calls, 3);
  try {
    const res = await h(post({ teamId: TEAM_ID, seats: 5, environment: "live", ...BODY_FLAGS, enabled: true }));
    assertEquals(res.status, 503);
    const j = await res.json();
    assertEquals(j.code, "seat_increase_prelaunch_closed");
    assertEquals(j.charge_state, "not_charged");
    assertEquals(calls.filter(isStripe), []);
    assertEquals(calls.filter(isRestWrite), []);
  } finally { restore(); }
});

T("team-update-seats: OFF + непознат текущ брой → третира се като увеличение", async () => {
  const h = await load("../team-update-seats/index.ts");
  const calls: Call[] = [];
  const restore = installSeatsFetch(calls, null);
  try {
    const res = await h(post({ teamId: TEAM_ID, seats: 3, environment: "live" }));
    assertEquals(res.status, 503); await res.body?.cancel();
    assertEquals(calls.filter(isStripe), []);
    assertEquals(calls.filter(isRestWrite), []);
  } finally { restore(); }
});

T("team-update-seats: OFF + намаление → остава достъпно", async () => {
  const h = await load("../team-update-seats/index.ts");
  const calls: Call[] = [];
  const restore = installSeatsFetch(calls, 5);
  try {
    const res = await h(post({ teamId: TEAM_ID, seats: 3, environment: "live" }));
    const j = await res.json();
    assertEquals(res.status, 200, JSON.stringify(j));
    assertEquals(j.ok, true);
    assert(calls.some(isStripe), "намалението трябва да стигне до абонамента");
  } finally { restore(); }
});

T("team-update-seats: OFF + същия брой → не е блокирано", async () => {
  const h = await load("../team-update-seats/index.ts");
  const calls: Call[] = [];
  const restore = installSeatsFetch(calls, 4);
  try {
    const res = await h(post({ teamId: TEAM_ID, seats: 4, environment: "live" }));
    assertEquals(res.status, 200); await res.body?.cancel();
  } finally { restore(); }
});

T("team-update-seats: OPTIONS и без auth не стигат до Stripe", async () => {
  const h = await load("../team-update-seats/index.ts");
  const calls: Call[] = [];
  const restore = installSeatsFetch(calls, 3);
  try {
    const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assert(o.status < 300); await o.body?.cancel();
    const r = await h(post({ teamId: TEAM_ID, seats: 5, environment: "live" }, false));
    assert(r.status >= 400); await r.body?.cancel();
    assertEquals(calls.length, 0);
  } finally { restore(); }
});

// ---------------------------------------------------------------- analyze
const CONTRACT_TEXT = ("Страните се договарят за предоставяне на услуги по поддръжка на сайт. " +
  "Възнаграждението се заплаща ежемесечно по банков път след издаване на фактура. ").repeat(3);

function installAnalyzeFetch(calls: Call[], mode: "absent" | "committed") {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (url.includes("/rest/v1/uploaded_contracts") && method === "GET") {
      return json([{ id: CONTRACT_ID, user_id: USER_ID, title: "Договор за услуги", extracted_text: CONTRACT_TEXT, text_hash: null }]);
    }
    if (url.includes("/rpc/quota_operation_lookup")) {
      return json(mode === "committed"
        ? { status: "committed", charged: true, result_ref: { analysis: { id: "a1", user_id: USER_ID }, replayed: true } }
        : { status: "absent" });
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}
const ANALYZE = { uploadedContractId: CONTRACT_ID, operation_id: OP_ID };
const analyzeForbidden = (c: Call) =>
  isAi(c) || isStripe(c) || isRestWrite(c) || c.url.includes("/storage/v1/") ||
  (c.url.includes("/rpc/") && !c.url.includes("/rpc/quota_operation_lookup"));

T("analyze-contract: OFF + нов анализ → 503, без модел/резервация/журнал", async () => {
  const h = await load("../analyze-contract/index.ts");
  const calls: Call[] = [];
  const restore = installAnalyzeFetch(calls, "absent");
  try {
    const res = await h(post({ ...ANALYZE, ...BODY_FLAGS, enabled: true }));
    const j = await res.json();
    assertEquals(res.status, 503, JSON.stringify(j));
    assertEquals(j.code, "analysis_prelaunch_closed");
    assertEquals(j.charge_state, "not_charged");
    assertEquals(calls.filter(analyzeForbidden), []);
  } finally { restore(); }
});

T("analyze-contract: OFF + вече завършен анализ → точно възпроизвеждане", async () => {
  const h = await load("../analyze-contract/index.ts");
  const calls: Call[] = [];
  const restore = installAnalyzeFetch(calls, "committed");
  try {
    const res = await h(post(ANALYZE));
    const j = await res.json();
    assertEquals(res.status, 200, JSON.stringify(j));
    assertEquals(res.headers.get("X-Operation-Replay"), "true");
    assertEquals(j.analysis.id, "a1");
    assertEquals(calls.filter(analyzeForbidden), []);
  } finally { restore(); }
});

T("analyze-contract: OPTIONS и 401 без auth", async () => {
  const h = await load("../analyze-contract/index.ts");
  const calls: Call[] = [];
  const restore = installAnalyzeFetch(calls, "absent");
  try {
    const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assert(o.status < 300); await o.body?.cancel();
    const r = await h(post(ANALYZE, false));
    assertEquals(r.status, 401); await r.body?.cancel();
    assertEquals(calls.filter(analyzeForbidden), []);
  } finally { restore(); }
});

// ---------------------------------------------------------------- review (ред)
T("review-document: преградата е след двете възпроизвеждания и преди всяка странична стъпка", async () => {
  const src = await Deno.readTextFile(new URL("../review-document/index.ts", import.meta.url));
  const gate = src.indexOf('isNewProcessingOpen("review_document")');
  assert(gate > 0, "липсва преграда");
  const after = (needle: string) => {
    const i = src.indexOf(needle);
    assert(i > 0, `липсва ${needle}`);
    return i;
  };
  assert(after("lookupReviewOperation(admin, grantPayload)") < gate);
  assert(after("lookupOwnedReviewOperation(admin, ownedBinding)") < gate);
  for (const later of ["restrictedIdentifierBlock(scanBody", "checkRateLimitStrict", "retrieveLegalContext", "LOVABLE_API_KEY"]) {
    const i = src.indexOf(later, 0);
    assert(i > gate, `${later} трябва да е след преградата`);
  }
  assert(!/rawBody[^\n]*REVIEW_DOCUMENT_NEW_PROCESSING_ENABLED/.test(src));
});
