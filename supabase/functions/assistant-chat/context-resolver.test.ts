import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDocumentContext } from "./context-resolver.ts";
import {
  buildAnalysisSourceBinding,
  buildTitleContext,
} from "../_shared/analysis-source-binding.ts";

const UUID = "11111111-1111-4111-8111-111111111111";
const SRC = "33333333-3333-4333-8333-333333333333";

/** Фалшив клиент — доказва, че разрешаването минава ПРЕЗ подадения клиент. */
function client(tables: Record<string, unknown>, calls: string[] = []) {
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () =>
          table in tables
            ? { data: tables[table], error: null }
            : { data: null, error: null },
      };
      return api;
    },
  };
}

Deno.test("запазен документ: заглавие и версия идват от сървъра", async () => {
  const calls: string[] = [];
  const c = client({ saved_documents: { id: UUID, title: "Наем", payload: { text: "тяло" } } }, calls);
  const r = await resolveDocumentContext(c, { kind: "saved_document", entityId: UUID });
  assert(r.ok);
  assertEquals(r.value.title, "Наем");
  assertEquals(r.value.body, "тяло");
  assertEquals(r.value.version.length, 64);
  assertEquals(calls, ["saved_documents"]);
});

Deno.test("липсващ или недостъпен ред дава стабилен код", async () => {
  const r = await resolveDocumentContext(client({}), { kind: "saved_document", entityId: UUID });
  assertEquals(r.ok, false);
  assertEquals((r as { code: string }).code, "document_not_found");
});

Deno.test("качен документ: версията следва извлечения текст", async () => {
  const one = await resolveDocumentContext(
    client({ uploaded_contracts: { id: UUID, title: null, original_filename: "d.pdf", extracted_text: "А" } }),
    { kind: "uploaded_contract", entityId: UUID },
  );
  const two = await resolveDocumentContext(
    client({ uploaded_contracts: { id: UUID, title: null, original_filename: "d.pdf", extracted_text: "Б" } }),
    { kind: "uploaded_contract", entityId: UUID },
  );
  assert(one.ok && two.ok);
  assertEquals(one.value.title, "d.pdf");
  assertNotEquals(one.value.version, two.value.version);
});

// --- Актуалност на анализа (Q2e/5) ----------------------------------------
// Валиден контекст за анализ изисква обвързване, РАВНО на текущия източник —
// точно тримнатият текст и точно заглавният контекст на конвейера.
async function freshVerification(text: string, title: string | null) {
  const binding = await buildAnalysisSourceBinding({
    sourceText: text.trim(),
    titleContext: buildTitleContext(title),
  });
  return { source: binding };
}

function analysisRow(extra: Record<string, unknown> = {}) {
  return {
    id: UUID, contract_type: "Наем", score: 6, summary: "р", issues: [],
    missing_clauses: [], verification: null, negotiation_strategy: null,
    model: "m", created_at: "2026-01-01T00:00:00Z", uploaded_contract_id: SRC,
    ...extra,
  };
}

Deno.test("анализ: свързаният източник влиза във версията", async () => {
  const a = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification: await freshVerification("А", "Ист") }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "А" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  const b = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification: await freshVerification("Б", "Ист") }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "Б" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assert(a.ok && b.ok);
  assertNotEquals(a.value.version, b.value.version);
  assert(a.value.body.includes("Наем"));
});

Deno.test("анализ: моделът и датата влизат в контекста и версията", async () => {
  const verification = await freshVerification("А", "Ист");
  const withModel = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification, model: "m1" }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "А" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  const otherModel = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification, model: "m2" }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "А" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assert(withModel.ok && otherModel.ok);
  assert(withModel.value.body.includes("m1"));
  assert(withModel.value.body.includes("2026-01-01"));
  assertNotEquals(withModel.value.version, otherModel.value.version);
});

Deno.test("анализ върху друга версия на текста е analysis_context_stale", async () => {
  const r = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification: await freshVerification("СТАР", "Ист") }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "НОВ" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals(r.ok, false);
  assertEquals((r as { code: string }).code, "analysis_context_stale");
});

Deno.test("смяна само на заглавието също прави анализа остарял", async () => {
  const r = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification: await freshVerification("А", "Старо") }),
      uploaded_contracts: { id: SRC, title: "Ново", extracted_text: "А" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals((r as { code: string }).code, "analysis_context_stale");
});

Deno.test("анализ без обвързване (legacy) не се приема", async () => {
  const r = await resolveDocumentContext(
    client({
      risk_analyses: analysisRow({ verification: null }),
      uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "А" },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals((r as { code: string }).code, "analysis_context_stale");
});

Deno.test("анализ без свързан източник не се приема", async () => {
  const r = await resolveDocumentContext(
    client({ risk_analyses: analysisRow({ uploaded_contract_id: null }) }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals((r as { code: string }).code, "analysis_context_stale");
});

Deno.test("анализ без достъп до свързания източник се отказва", async () => {
  const r = await resolveDocumentContext(
    client({ risk_analyses: analysisRow({ verification: await freshVerification("А", "Ист") }) }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals(r.ok, false);
  assertEquals((r as { code: string }).code, "document_not_found");
});

Deno.test("запазен документ: допълнителните полета в payload не се изпускат", async () => {
  const r = await resolveDocumentContext(
    client({
      saved_documents: {
        id: UUID, title: "Наем", kind: "contract", created_at: null,
        payload: {
          intro: "увод",
          sections: [{ heading: "Х", body: "тяло", note: "бележка" }],
          annex: { amount: 1200, currency: "EUR" },
        },
      },
    }),
    { kind: "saved_document", entityId: UUID },
  );
  assert(r.ok);
  assert(r.value.body.includes("увод"));
  assert(r.value.body.includes("тяло"));
  assert(r.value.body.includes("бележка"));
  assert(r.value.body.includes("1200"));
  assert(r.value.body.includes("EUR"));
});
