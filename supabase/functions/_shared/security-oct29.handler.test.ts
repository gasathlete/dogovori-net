// Real Edge handlers, synthetic identities/in-memory rows, fetch fully mocked.
// No hosted data, provider requests, emails, deployment flags or secrets used.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Handler = (req: Request) => Response | Promise<Response>;
const handlers = new Map<string, Handler>();
const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";
const SESSION = "cccccccc-0000-4000-8000-000000000003";
const ENVELOPE = "dddddddd-0000-4000-8000-000000000004";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
async function load(path: string) {
  const cached = handlers.get(path); if (cached) return cached;
  let captured: Handler | undefined;
  const original = Deno.serve;
  Object.defineProperty(Deno, "serve", { configurable: true, value: (handler: Handler) => { captured = handler; return {}; } });
  try { await import(path); } finally { Object.defineProperty(Deno, "serve", { configurable: true, value: original }); }
  if (!captured) throw new Error("Handler not captured");
  handlers.set(path, captured); return captured;
}
const test = (name: string, fn: () => Promise<void>) => Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
async function run(path: string, body: unknown, mock: typeof fetch, user = OWNER, ip = "192.0.2.1") {
  const original = fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "PAGEVIEW_HASH_SALT"];
  const previous = keys.map(key => Deno.env.get(key));
  for (const [key, value] of Object.entries({ SUPABASE_URL: "http://fixture.local", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key", SUPABASE_ANON_KEY: "synthetic-anon", PAGEVIEW_HASH_SALT: "fixture" })) Deno.env.set(key, value);
  globalThis.fetch = mock;
  try {
    const handler = await load(path);
    const response = await handler(new Request("http://fixture.local/function", { method: "POST", headers: {
      "Content-Type": "application/json", "User-Agent": "fixture", "x-forwarded-for": ip,
      ...(user ? { Authorization: `Bearer ${user}` } : {}),
    }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, index) => { const value = previous[index]; if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); });
  }
}
type Call = { url: URL; method: string; body: any };
// The cap is enforced by one atomic DB operation; this mock models its contract
// (per-owner rolling count, all-or-nothing insert) so handler mapping is tested.
function signingMock(count: number, owner: string, fail = "") {
  const calls: Call[] = [];
  const mock: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url.pathname === "/auth/v1/user") return json({ id: owner, email: "owner@example.test" });
    if (url.pathname.endsWith("download_quota")) return json({ plan: "pro", free_signing_used: true });
    if (url.pathname.endsWith("/rpc/create_signing_envelope_capped")) {
      if (fail === "rpc") return json({ message: "synthetic failure" }, 500);
      assertEquals(body.p_owner, owner); assertEquals(body.p_limit, 50);
      const recent = owner === OWNER ? count : 0;
      if (recent + body.p_signers.length > body.p_limit) return json({ ok: false, error: "daily_invite_limit", recent });
      return json({ ok: true, request: { id: ENVELOPE, title: body.p_request.title, expires_at: body.p_request.expires_at }, signers: [] });
    }
    if (url.pathname.endsWith("signing_requests") || url.pathname.endsWith("signing_request_signers")) throw new Error("Direct non-atomic signing write");
    if (url.pathname.endsWith("signing_audit_events")) return json(null, 201);
    if (url.pathname.endsWith("profiles")) return json({ display_name: "Тест" });
    throw new Error(`Unexpected test dependency: ${url.pathname}`);
  };
  return { mock, calls };
}
const rpcCall = (calls: Call[]) => calls.find(call => call.url.pathname.endsWith("/rpc/create_signing_envelope_capped"));
const signingBody = { title: "Синтетичен документ", document_snapshot: { text: "Локален тест" }, signers: [{ name: "Тест", email: "signer@example.test" }] };
test("signing: 49 existing + 1 passes at exactly 50 via one atomic operation", async () => {
  const { mock, calls } = signingMock(49, OWNER);
  const result = await run("../create-signing-request/index.ts", signingBody, mock);
  assertEquals(result.status, 200);
  assertEquals(rpcCall(calls)?.body.p_signers.length, 1);
});
test("signing: 50 existing + 1 denied with clear message and no audit write", async () => {
  const { mock, calls } = signingMock(50, OWNER);
  const result = await run("../create-signing-request/index.ts", signingBody, mock);
  assertEquals(result.status, 429); assertEquals(result.body.error, "daily_invite_limit");
  assertEquals(result.body.message, "Достигнахте дневния лимит за покани за подпис. Опитайте отново утре.");
  assert(!calls.some(call => call.url.pathname.endsWith("signing_audit_events")));
});
test("signing: another account does not inherit the first owner's 50 invitations", async () => {
  const { mock } = signingMock(50, OTHER);
  assertEquals((await run("../create-signing-request/index.ts", signingBody, mock, OTHER)).status, 200);
});
test("signing: atomic operation error fails closed without email/audit", async () => {
  const { mock, calls } = signingMock(49, OWNER, "rpc");
  const result = await run("../create-signing-request/index.ts", signingBody, mock);
  assertEquals(result.status, 503); assertEquals(result.body.error, "invite_limit_unavailable");
  assert(!calls.some(call => call.url.pathname.endsWith("signing_audit_events")));
});

async function visitorHash(ip: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fixture|${new Date().toISOString().slice(0, 10)}|${ip}|fixture`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
for (const [name, rowUser, caller, ip, allowed] of [
  ["own anonymous visitor", null, "", "192.0.2.1", true],
  ["foreign anonymous visitor", null, "", "192.0.2.2", false],
  ["own account and visitor", OWNER, OWNER, "192.0.2.1", true],
  ["foreign account same visitor", OWNER, OTHER, "192.0.2.1", false],
  ["anonymous cannot update account row", OWNER, "", "192.0.2.1", false],
] as const) test(`pageview: ${name}`, async () => {
  const hash = await visitorHash("192.0.2.1");
  let updates = 0;
  const mock: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: caller, email: "owner@example.test" });
    assert(url.pathname.endsWith("page_views"));
    if (init?.method === "PATCH") { updates++; return new Response(null, { status: 204 }); }
    assertEquals(url.searchParams.get("session_id"), `eq.${SESSION}`);
    assertEquals(url.searchParams.get("path"), "eq./plans");
    assertEquals(url.searchParams.get("event"), "eq.pageview");
    const matches = url.searchParams.get("visitor_day_hash") === `eq.${hash}` && url.searchParams.get("user_id") === (rowUser ? `eq.${rowUser}` : "is.null");
    return json(matches ? { id: ENVELOPE } : null);
  };
  assertEquals((await run("../track-pageview/index.ts", { session_id: SESSION, event: "duration_update", path: "/plans", duration_ms: 12000 }, mock, caller, ip)).status, 200);
  assertEquals(updates, allowed ? 1 : 0);
});