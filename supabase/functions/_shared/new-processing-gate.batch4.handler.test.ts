// Четвърти пакет: apply-corrections и refine-contract — истински обработчици,
// Deno.serve прихванат, fetch изцяло подменен. correct-uploaded — проверка на
// реда в изходния код (предварителната проверка изисква пълен анализ с
// доказателства; не е надеждно stub-ната тук).
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

function installFetch(calls: Call[], mode: "absent" | "committed") {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated", email: "t@example.test" });
    if (url.includes("/rpc/quota_operation_lookup")) {
      return json(mode === "committed"
        ? { status: "committed", charged: true, result_ref: { contract: { title: "Записан" }, replayed: true } }
        : { status: "absent" });
    }
    if (url.includes("/rest/v1/quota_wave_operations") && method === "GET") return json([]);
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const READS = ["/rpc/quota_operation_lookup", "/auth/v1/"];
const forbidden = (c: Call) =>
  !READS.some((r) => c.url.includes(r)) && (
    c.url.includes("ai.gateway") || c.url.includes("stripe") || c.url.includes("/storage/v1/") ||
    c.url.includes("/rpc/") || (c.url.includes("/rest/v1/") && c.method !== "GET" && c.method !== "HEAD") ||
    // След преградата: лимит (ai_usage), квота, журнал — не бива да се четат.
    c.url.includes("/rest/v1/ai_usage") || c.url.includes("/rest/v1/download_quota") ||
    c.url.includes("/rest/v1/illegal")
  );

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const post = (body: unknown, auth = true) =>
  new Request("http://stub.local/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer tkn" } : {}) },
    body: JSON.stringify(body),
  });
const CONTRACT = { title: "Договор за услуги", sections: [{ heading: "Предмет", body: "Изпълнителят предоставя услуги по поддръжка." }] };

for (const [name, path, body, code] of [
  ["apply-corrections", "../apply-corrections/index.ts",
    { contract: CONTRACT, selectedIssues: [{ title: "Срок", detail: "Липсва срок" }], operation_id: OP_ID }, "correction_prelaunch_closed"],
  ["refine-contract", "../refine-contract/index.ts",
    { contract: CONTRACT, feedback: "Добавете срок за плащане.", operation_id: OP_ID }, "refinement_prelaunch_closed"],
] as const) {
  T(`${name}: OFF + нова обработка (флагове в тялото) → 503, без модел/резервация/запис`, async () => {
    const h = await load(path);
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const res = await h(post({ ...body, ...BODY_FLAGS, enabled: true }));
      const j = await res.json();
      assertEquals(res.status, 503, JSON.stringify(j));
      assertEquals(j.code, code);
      assertEquals(j.charge_state, "not_charged");
      assertEquals(calls.filter(forbidden), []);
    } finally { restore(); }
  });
  T(`${name}: OPTIONS и 401 без auth`, async () => {
    const h = await load(path);
    const calls: Call[] = [];
    const restore = installFetch(calls, "absent");
    try {
      const o = await h(new Request("http://stub.local/fn", { method: "OPTIONS" }));
      assert(o.status < 300); await o.body?.cancel();
      const r = await h(post(body, false));
      assertEquals(r.status, 401); await r.body?.cancel();
      assertEquals(calls.filter(forbidden), []);
    } finally { restore(); }
  });
}

T("refine-contract: OFF + вече завършено прецизиране → точно възпроизвеждане", async () => {
  const h = await load("../refine-contract/index.ts");
  const calls: Call[] = [];
  const restore = installFetch(calls, "committed");
  try {
    const res = await h(post({ contract: CONTRACT, feedback: "Добавете срок за плащане.", operation_id: OP_ID }));
    const j = await res.json();
    assertEquals(res.status, 200, JSON.stringify(j));
    assertEquals(j.contract.title, "Записан");
    assertEquals(calls.filter(forbidden), []);
  } finally { restore(); }
});

// Ред в изходния код: преградата е след replay и преди всяка странична стъпка.
const order = async (file: string, surface: string, before: string[], after: string[]) => {
  const src = await Deno.readTextFile(new URL(file, import.meta.url));
  const g = src.indexOf(`isNewProcessingOpen("${surface}")`);
  assert(g > 0, "липсва преграда");
  for (const b of before) { const i = src.indexOf(b); assert(i > 0 && i < g, `${b} трябва да е преди`); }
  for (const a of after) { const i = src.indexOf(a); assert(i > g, `${a} трябва да е след`); }
};
T("correct-uploaded (само изходен код): след lookup/replay, преди лимит/резервация/модел", () =>
  order("../correct-uploaded/index.ts", "correct_uploaded",
    ["lookupDocumentOperation(ledger", 'existing.kind === "committed"'],
    ['.eq("function_name", "correct-uploaded")', "reserveDocumentOperation(ledger, {", "guardIllegalContent({", "ai.gateway.lovable.dev"]));
T("apply-corrections (изходен код): replay на завършена вълна е преди преградата", () =>
  order("../apply-corrections/index.ts", "apply_corrections",
    ["lookupCommittedWave(ledgerDb", "exactReplayResponse(stored)"],
    ['from("download_quota")', "guardIllegalContent({", "reserveQuotaWave(ledgerDb", "ai.gateway.lovable.dev"]));
T("refine-contract (изходен код): ред на преградата", () =>
  order("../refine-contract/index.ts", "refine_contract",
    ["lookupCommittedOperation(ledgerDb", "exactReplayResponse(stored)"],
    ["guardIllegalContent({", "reserveQuota(ledgerDb", "ai.gateway.lovable.dev"]));

// Документирано поведение: при състояние „reconciliation“ от предишен опит
// обработчикът записва служебна бележка ПРЕДИ преградата. Това не е нова AI
// обработка — не се извиква модел, не се резервира и не се таксува.
T("refine-contract: reconciliation пише служебна бележка преди преградата, без модел/резервация", async () => {
  const h = await load("../refine-contract/index.ts");
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    if (url.includes("/auth/v1/user")) return json({ id: USER_ID, aud: "authenticated" });
    if (url.includes("/rpc/quota_operation_lookup")) return json({ status: "reconciliation", reason: "stub" });
    return json(null);
  }) as typeof fetch;
  try {
    const res = await h(post({ contract: CONTRACT, feedback: "Добавете срок за плащане.", operation_id: OP_ID }));
    const j = await res.json();
    assert(j.code !== "refinement_prelaunch_closed");
    const extra = calls.filter((c) => !c.url.includes("/auth/v1/") && !c.url.includes("/rpc/quota_operation_lookup"));
    assert(extra.length >= 1, "очаква се служебен запис за изравняване");
    assert(!calls.some((c) => c.url.includes("ai.gateway") || c.url.includes("quota_reserve")));
  } finally { globalThis.fetch = orig; }
});
