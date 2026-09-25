// Седми пакет: истински обработчици за review-document (подписан пропуск),
// correct-uploaded и negotiation-strategy с валидни синтетични данни.
// Deno.serve прихванат, fetch изцяло подменен; без мрежа, без доставчик.
// Заменя проверките само по ред в изходния код с поведенчески проверки.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { NEW_PROCESSING_FLAGS } from "./new-processing-gate.ts";
import { issueReviewGrant, reviewContentDigest, REVIEW_GRANT_AUDIENCE } from "./review-grant.ts";
import { buildAnalysisSourceBinding, buildTitleContext } from "./analysis-source-binding.ts";

const T = (name: string, fn: () => Promise<void> | void) =>
  Deno.test({ name, fn, sanitizeOps: false, sanitizeResources: false });
type Handler = (req: Request) => Promise<Response> | Response;
const USER = "99999999-8888-4777-8666-555555555555";
const OTHER = "77777777-6666-4555-8444-333333333333";
const OP_ID = "11111111-2222-4333-8444-555555555555";
const GRANT_SECRET = "stub-review-grant-secret-0123456789";

Deno.env.set("SUPABASE_URL", "http://stub.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-role");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");
Deno.env.set("LOVABLE_API_KEY", "stub-gateway-key");
Deno.env.set("REVIEW_GRANT_SECRET", GRANT_SECRET);
Deno.env.set("STRATEGY_EVIDENCE_SECRET", "stub-strategy-secret-0123456789");
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

interface Call { method: string; url: string; body?: string }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
type Mode = "absent" | "committed";
type Tables = Record<string, Record<string, unknown> | null>;

const LOOKUPS = ["/rpc/ai_document_operation_lookup", "/rpc/review_operation_lookup", "/rpc/owned_review_operation_lookup"];

function installFetch(calls: Call[], mode: Mode, tables: Tables) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ method, url, body });
    const u = new URL(url);
    if (u.pathname === "/auth/v1/user") return json({ id: USER, aud: "authenticated" });
    if (LOOKUPS.some((p) => u.pathname.endsWith(p))) {
      const args = JSON.parse(body ?? "{}");
      const owner = args.p_user_id ?? args.p_owner_id;
      // Записаният резултат е само на собственика.
      if (mode === "committed" && owner === USER) {
        return json(u.pathname.endsWith("ai_document_operation_lookup")
          ? { status: "committed", result: { ok: true, recorded: "Записан резултат" } }
          : { status: "committed", response: { ok: true, recorded: "Записан резултат" } });
      }
      return json({ status: "absent" });
    }
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (m && (method === "GET" || method === "HEAD")) {
      const row = tables[m[1]];
      const wantsObject = new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object");
      if (row === undefined) return json({ error: "unexpected table" }, 500);
      if (wantsObject) return row ? json(row) : json({ code: "PGRST116" }, 406);
      return json(row ? [row] : []);
    }
    return json({ error: "unexpected" }, 500);
  }) as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

const forbidden = (c: Call) =>
  !LOOKUPS.some((p) => c.url.includes(p)) && (
    c.url.includes("ai.gateway") || c.url.includes("/rpc/") || c.url.includes("/storage/v1/") ||
    (c.url.includes("/rest/v1/") && c.method !== "GET" && c.method !== "HEAD") ||
    c.url.includes("/rest/v1/legal_") || c.url.includes("/rest/v1/ai_usage") || c.url.includes("rate_limit")
  );

const BODY_FLAGS = Object.fromEntries(Object.values(NEW_PROCESSING_FLAGS).map((k) => [k, "true"]));
const post = (body: unknown) => new Request("http://stub.local/fn", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer tkn" },
  body: JSON.stringify({ ...(body as object), ...BODY_FLAGS }),
});

async function run(path: string, body: unknown, mode: Mode, tables: Tables = {}) {
  const calls: Call[] = [];
  const restore = installFetch(calls, mode, tables);
  try {
    const res = await (await load(path))(post(body));
    return { res, payload: await res.json().catch(() => ({})), calls };
  } finally { restore(); }
}

// ------------------------------------------------------------- review-document
const RD = "../review-document/index.ts";
const DOC = "ДОГОВОР ЗА УСЛУГА\n\n1. Предмет. Изпълнителят поддържа уебсайта на Възложителя.\n\n2. Цена. Възнаграждението е 300 EUR месечно без ДДС, платимо до 5-о число.";
async function reviewBody(owner: string) {
  const grant = await issueReviewGrant({
    secret: GRANT_SECRET, subject: USER, owner, contentDigest: await reviewContentDigest(DOC), operation: REVIEW_GRANT_AUDIENCE,
  });
  return { documentText: DOC, documentTitle: "Договор за услуга", operation_id: OP_ID, grant };
}

T("review-document: собствен подписан пропуск, нова ревизия при OFF → 503 без модел/резервация/запис", async () => {
  const { res, payload, calls } = await run(RD, await reviewBody(USER), "absent");
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "review_prelaunch_closed");
  assert(calls.some((c) => c.url.includes("/rpc/review_operation_lookup")), "очаква се само-четящо търсене");
  assertEquals(calls.filter(forbidden), []);
});

T("review-document: собствен пропуск, записан резултат → точно възпроизвеждане при OFF", async () => {
  const { res, payload, calls } = await run(RD, await reviewBody(USER), "committed");
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(res.headers.get("X-Operation-Replay"), "true");
  assertEquals(payload.recorded, "Записан резултат");
  assertEquals(calls.filter(forbidden), []);
});

T("review-document: пропуск за чужд собственик → отказ, без търсене/резултат/запис", async () => {
  const { res, payload, calls } = await run(RD, await reviewBody(OTHER), "committed");
  assert(res.status === 401 || res.status === 403, `${res.status} ${JSON.stringify(payload)}`);
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
});

T("review-document: без пропуск и без документ → отказ без мрежови записи", async () => {
  const { res, calls } = await run(RD, { documentText: DOC, operation_id: OP_ID }, "committed");
  assert(res.status >= 400 && res.status < 500);
  assertEquals(calls.filter(forbidden), []);
});

// ------------------------------------------------------------ correct-uploaded
const CU = "../correct-uploaded/index.ts";
const CLAUSE = "Изпълнителят отговаря за всички вреди без ограничение на отговорността по този договор.";
const SOURCE = `ДОГОВОР ЗА УСЛУГА\n\n1. Предмет. Възложителят поръчва услуга.\n\n2. Отговорност. ${CLAUSE}\n\n3. Цена. 1 200,50 EUR без ДДС.`;
const TITLE = "Договор за услуга";
const DOC_ID = "22222222-3333-4444-8555-666666666666";
const AN_ID = "33333333-4444-4555-8666-777777777777";
async function cuFixture(owner: string) {
  const binding = await buildAnalysisSourceBinding({ sourceText: SOURCE.trim(), titleContext: buildTitleContext(TITLE) });
  const verification = {
    version: 1, status: "evidence_checked", reason_codes: [],
    counts: { issues_raw: 1, issues_kept: 1, issues_rejected: 0, missing_raw: 1, missing_kept: 1, missing_rejected: 0 },
    score_trusted: true, source: binding,
  };
  const tables: Tables = {
    download_quota: { plan: "pro", pro_until: null },
    uploaded_contracts: { id: DOC_ID, user_id: owner, title: TITLE, extracted_text: SOURCE },
    risk_analyses: {
      id: AN_ID, user_id: owner, uploaded_contract_id: DOC_ID, contract_type: "услуги", summary: "",
      issues: [{ severity: "high", title: "Неограничена отговорност", clause: CLAUSE, explanation: "Липсва таван на отговорността, което е непропорционално за изпълнителя.", suggestion: "Въведете таван до стойността на договора." }],
      missing_clauses: [{ name: "Ограничение на отговорността", why: "Без таван рискът е неограничен." }],
      verification,
    },
  };
  const body = {
    uploadedContractId: DOC_ID, analysisId: AN_ID, expectedSourceBinding: binding,
    selectedIssueIndices: [0], selectedMissingIndices: [0], operation_id: OP_ID, userConfirmed: true,
  };
  return { tables, body };
}

T("correct-uploaded: валидна нова поправка при OFF → 503 без лимит/журнал/резервация/модел", async () => {
  const { tables, body } = await cuFixture(USER);
  const { res, payload, calls } = await run(CU, body, "absent", tables);
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "correction_prelaunch_closed");
  assert(calls.some((c) => c.url.includes("/rpc/ai_document_operation_lookup")), "очаква се само-четящо търсене");
  assertEquals(calls.filter(forbidden), []);
});

T("correct-uploaded: записан резултат → точно възпроизвеждане при OFF", async () => {
  const { tables, body } = await cuFixture(USER);
  const { res, payload, calls } = await run(CU, body, "committed", tables);
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(payload.recorded, "Записан резултат");
  assertEquals(calls.filter(forbidden), []);
});

T("correct-uploaded: чужд документ → 404 без търсене в журнала/запис", async () => {
  const { tables, body } = await cuFixture(OTHER);
  const { res, payload, calls } = await run(CU, body, "committed", tables);
  assertEquals(res.status, 404, JSON.stringify(payload));
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
});

// -------------------------------------------------------- negotiation-strategy
const NS = "../negotiation-strategy/index.ts";
const nsTables = (owner: string): Tables => ({
  subscriptions: { price_id: "entrepreneur_monthly", status: "active" },
  risk_analyses: {
    id: AN_ID, user_id: owner, contract_type: "услуги", summary: "Кратко резюме.",
    issues: [{ title: "Неограничена отговорност" }], missing_clauses: [], uploaded_contract_id: DOC_ID, negotiation_strategy: null,
  },
  uploaded_contracts: { text_content: SOURCE },
});
const NS_BODY = { analysis_id: AN_ID, operation_id: OP_ID };

T("negotiation-strategy: валидна нова стратегия при OFF → 503 без модел/резервация/запис", async () => {
  const { res, payload, calls } = await run(NS, NS_BODY, "absent", nsTables(USER));
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "strategy_prelaunch_closed");
  assert(calls.some((c) => c.url.includes("/rpc/ai_document_operation_lookup")));
  assertEquals(calls.filter(forbidden), []);
});

T("negotiation-strategy: записан резултат → възпроизвеждане при OFF", async () => {
  const { res, payload, calls } = await run(NS, NS_BODY, "committed", nsTables(USER));
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(payload.recorded, "Записан резултат");
  assertEquals(payload.replay, true);
  assertEquals(calls.filter(forbidden), []);
});

T("negotiation-strategy: чужд анализ → 403 без търсене/запис", async () => {
  const { res, payload, calls } = await run(NS, NS_BODY, "committed", nsTables(OTHER));
  assertEquals(res.status, 403, JSON.stringify(payload));
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
});

// ---------------------------------- review-document: път на СОБСТВЕНИК без пропуск
// Валиден синтетичен запазен документ; ревизираният текст е точно каноничният
// четим текст на записа, така че обвързването owner/document/version/hash е реално.
import { renderCanonicalPlainText } from "./generated-document-quality.ts";
const SAVED_ID = "44444444-5555-4666-8777-888888888888";
const SAVED_PAYLOAD = {
  title: "Договор за услуга",
  preamble: "Днес страните сключиха настоящия договор за поддръжка на уебсайт.",
  clauses: [
    { number: "1.", title: "Предмет", body: "Изпълнителят поддържа уебсайта на Възложителя." },
    { number: "2.", title: "Цена", body: "Възнаграждението е 300 EUR месечно без ДДС, платимо до 5-о число." },
  ],
};
const SAVED_TEXT = renderCanonicalPlainText(SAVED_PAYLOAD);
const ownedTables = (owner: string, versionOwner = owner): Tables => ({
  saved_documents: { id: SAVED_ID, user_id: owner, payload: SAVED_PAYLOAD },
  document_versions: { user_id: versionOwner, payload: SAVED_PAYLOAD },
});
const ownedBody = (extra: Record<string, unknown> = {}) =>
  ({ documentText: SAVED_TEXT, documentTitle: "Договор за услуга", operation_id: OP_ID, document_id: SAVED_ID, ...extra });

T("review-document (собственик, без пропуск): фикстурата е непразен каноничен текст", () => {
  assert(SAVED_TEXT.includes("Изпълнителят поддържа уебсайта"), SAVED_TEXT);
});

T("review-document (собственик, без пропуск): нова ревизия при OFF → 503 без модел/резервация/запис", async () => {
  const { res, payload, calls } = await run(RD, ownedBody(), "absent", ownedTables(USER));
  assertEquals(res.status, 503, JSON.stringify(payload));
  assertEquals(payload.code, "review_prelaunch_closed");
  assert(calls.some((c) => c.url.includes("/rpc/owned_review_operation_lookup")), "очаква се само-четящо търсене по собственик");
  assert(!calls.some((c) => c.url.includes("/rpc/review_operation_lookup")), "пропускът не се ползва");
  assertEquals(calls.filter(forbidden), []);
});

T("review-document (собственик, версия): нова ревизия при OFF → 503; записан резултат → точен replay", async () => {
  const off = await run(RD, ownedBody({ document_version_no: 2 }), "absent", ownedTables(USER));
  assertEquals(off.res.status, 503, JSON.stringify(off.payload));
  assertEquals(off.calls.filter(forbidden), []);
  const rep = await run(RD, ownedBody({ document_version_no: 2 }), "committed", ownedTables(USER));
  assertEquals(rep.res.status, 200, JSON.stringify(rep.payload));
  assertEquals(rep.res.headers.get("X-Operation-Replay"), "true");
  assertEquals(rep.payload.recorded, "Записан резултат");
  assertEquals(rep.calls.filter(forbidden), []);
});

T("review-document (собственик, без пропуск): записан резултат → точно възпроизвеждане при OFF", async () => {
  const { res, payload, calls } = await run(RD, ownedBody(), "committed", ownedTables(USER));
  assertEquals(res.status, 200, JSON.stringify(payload));
  assertEquals(res.headers.get("X-Operation-Replay"), "true");
  assertEquals(payload.recorded, "Записан резултат");
  assert(calls.some((c) => c.url.includes("/rpc/owned_review_operation_lookup")));
  assertEquals(calls.filter(forbidden), []);
});

T("review-document: чужд запазен документ → отказ без търсене/резултат/запис", async () => {
  const { res, payload, calls } = await run(RD, ownedBody(), "committed", ownedTables(OTHER));
  assert(res.status >= 400 && res.status < 500, `${res.status} ${JSON.stringify(payload)}`);
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
  assertEquals(calls.filter(forbidden), []);
});

T("review-document: версия с различен собственик → отказ без търсене/запис", async () => {
  const { res, payload, calls } = await run(RD, ownedBody({ document_version_no: 2 }), "committed", ownedTables(USER, OTHER));
  assert(res.status >= 400 && res.status < 500, `${res.status} ${JSON.stringify(payload)}`);
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
});

T("review-document: остаряло обвързване (текстът не съвпада със записа) → отказ без търсене/запис", async () => {
  const stale = ownedBody({ documentText: SAVED_TEXT + "\n\n3. Нова клауза, която не е в записа." });
  const { res, payload, calls } = await run(RD, stale, "committed", ownedTables(USER));
  assert(res.status >= 400 && res.status < 500, `${res.status} ${JSON.stringify(payload)}`);
  assertEquals(payload.recorded, undefined);
  assert(!calls.some((c) => c.url.includes("/rpc/")));
  assertEquals(calls.filter(forbidden), []);
});
