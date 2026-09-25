// generate-job: истински обработчик (Deno.serve прихванат), fetch изцяло
// подменен с малък PostgREST емулатор върху синтетични редове. Без мрежа.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";
import { generationJobServerKey } from "./generation-job-auth.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;

const OWNER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const JOB_DONE = "10000000-0000-4000-8000-000000000001";
const JOB_RUN = "10000000-0000-4000-8000-000000000002";
const JOB_FOREIGN = "10000000-0000-4000-8000-000000000003";
const JOB_ANON = "10000000-0000-4000-8000-000000000004";
const JOB_STALE = "10000000-0000-4000-8000-000000000005";
const TOKENS: Record<string, string> = { "tok-owner": OWNER, "tok-other": OTHER };
const ANON_KEY = "stub-anon-public";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
for (const k of Object.values(NEW_PROCESSING_FLAGS)) Deno.env.delete(k);

let handler: Handler | null = null;
async function load(): Promise<Handler> {
  if (handler) return handler;
  const orig = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (x: any) => {
    handler = typeof x === "function" ? x : x?.handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
  };
  try { await import("../generate-job/index.ts"); } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  assert(handler);
  return handler!;
}

type Row = Record<string, unknown>;
interface Call { method: string; url: string; body?: string }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const PAYLOAD = { sector: "услуги", contractName: "Договор за услуги", answers: { q1: "поддръжка" }, operation_id: "op-1" };
const CKEY = "client-key-000001";
const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function seed(): Promise<Row[]> {
  const kOwner = await generationJobServerKey(OWNER, PAYLOAD, CKEY);
  return [
    { id: JOB_DONE, user_id: OWNER, status: "done", result: { contract: { title: "Готов" } }, error: null, error_code: null, http_status: null, created_at: OLD, idempotency_key: kOwner },
    { id: JOB_RUN, user_id: OWNER, status: "running", result: null, error: null, error_code: null, http_status: null, created_at: new Date().toISOString(), idempotency_key: "legacy-key-1" },
    { id: JOB_FOREIGN, user_id: OTHER, status: "done", result: { contract: { title: "ЧУЖД" } }, error: null, error_code: null, http_status: null, created_at: OLD, idempotency_key: CKEY },
    { id: JOB_ANON, user_id: null, status: "done", result: { contract: { title: "АНОНИМЕН" } }, error: null, error_code: null, http_status: null, created_at: OLD, idempotency_key: "anon-legacy-1" },
    { id: JOB_STALE, user_id: OWNER, status: "running", result: null, error: null, error_code: null, http_status: null, created_at: OLD, idempotency_key: "legacy-stale-1" },
  ];
}

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) { if (String(row[k]) !== v.slice(3)) return false; }
    else if (v.startsWith("in.(")) {
      const list = v.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, ""));
      if (!list.includes(String(row[k]))) return false;
    } else if (v.startsWith("gte.")) { if (String(row[k]) < v.slice(4)) return false; }
    else return false; // непознат филтър → нищо (fail closed в теста)
  }
  return true;
}

interface Env { rows: Row[]; calls: Call[]; dupOnInsert?: boolean; upstream?: number }
function installFetch(env: Env) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : undefined;
    env.calls.push({ method, url, body });
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") {
      const tok = (headers.get("Authorization") ?? "").replace("Bearer ", "");
      const id = TOKENS[tok];
      return id ? json({ id, aud: "authenticated" }) : json({ msg: "invalid JWT" }, 401);
    }
    if (u.pathname === "/functions/v1/generate-contract") {
      env.upstream = (env.upstream ?? 0) + 1;
      return json({ contract: { title: "Нов" } });
    }
    if (u.pathname === "/rest/v1/generation_jobs") {
      const wantsObject = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
      if (method === "GET") {
        const found = env.rows.filter((r) => matches(r, u.searchParams))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const lim = Number(u.searchParams.get("limit") ?? "1000");
        const out = found.slice(0, lim);
        if (wantsObject) return out.length === 1 ? json(out[0]) : json({ code: "PGRST116", message: "0 rows" }, 406);
        return json(out);
      }
      if (method === "POST") {
        const ins = JSON.parse(body ?? "{}");
        const rec = Array.isArray(ins) ? ins[0] : ins;
        const clash = env.dupOnInsert || env.rows.some((r) => r.idempotency_key === rec.idempotency_key && ["running", "done"].includes(String(r.status)));
        if (clash) return json({ code: "23505", message: "duplicate key value violates unique constraint" }, 409);
        const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), result: null, error: null, error_code: null, http_status: null, ...rec };
        env.rows.push(row);
        return wantsObject ? json({ id: row.id }, 201) : json([{ id: row.id }], 201);
      }
      if (method === "PATCH") {
        const patch = JSON.parse(body ?? "{}");
        for (const r of env.rows) if (matches(r, u.searchParams)) Object.assign(r, patch);
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
function post(body: unknown, auth?: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (auth !== null && auth !== undefined) h.Authorization = auth;
  return new Request("http://stub.local/generate-job", { method: "POST", headers: h, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const isWrite = (c: Call) => c.url.includes("/rest/v1/") && c.method !== "GET" && c.method !== "HEAD";

async function call(body: unknown, auth: string | null, envOver: Partial<Env> = {}) {
  const env: Env = { rows: await seed(), calls: [], ...envOver };
  const restore = installFetch(env);
  try {
    const h = await load();
    const res = await h(post(body, auth));
    const payload = await res.json().catch(() => ({}));
    // даваме шанс на евентуален фонов task да приключи, преди да върнем fetch
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
    return { res, payload, env };
  } finally { restore(); }
}

T("status: собствен готов job → резултат, само четене", async () => {
  const { res, payload, env } = await call({ action: "status", job_id: JOB_DONE }, "Bearer tok-owner");
  assertEquals(res.status, 200);
  assertEquals(payload.status, "completed");
  assertEquals(payload.result.contract.title, "Готов");
  assert(!env.calls.some(isWrite));
  const q = env.calls.find((c) => c.url.includes("/rest/v1/generation_jobs"))!;
  assert(q.url.includes(`user_id=eq.${OWNER}`) && q.url.includes(`id=eq.${JOB_DONE}`), q.url);
});

T("status: собствен running job → running; стар running → job_timeout БЕЗ запис", async () => {
  const a = await call({ action: "status", job_id: JOB_RUN }, "Bearer tok-owner");
  assertEquals(a.payload.status, "running");
  const b = await call({ action: "status", job_id: JOB_STALE }, "Bearer tok-owner");
  assertEquals(b.payload.status, "error");
  assertEquals(b.payload.code, "job_timeout");
  assert(!b.env.calls.some(isWrite), JSON.stringify(b.env.calls));
  assertEquals(b.env.rows.find((r) => r.id === JOB_STALE)!.status, "running");
});

T("status: чужд job → 404 без резултат/запис", async () => {
  const { res, payload, env } = await call({ action: "status", job_id: JOB_FOREIGN }, "Bearer tok-owner");
  assertEquals(res.status, 404);
  assertEquals(payload.result, undefined);
  assert(!JSON.stringify(payload).includes("ЧУЖД"));
  assert(!env.calls.some(isWrite));
});

T("status: липсващ job → 404", async () => {
  const { res } = await call({ action: "status", job_id: "10000000-0000-4000-8000-0000000000ff" }, "Bearer tok-owner");
  assertEquals(res.status, 404);
});

T("status: невалиден Bearer → 401, без понижаване до анонимен и без четене на редове", async () => {
  for (const auth of ["Bearer forged", "Basic x", "Bearer"]) {
    const { res, payload, env } = await call({ action: "status", job_id: JOB_DONE }, auth);
    assertEquals(res.status, 401, auth);
    assertEquals(payload.result, undefined);
    assert(!env.calls.some((c) => c.url.includes("/rest/v1/")), auth);
  }
});

T("status: анонимен (без header или с anon ключа) → 401, стари анонимни задачи не се разкриват", async () => {
  for (const auth of [null, `Bearer ${ANON_KEY}`]) {
    const { res, payload, env } = await call({ action: "status", job_id: JOB_ANON, user_id: null }, auth);
    assertEquals(res.status, 401);
    assert(!JSON.stringify(payload).includes("АНОНИМЕН"));
    assert(!env.calls.some((c) => c.url.includes("/rest/v1/")));
  }
});

T("status: подаден user_id в тялото не дава достъп", async () => {
  const { res } = await call({ action: "status", job_id: JOB_FOREIGN, user_id: OTHER }, "Bearer tok-owner");
  assertEquals(res.status, 404);
});

T("start OFF: точно собствено възпроизвеждане на готов job (флагове в тялото не влияят)", async () => {
  const { res, payload, env } = await call({ action: "start", payload: PAYLOAD, idempotency_key: CKEY, ...BODY_FLAGS }, "Bearer tok-owner");
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(payload.job_id, JOB_DONE);
  assertEquals(payload.reused, true);
  assert(!env.calls.some(isWrite));
  assertEquals(env.upstream, undefined);
});

T("start OFF: същият клиентски ключ от друг собственик → не вижда чуждия job; 503 без запис/препращане", async () => {
  const { res, payload, env } = await call({ action: "start", payload: PAYLOAD, idempotency_key: CKEY }, "Bearer tok-other");
  assertEquals(res.status, 503);
  assertEquals(payload.code, "generation_prelaunch_closed");
  assert(!JSON.stringify(payload).includes("Готов"));
  assert(!env.calls.some(isWrite));
  assertEquals(env.upstream, undefined);
  const q = env.calls.find((c) => c.url.includes("/rest/v1/generation_jobs"))!;
  assert(q.url.includes(`user_id=eq.${OTHER}`));
  assert(!q.url.includes(`idempotency_key=eq.${CKEY}`), "суровият клиентски ключ не се използва");
});

T("start OFF: същият ключ, различен payload → различен сървърен ключ, 503 без мутация", async () => {
  const other = { ...PAYLOAD, answers: { q1: "друго" } };
  assertNotEquals(await generationJobServerKey(OWNER, other, CKEY), await generationJobServerKey(OWNER, PAYLOAD, CKEY));
  const { res, env } = await call({ action: "start", payload: other, idempotency_key: CKEY }, "Bearer tok-owner");
  assertEquals(res.status, 503);
  assert(!env.calls.some(isWrite));
  assertEquals(env.upstream, undefined);
});

T("start OFF: анонимен нов старт → 503, без четене/запис/препращане", async () => {
  const { res, env } = await call({ action: "start", payload: PAYLOAD, idempotency_key: CKEY }, null);
  assertEquals(res.status, 503);
  assertEquals(env.calls.length, 0);
});

T("start: невалиден Bearer → 401 без запис", async () => {
  const { res, env } = await call({ action: "start", payload: PAYLOAD, idempotency_key: CKEY }, "Bearer forged");
  assertEquals(res.status, 401);
  assert(!env.calls.some((c) => c.url.includes("/rest/v1/")));
});

T("неправилни действия/тела/ключове → 400 без мрежа", async () => {
  const bad: unknown[] = [
    "not json", [], {}, { action: "delete", job_id: JOB_DONE }, { action: "status" },
    { action: "status", job_id: "x" }, { action: "start", idempotency_key: CKEY },
    { action: "start", payload: [], idempotency_key: CKEY }, { action: "start", payload: PAYLOAD },
    { action: "start", payload: PAYLOAD, idempotency_key: "bad key!" }, { payload: PAYLOAD, idempotency_key: CKEY },
  ];
  for (const b of bad) {
    const { res, env } = await call(b, "Bearer tok-owner");
    assertEquals(res.status, 400, JSON.stringify(b));
    assertEquals(env.calls.length, 0, JSON.stringify(b));
  }
});

T("OPTIONS → 2xx без мрежа", async () => {
  const env: Env = { rows: [], calls: [] };
  const restore = installFetch(env);
  try {
    const r = await (await load())(new Request("http://stub.local/generate-job", { method: "OPTIONS" }));
    assert(r.status < 300);
    await r.body?.cancel();
    assertEquals(env.calls.length, 0);
  } finally { restore(); }
});

T("start ON: нов собствен старт записва обвързан ключ и user_id; фонът препраща", async () => {
  Deno.env.set(NEW_PROCESSING_FLAGS.generate_contract, "true");
  try {
    const p2 = { ...PAYLOAD, answers: { q1: "нов" } };
    const { res, payload, env } = await call({ action: "start", payload: p2, idempotency_key: CKEY }, "Bearer tok-owner");
    assertEquals(res.status, 202, JSON.stringify(payload));
    const row = env.rows.find((r) => r.id === payload.job_id)!;
    assertEquals(row.user_id, OWNER);
    assertEquals(row.idempotency_key, await generationJobServerKey(OWNER, p2, CKEY));
    assertEquals(env.upstream, 1);
    assertEquals(row.status, "done");
  } finally { Deno.env.delete(NEW_PROCESSING_FLAGS.generate_contract); }
});

T("start ON: състезание (23505) → връща собствения победител, търсенето е по собственик", async () => {
  Deno.env.set(NEW_PROCESSING_FLAGS.generate_contract, "true");
  try {
    const p3 = { ...PAYLOAD, answers: { q1: "race" } };
    const k = await generationJobServerKey(OWNER, p3, CKEY);
    const env: Env = { rows: [], calls: [], dupOnInsert: true };
    const restore = installFetch(env);
    try {
      const h = await load();
      // Първото търсене не намира нищо; победителят се появява преди INSERT.
      const origFetch = globalThis.fetch;
      let seen = 0;
      globalThis.fetch = (async (i: string | URL | Request, init?: RequestInit) => {
        const u = typeof i === "string" ? i : i instanceof URL ? i.href : i.url;
        if (u.includes("/rest/v1/generation_jobs") && (init?.method ?? "GET") === "GET" && ++seen === 2) {
          env.rows.push({ id: JOB_RUN, user_id: OWNER, status: "running", result: null, error: null, error_code: null, http_status: null, created_at: new Date(Date.now() - 1000).toISOString(), idempotency_key: k });
          env.rows.push({ id: JOB_FOREIGN, user_id: OTHER, status: "running", result: null, error: null, error_code: null, http_status: null, created_at: new Date().toISOString(), idempotency_key: k });
        }
        return origFetch(i, init);
      }) as typeof fetch;
      const res = await h(post({ action: "start", payload: p3, idempotency_key: CKEY }, "Bearer tok-owner"));
      const body = await res.json();
      globalThis.fetch = origFetch;
      assertEquals(body.job_id, JOB_RUN);
      assertEquals(body.reused, true);
      assertEquals(env.upstream, undefined);
    } finally { restore(); }
  } finally { Deno.env.delete(NEW_PROCESSING_FLAGS.generate_contract); }
});
