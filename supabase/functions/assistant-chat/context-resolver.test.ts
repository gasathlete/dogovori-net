import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDocumentContext } from "./context-resolver.ts";

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

Deno.test("анализ: свързаният източник влиза във версията", async () => {
  const base = {
    risk_analyses: {
      id: UUID, contract_type: "Наем", score: 6, summary: "р", issues: [], missing_clauses: [],
      verification: null, uploaded_contract_id: SRC,
    },
  };
  const a = await resolveDocumentContext(
    client({ ...base, uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "А" } }),
    { kind: "analysis", entityId: UUID },
  );
  const b = await resolveDocumentContext(
    client({ ...base, uploaded_contracts: { id: SRC, title: "Ист", extracted_text: "Б" } }),
    { kind: "analysis", entityId: UUID },
  );
  assert(a.ok && b.ok);
  assertNotEquals(a.value.version, b.value.version);
  assert(a.value.body.includes("Наем"));
});

Deno.test("анализ без достъп до свързания източник се отказва", async () => {
  const r = await resolveDocumentContext(
    client({
      risk_analyses: {
        id: UUID, contract_type: "Наем", score: null, summary: null, issues: null,
        missing_clauses: null, verification: null, uploaded_contract_id: SRC,
      },
    }),
    { kind: "analysis", entityId: UUID },
  );
  assertEquals(r.ok, false);
});
