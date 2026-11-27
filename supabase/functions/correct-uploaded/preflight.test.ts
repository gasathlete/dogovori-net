/**
 * Проверките ПРЕДИ всякакъв AI/RAG/запис на употреба.
 * Всяко отказано искане трябва да остави шпионите на нула.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAnalysisSourceBinding, buildTitleContext } from "../_shared/analysis-source-binding.ts";
import { runCorrectionPreflight, type AnalysisRow, type ContractRow } from "./preflight.ts";

const CLAUSE =
  "Изпълнителят отговаря за всички вреди без ограничение на отговорността по този договор.";
const SOURCE = `ДОГОВОР ЗА УСЛУГА\n\n1. Предмет. Възложителят поръчва услуга.\n\n2. Отговорност. ${CLAUSE}\n\n3. Цена. 1 200,50 EUR без ДДС.`;
const TITLE = "Договор за услуга";

const contract = (over: Partial<ContractRow> = {}): ContractRow => ({
  id: "doc-1",
  user_id: "user-1",
  title: TITLE,
  extracted_text: SOURCE,
  ...over,
});

const verification = (over: Record<string, unknown> = {}) => ({
  version: 1,
  status: "evidence_checked",
  reason_codes: [] as string[],
  counts: {
    issues_raw: 1,
    issues_kept: 1,
    issues_rejected: 0,
    missing_raw: 1,
    missing_kept: 1,
    missing_rejected: 0,
  },
  score_trusted: true,
  ...over,
});

async function binding(text = SOURCE, title = TITLE) {
  return await buildAnalysisSourceBinding({
    sourceText: text.trim(),
    titleContext: buildTitleContext(title),
  });
}

async function analysis(over: Partial<AnalysisRow> = {}): Promise<AnalysisRow> {
  const v = verification() as Record<string, unknown>;
  v.source = await binding();
  return {
    id: "an-1",
    user_id: "user-1",
    uploaded_contract_id: "doc-1",
    issues: [
      {
        severity: "high",
        title: "Неограничена отговорност",
        clause: CLAUSE,
        explanation: "Липсва таван на отговорността, което е непропорционално за изпълнителя.",
        suggestion: "Въведете таван до стойността на договора.",
      },
    ],
    missing_clauses: [{ name: "Ограничение на отговорността", why: "Без таван рискът е неограничен." }],
    verification: v,
    ...over,
  };
}

interface Spies {
  ai: number;
  rag: number;
  usage: number;
}

async function run(body: unknown, opts?: {
  contractRow?: ContractRow | null;
  analysisRow?: AnalysisRow | null;
  userId?: string;
}) {
  const spies: Spies = { ai: 0, rag: 0, usage: 0 };
  const res = await runCorrectionPreflight({
    userId: opts?.userId ?? "user-1",
    body,
    deps: {
      loadContract: () => Promise.resolve(opts?.contractRow ?? contract()),
      loadAnalysis: () => Promise.resolve(opts?.analysisRow ?? null),
    },
  });
  return { res, spies };
}

async function validBody(over: Record<string, unknown> = {}) {
  return {
    uploadedContractId: "doc-1",
    analysisId: "an-1",
    expectedSourceBinding: await binding(),
    selectedIssueIndices: [0],
    selectedMissingIndices: [0],
    userConfirmed: false,
    ...over,
  };
}

Deno.test("валидно искане минава и носи ТОЧНИЯ цитат", async () => {
  const a = await analysis();
  const { res, spies } = await run(await validBody(), { analysisRow: a });
  if (!res.ok) throw new Error(`очаква се успех, получено ${JSON.stringify(res.error)}`);
  assertEquals(res.issues.length, 1);
  assertEquals(res.issues[0].clause, CLAUSE);
  assertEquals(res.issues[0].severity, "high");
  assertEquals(res.missing.length, 1);
  assertEquals(spies, { ai: 0, rag: 0, usage: 0 });
});

Deno.test("чужд документ не се коригира", async () => {
  const a = await analysis();
  const { res, spies } = await run(await validBody(), {
    analysisRow: a,
    contractRow: contract({ user_id: "someone-else" }),
  });
  assertEquals(res.ok, false);
  if (res.ok) return;
  assertEquals(res.error.status, 404);
  assertEquals(spies, { ai: 0, rag: 0, usage: 0 });
});

Deno.test("анализ на друг документ или друг потребител се отказва", async () => {
  const a = await analysis({ uploaded_contract_id: "doc-2" });
  const r1 = await run(await validBody(), { analysisRow: a });
  assertEquals(r1.res.ok, false);
  if (!r1.res.ok) assertEquals(r1.res.error.code, "analysis_not_found");

  const r2 = await run(await validBody(), { analysisRow: await analysis({ user_id: "other" }) });
  assertEquals(r2.res.ok, false);
  if (!r2.res.ok) assertEquals(r2.res.error.code, "analysis_not_found");
});

Deno.test("липсващ или невалиден запис на проверката спира корекцията", async () => {
  const a = await analysis({ verification: { version: 1, status: "evidence_checked" } });
  const { res } = await run(await validBody(), { analysisRow: a });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "analysis_verification_invalid");
});

Deno.test("анализ върху съкратен текст не води до пренаписване", async () => {
  const v = verification({ status: "incomplete", reason_codes: ["input_truncated"], score_trusted: false }) as Record<string, unknown>;
  v.source = await binding();
  const { res } = await run(await validBody(), { analysisRow: await analysis({ verification: v }) });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "input_truncated");
});

Deno.test("промяна на източника след анализа се отказва", async () => {
  const v = verification() as Record<string, unknown>;
  v.source = await binding(`${SOURCE} допълнение`);
  const { res } = await run(await validBody(), { analysisRow: await analysis({ verification: v }) });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "source_binding_mismatch");
});

Deno.test("клиентски отпечатък, различен от текущия, се отказва", async () => {
  const { res } = await run(await validBody({ expectedSourceBinding: await binding("друг текст изцяло") }), {
    analysisRow: await analysis(),
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "source_binding_mismatch");
});

Deno.test("прекалено дълъг документ се отказва преди модела", async () => {
  const long = `${CLAUSE} `.repeat(2000);
  const text = `${SOURCE}\n${long}`;
  const v = verification() as Record<string, unknown>;
  v.source = await binding(text);
  const { res, spies } = await run(
    await validBody({ expectedSourceBinding: await binding(text) }),
    { analysisRow: await analysis({ verification: v }), contractRow: contract({ extracted_text: text }) },
  );
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "source_too_long");
  assertEquals(spies, { ai: 0, rag: 0, usage: 0 });
});

Deno.test("несъществуващ индекс на находка се отказва", async () => {
  const { res } = await run(await validBody({ selectedIssueIndices: [5] }), {
    analysisRow: await analysis(),
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "selection_out_of_range");
});

Deno.test("находка без цитат в текущия текст се отказва", async () => {
  const a = await analysis();
  const issues = [
    {
      severity: "high",
      title: "Неограничена отговорност",
      clause: "Изпълнителят НЕ отговаря за вреди по този договор без ограничение.",
      explanation: "Цитатът не съществува дословно в документа.",
    },
  ];
  const { res, spies } = await run(await validBody({ selectedMissingIndices: [] }), {
    analysisRow: { ...a, issues },
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "selection_quote_unverified");
  assertEquals(spies, { ai: 0, rag: 0, usage: 0 });
});

Deno.test("повредена находка (липсва обяснение или тежест) се отказва", async () => {
  const a = await analysis();
  for (
    const bad of [
      { severity: "critical", title: "Т", clause: CLAUSE, explanation: "Достатъчно дълго обяснение." },
      { severity: "high", title: "Т", clause: CLAUSE },
      { severity: "high", title: "Т", explanation: "Няма цитат." },
      null,
      "низ",
    ]
  ) {
    const { res } = await run(await validBody({ selectedMissingIndices: [] }), {
      analysisRow: { ...a, issues: [bad] },
    });
    assertEquals(res.ok, false, JSON.stringify(bad));
    if (!res.ok) assertEquals(res.error.code, "selection_out_of_range");
  }
});

Deno.test("липсваща клауза без обяснение защо се отказва", async () => {
  const a = await analysis();
  const { res } = await run(await validBody({ selectedIssueIndices: [] }), {
    analysisRow: { ...a, missing_clauses: [{ name: "Ограничение", why: "   " }] },
  });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error.code, "selection_out_of_range");
});

Deno.test("празен избор остава празен, без подмяна", async () => {
  const { res } = await run(
    await validBody({ selectedIssueIndices: [0], selectedMissingIndices: [] }),
    { analysisRow: await analysis() },
  );
  if (!res.ok) throw new Error("очаква се успех");
  assertEquals(res.missing.length, 0);
  assertEquals(res.issues.length, 1);
});
