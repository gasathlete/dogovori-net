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

const ROWS = [
  { id: "a", question_text: "Глобален", field_type: "text", options: null, importance: 9, trigger_conditions: {}, contract_type: null, sector_id: null },
  { id: "b", question_text: "Услуги", field_type: "text", options: null, importance: 8, trigger_conditions: {}, contract_type: "Договор за услуги", sector_id: "services" },
  { id: "c", question_text: "Наем", field_type: "text", options: null, importance: 7, trigger_conditions: {}, contract_type: "Договор за наем", sector_id: "rent" },
  { id: "d", question_text: "Условен", field_type: "text", options: null, importance: 6, trigger_conditions: { pay: "monthly" }, contract_type: null, sector_id: "services" },
];

async function call(body: unknown) {
  const urls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(`${(init?.method ?? "GET").toUpperCase()} ${decodeURIComponent(url)}`);
    return new Response(JSON.stringify(ROWS), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const h = await load();
    const res = await h(new Request("http://stub.local/fn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { res, payload: await res.json(), urls };
  } finally { globalThis.fetch = orig; }
}

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

T("handler: filter injection не влиза в заявката и не разширява резултата", async () => {
  for (const inj of ["services,sector_id.neq.zzz", "x),or(active.eq.false", "*", "sector_id.is.null,contract_type.like.*"]) {
    const { res, payload, urls } = await call({ sector_id: inj, contract_type: inj });
    assertEquals(res.status, 200);
    assertEquals(payload.questions.map((q: { id: string }) => q.id), ["a"], inj);
    assertEquals(urls.length, 1);
    assert(!urls[0].includes(inj), urls[0]);
    assert(!urls[0].includes("or="), urls[0]);
    assert(urls[0].startsWith("GET ") && urls[0].includes("active=eq.true"), urls[0]);
  }
});

T("handler: невалидни типове → 400 без заявка към базата", async () => {
  for (const body of [{ sector_id: 123 }, { contract_type: { a: 1 } }, { sector_id: "a\u0000b" }]) {
    const { res, payload, urls } = await call(body);
    assertEquals(res.status, 400);
    assertEquals(payload.code, "invalid_input");
    assertEquals(urls.length, 0);
  }
});
