import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchesScope, parseLimit, parseScope } from "./filters.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");

type Handler = (req: Request) => Promise<Response> | Response;
let handler: Handler | null = null;
async function load(): Promise<Handler> {
  if (handler) return handler;
  const orig = Deno.serve;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (x: any) => {
    handler = typeof x === "function" ? x : x?.handler;
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {} };
  };
  try { await import("./index.ts"); } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).serve = orig;
  }
  return handler!;
}

type Row = { id: string; question_text: string; field_type: string; options: null; importance: number; trigger_conditions: Record<string, unknown>; contract_type: string | null; sector_id: string | null; active: boolean };
const row = (id: string, importance: number, sector_id: string | null, contract_type: string | null, trigger_conditions: Record<string, unknown> = {}): Row =>
  ({ id, question_text: id, field_type: "text", options: null, importance, trigger_conditions, contract_type, sector_id, active: true });
const BASE: Row[] = [
  row("a", 9, null, null),
  row("b", 8, "services", "Договор за услуги"),
  row("c", 7, "rent", "Договор за наем"),
  row("d", 6, "services", null, { pay: "monthly" }),
];

// Минимален PostgREST емулатор: eq/is филтри, order importance.desc,id.asc, limit.
function serve(rows: Row[], url: URL): Row[] {
  let out = rows.slice();
  for (const [k, v] of url.searchParams) {
    if (k === "select" || k === "order" || k === "limit") continue;
    if (v.startsWith("eq.")) {
      const val = v.slice(3);
      out = out.filter((r) => String((r as Record<string, unknown>)[k]) === val);
    } else if (v === "is.null") {
      out = out.filter((r) => (r as Record<string, unknown>)[k] === null);
    } else throw new Error(`unsupported filter ${k}=${v}`);
  }
  out.sort((x, y) => y.importance - x.importance || (x.id < y.id ? -1 : 1));
  const lim = url.searchParams.get("limit");
  return lim ? out.slice(0, Number(lim)) : out;
}

async function call(body: unknown, rows: Row[] = BASE) {
  const urls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(`${(init?.method ?? "GET").toUpperCase()} ${decodeURIComponent(raw)}`);
    return new Response(JSON.stringify(serve(rows, new URL(raw))), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const h = await load();
    const res = await h(new Request("http://stub.local/fn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { res, payload: await res.json(), urls };
  } finally { globalThis.fetch = orig; }
}
const ids = (p: { questions: { id: string }[] }) => p.questions.map((q) => q.id);

T("parseScope: нормални стойности (вкл. кирилица и интервали) се приемат", () => {
  assertEquals(parseScope({ sector_id: "services", contract_type: "Договор за услуги" }), { ok: true, sectorId: "services", contractType: "Договор за услуги" });
  assertEquals(parseScope({}), { ok: true, sectorId: null, contractType: null });
});

T("parseScope: нестрингови, прекалено дълги и с контролни знаци → отказ", () => {
  assertEquals(parseScope({ sector_id: { x: 1 } }).ok, false);
  assertEquals(parseScope({ sector_id: ["a"] }).ok, false);
  assertEquals(parseScope({ contract_type: "a".repeat(201) }).ok, false);
  assertEquals(parseScope({ contract_type: "x\nsector_id.is.null" }).ok, false);
});

T("matchesScope: инжекционен низ е просто стойност — съвпада само с глобални редове", () => {
  const inj = "x,active.eq.false";
  assert(matchesScope({ sector_id: null, contract_type: null }, inj, null));
  assert(!matchesScope({ sector_id: "services", contract_type: null }, inj, null));
  assertEquals(parseLimit("999"), 5);
  assertEquals(parseLimit(50), 10);
  assertEquals(parseLimit(-3), 1);
});

T("handler: нормален резултат — сектор + глобални, с trigger_conditions", async () => {
  const { res, payload } = await call({ sector_id: "services", contract_type: "Договор за услуги", answers: { pay: "monthly" } });
  assertEquals(res.status, 200);
  assertEquals(payload.questions.map((q: { id: string }) => q.id), ["a", "b", "d"]);
});

T("handler: filter injection не влиза като филтър и не разширява обхвата", async () => {
  for (const inj of ["services,sector_id.neq.zzz", "x),or(active.eq.false", "*", "sector_id.is.null,contract_type.like.*"]) {
    const { res, payload, urls } = await call({ sector_id: inj, contract_type: inj });
    assertEquals(res.status, 200);
    assertEquals(ids(payload), ["a"], inj);
    assertEquals(urls.length, 4);
    for (const u of urls) {
      assert(u.startsWith("GET ") && u.includes("active=eq.true"), u);
      assert(!u.includes("or="), u);
      // Стойността се появява само като литерал на eq.
      if (u.includes(inj)) assert(u.includes(`=eq.${inj}`), u);
    }
  }
});

T("regression: >500 нерелевантни с висок importance не скриват релевантния въпрос; общите се включват", async () => {
  const noise: Row[] = Array.from({ length: 700 }, (_, i) => row(`n${String(i).padStart(4, "0")}`, 100, "other", "Друг"));
  const rows = [...noise, row("relevant", 1, "services", "Договор за услуги"), row("global", 0, null, null)];
  const { res, payload } = await call({ sector_id: "services", contract_type: "Договор за услуги", limit: 10 }, rows);
  assertEquals(res.status, 200);
  assertEquals(ids(payload), ["relevant", "global"]);
});

T("регресия: детерминистичен ред и дедупликация", async () => {
  const rows = [row("z", 5, "services", null), row("y", 5, null, "Договор за услуги"), row("x", 5, null, null)];
  const { payload } = await call({ sector_id: "services", contract_type: "Договор за услуги" }, rows);
  assertEquals(ids(payload), ["x", "y", "z"]);
});

T("защитен максимум: над 500 в един обхват → 503 capacity_exceeded, не частичен резултат", async () => {
  const many: Row[] = Array.from({ length: 501 }, (_, i) => row(`g${i}`, 1, null, null));
  const { res, payload } = await call({}, many);
  assertEquals(res.status, 503);
  assertEquals(payload.code, "capacity_exceeded");
  assertEquals(payload.questions, []);
});

T("handler: невалидни типове → 400 без заявка към базата", async () => {
  for (const body of [{ sector_id: 123 }, { contract_type: { a: 1 } }, { sector_id: "a\u0000b" }]) {
    const { res, payload, urls } = await call(body);
    assertEquals(res.status, 400);
    assertEquals(payload.code, "invalid_input");
    assertEquals(urls.length, 0);
  }
});
