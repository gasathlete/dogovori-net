// draft-sync и download-document при затворен суров вход. Истински обработчици,
// Deno.serve / std serve прихванати, fetch изцяло подменен — нищо не излиза навън.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;
const USER_ID = "99999999-8888-4777-8666-555555555555";
const DOC_ID = "33333333-4444-4555-8666-777777777777";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
for (const k of Object.values(NEW_PROCESSING_FLAGS)) Deno.env.delete(k);

// std/http serve() вика Deno.serve вътрешно; прихващаме и двете форми.
const cache = new Map<string, Handler>();
async function load(path: string): Promise<Handler> {
  if (cache.has(path)) return cache.get(path)!;
  let h: Handler | null = null;
  const orig = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (a: any, b?: any) => {
    const f = typeof a === "function" ? a : typeof b === "function" ? b : a?.handler;
    h = f;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: { port: 0 } };
  };
  try { await import(path); } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  assert(h, `handler not captured: ${path}`);
  cache.set(path, h!);
  return h!;
}

interface Call { method: string; url: string; body?: string }
const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
function install(calls: Call[]) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
    const u = new URL(url);
    if (u.pathname.startsWith("/auth/v1/user")) return J({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (u.pathname === "/rest/v1/download_quota") return J([{ plan: "free", pro_until: null, contracts_used: 0, templates_used: 0, bonus_contracts: 0 }]);
    if (u.pathname === "/rest/v1/saved_documents" && method === "GET") {
      return J([{ id: DOC_ID, payload: { title: "Записан" }, title: "Записан", kind: "contract", user_id: USER_ID }]);
    }
    if (u.pathname === "/rest/v1/audit_log" && method === "POST") return J([], 201);
    return J({ error: "stub" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}
const writes = (calls: Call[]) =>
  calls.filter((c) => c.url.includes("/rest/v1/") && !["GET", "HEAD"].includes(c.method) &&
    !c.url.includes("/rest/v1/audit_log"));
const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });
const ALL_BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const DRAFT = { flow: "build", route: "/build", step_idx: 2, has_result: true, payload: { answers: { party: "Синтетично ООД" } } };

// ------------------------------------------------ draft-sync
for (const [label, body, auth] of [
  ["анонимно създаване", DRAFT, false],
  ["обновяване с токен", { ...DRAFT, draft_id: DOC_ID, claim_token: "t".repeat(43) }, false],
  ["присвоена чернова (JWT)", { ...DRAFT, draft_id: DOC_ID }, true],
  ["флагове в тялото", { ...DRAFT, ...ALL_BODY_FLAGS }, true],
] as const) {
  T(`draft-sync OFF: ${label} → 503 prelaunch_closed, без запис/rate-limit/auth`, async () => {
    const h = await load("../draft-sync/index.ts");
    const calls: Call[] = [];
    const restore = install(calls);
    try {
      const res = await h(post(body, auth));
      const j = await res.json();
      assertEquals(res.status, 503, JSON.stringify(j));
      assertEquals(j.ok, false);
      assertEquals(j.reason, "prelaunch_closed");
      assertEquals(j.code, "draft_sync_prelaunch_closed");
      assertEquals(calls, [], "никаква мрежа: нито база, нито rate-limit, нито auth");
    } finally { restore(); }
  });
}

T("draft-sync: OPTIONS остава без мрежа", async () => {
  const h = await load("../draft-sync/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
    assertEquals(res.status, 200); await res.body?.cancel();
    assertEquals(calls, []);
  } finally { restore(); }
});

// ------------------------------------------------ download-document
T("download-document OFF: ново съдържание (contract) → 503, без квота/запис", async () => {
  const h = await load("../download-document/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ kind: "contract", title: "Нов", payload: { title: "Нов", sections: [] }, ...ALL_BODY_FLAGS }));
    const j = await res.json().catch(() => ({}));
    assertEquals(res.status, 503, JSON.stringify(j));
    assertEquals(j.code, "content_save_prelaunch_closed");
    assertEquals(writes(calls), []);
    assert(!calls.some((c) => c.url.includes("consume_quota")), "квотата не се докосва");
  } finally { restore(); }
});

T("download-document OFF: вече запазен собствен документ се сваля отново", async () => {
  const h = await load("../download-document/index.ts");
  const calls: Call[] = [];
  const restore = install(calls);
  try {
    const res = await h(post({ kind: "contract", title: "x", payload: {}, saved_document_id: DOC_ID }));
    const j = await res.json();
    assertEquals(res.status, 200, JSON.stringify(j));
    assertEquals(j.ok, true);
    assertEquals(j.payload, { title: "Записан" });
    assertEquals(writes(calls), []);
  } finally { restore(); }
});
