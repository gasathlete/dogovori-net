// Q2b1 — синтетични тестове (без жив LLM, без база, без клиентски данни).
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ANALYSIS_CACHE_POLICY_VERSION,
  attachSourceBinding,
  buildAnalysisSourceBinding,
  buildClonePayload,
  buildFreshAnalysisPayload,
  buildTitleContext,
  computeAnalysisCacheKey,
  isCacheReusable,
  isSourceBindingEqual,
  readSourceBinding,
  resolveCachedAnalysis,
  validateAnalysisSourceBinding,
} from "./analysis-source-binding.ts";
import { validateAnalysisVerification } from "./analysis-evidence.ts";

const TEXT =
  "Наемателят дължи наем в размер на 1 200,00 EUR месечно. Наемодателят не дължи неустойка при забава.";
const TITLE = buildTitleContext("Договор за наем");

const binding = (text = TEXT, title = TITLE) =>
  buildAnalysisSourceBinding({ sourceText: text, titleContext: title });

const key = async (text = TEXT, title = TITLE) =>
  await computeAnalysisCacheKey({ promptVersion: "v6", binding: await binding(text, title) });

const evidenceOk = () => ({
  version: 1,
  status: "evidence_checked",
  reason_codes: [] as string[],
  counts: {
    issues_raw: 1,
    issues_kept: 1,
    issues_rejected: 0,
    missing_raw: 0,
    missing_kept: 0,
    missing_rejected: 0,
  },
  score_trusted: true,
});

const evidenceIncomplete = () => ({
  version: 1,
  status: "incomplete",
  reason_codes: ["quote_unverified"],
  counts: {
    issues_raw: 2,
    issues_kept: 1,
    issues_rejected: 1,
    missing_raw: 0,
    missing_kept: 0,
    missing_rejected: 0,
  },
  score_trusted: false,
});

// --------------------------- отпечатък и стабилност ---------------------------

Deno.test("идентичен вход дава стабилен отпечатък и стабилен кеш-ключ", async () => {
  const a = await binding();
  const b = await binding();
  assertEquals(a, b);
  assert(isSourceBindingEqual(a, b));
  assertEquals(await key(), await key());
});

Deno.test("отпечатъкът съдържа САМО дайджести — без текст и идентификатори", async () => {
  const b = await binding();
  assertEquals(Object.keys(b).sort(), ["text_sha256", "title_sha256", "version"]);
  assertEquals(JSON.stringify(b).includes("Наемателят"), false);
});

Deno.test("пълната опашка след 28k знака променя отпечатъка", async () => {
  const head = "А".repeat(28000);
  const a = await binding(head);
  const b = await binding(head + "Допълнителна клауза за неустойка.");
  assertFalse(isSourceBindingEqual(a, b));
  assertFalse((await key(head)) === (await key(head + "Допълнителна клауза за неустойка.")));
});

Deno.test("разликите в празно място са консервативни — различна снимка", async () => {
  assertFalse(isSourceBindingEqual(await binding(TEXT), await binding(TEXT.replace(". ", ".  "))));
  assertFalse(isSourceBindingEqual(await binding(TEXT), await binding(TEXT + "\n")));
});

Deno.test("промяна на сума, отрицание, Unicode или заглавие прави снимката невалидна за кеш", async () => {
  const base = await binding();
  const changedAmount = await binding(TEXT.replace("1 200,00", "1 300,00"));
  const changedNegation = await binding(TEXT.replace("не дължи", "дължи"));
  const changedUnicode = await binding(TEXT.replace("EUR", "EUR\u200B"));
  const changedTitle = await binding(TEXT, buildTitleContext("Договор за наем на жилище"));
  for (const other of [changedAmount, changedNegation, changedUnicode, changedTitle]) {
    assertFalse(isSourceBindingEqual(base, other));
    assertFalse(isCacheReusable({
      verification: attachSourceBinding(evidenceOk(), other),
      currentBinding: base,
    }));
  }
});

Deno.test("кеш-ключът зависи от версията на промпта и на кеш-политиката", async () => {
  const b = await binding();
  const k1 = await computeAnalysisCacheKey({ promptVersion: "v6", binding: b });
  const k2 = await computeAnalysisCacheKey({ promptVersion: "v7", binding: b });
  assertFalse(k1 === k2);
  assertEquals(typeof ANALYSIS_CACHE_POLICY_VERSION, "string");
});

// --------------------------- fail closed ---------------------------

Deno.test("повредено/липсващо/непознато обвързване се отхвърля", () => {
  const hex = "a".repeat(64);
  const bad: unknown[] = [
    undefined,
    null,
    {},
    [],
    "a",
    1,
    { version: 1, text_sha256: hex },
    { version: 1, title_sha256: hex },
    { version: 2, text_sha256: hex, title_sha256: hex },
    { version: 1, text_sha256: hex.toUpperCase(), title_sha256: hex },
    { version: 1, text_sha256: "abc", title_sha256: hex },
    { version: 1, text_sha256: hex, title_sha256: null },
  ];
  for (const v of bad) assertEquals(validateAnalysisSourceBinding(v), null);
});

Deno.test("v1 метаданни БЕЗ обвързване остават четими от Q2a, но не дават кеш-хит", async () => {
  const legacy = evidenceOk();
  assert(validateAnalysisVerification(legacy) !== null);
  assertEquals(readSourceBinding(legacy), null);
  assertFalse(isCacheReusable({ verification: legacy, currentBinding: await binding() }));
});

Deno.test("невалидни доказателствени метаданни не дават кеш-хит дори с вярно обвързване", async () => {
  const b = await binding();
  const broken = { ...evidenceOk(), counts: { issues_raw: 5 } };
  assertFalse(isCacheReusable({ verification: attachSourceBinding(broken, b), currentBinding: b }));
});

Deno.test("валидни НЕПЪЛНИ доказателства кешират само с вярно обвързване", async () => {
  const b = await binding();
  const other = await binding(TEXT + " Допълнение.");
  assert(isCacheReusable({
    verification: attachSourceBinding(evidenceIncomplete(), b),
    currentBinding: b,
  }));
  assertFalse(isCacheReusable({
    verification: attachSourceBinding(evidenceIncomplete(), other),
    currentBinding: b,
  }));
});

Deno.test("обвързването не променя доказателствения статус", async () => {
  const b = await binding();
  const withBinding = attachSourceBinding(evidenceIncomplete(), b);
  assertEquals(validateAnalysisVerification(withBinding)?.status, "incomplete");
  assertEquals(validateAnalysisVerification(withBinding)?.reason_codes, ["quote_unverified"]);
});

// --------------------------- оркестрация (spy-ове) ---------------------------

Deno.test("кеш-хит за същия документ не клонира", async () => {
  const b = await binding();
  const calls: Record<string, unknown>[] = [];
  const res = await resolveCachedAnalysis({
    cached: { uploaded_contract_id: "doc-1", verification: attachSourceBinding(evidenceOk(), b) },
    currentBinding: b,
    uploadedContractId: "doc-1",
    userId: "user-1",
    cloneAnalysis: async (p) => {
      calls.push(p);
      return null;
    },
  });
  assertEquals(res.kind, "reuse");
  assertEquals(calls.length, 0);
});

Deno.test("кеш-хит за друг документ клонира с пълен полезен товар", async () => {
  const b = await binding();
  const verification = attachSourceBinding(evidenceOk(), b);
  const cached = {
    uploaded_contract_id: "doc-old",
    verification,
    model: "google/gemini-2.5-flash",
    score: 7,
    contract_type: "Договор за наем",
    summary: "Резюме.",
    issues: [{ severity: "low" }],
    missing_clauses: [],
    text_hash: await key(),
  };
  const calls: Record<string, unknown>[] = [];
  const res = await resolveCachedAnalysis({
    cached,
    currentBinding: b,
    uploadedContractId: "doc-new",
    userId: "user-1",
    cloneAnalysis: async (p) => {
      calls.push(p);
      return { ...p };
    },
  });
  assertEquals(res.kind, "cloned");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].uploaded_contract_id, "doc-new");
  assertEquals(calls[0].user_id, "user-1");
  assertEquals(calls[0].text_hash, cached.text_hash);
  assertEquals(calls[0].verification, verification);
  assertEquals(readSourceBinding(calls[0].verification) !== null, true);
});

Deno.test("провален клон НИКОГА не връща чужд запис като успех", async () => {
  const b = await binding();
  const res = await resolveCachedAnalysis({
    cached: { uploaded_contract_id: "doc-old", verification: attachSourceBinding(evidenceOk(), b) },
    currentBinding: b,
    uploadedContractId: "doc-new",
    userId: "user-1",
    cloneAnalysis: async () => null,
  });
  assertEquals(res.kind, "clone_failed");
  assertEquals("row" in res, false);
});

Deno.test("несъвпадаща снимка се преизчислява без опит за клониране", async () => {
  const b = await binding();
  const stale = await binding(TEXT.replace("не дължи", "дължи"));
  let cloned = 0;
  const res = await resolveCachedAnalysis({
    cached: { uploaded_contract_id: "doc-old", verification: attachSourceBinding(evidenceOk(), stale) },
    currentBinding: b,
    uploadedContractId: "doc-new",
    userId: "user-1",
    cloneAnalysis: async () => {
      cloned++;
      return null;
    },
  });
  assertEquals(res.kind, "recompute");
  assertEquals(cloned, 0);
});

Deno.test("липсващ кеш-запис (вкл. чужд потребител, отрязан от заявката) → преизчисляване", async () => {
  const res = await resolveCachedAnalysis({
    cached: null,
    currentBinding: await binding(),
    uploadedContractId: "doc-1",
    userId: "user-2",
    cloneAnalysis: async () => {
      throw new Error("не трябва да се вика");
    },
  });
  assertEquals(res.kind, "recompute");
});

Deno.test("нов запис носи кеш-ключа и обвързването, и остава доверен кеш", async () => {
  const b = await binding();
  const cacheKey = await key();
  const payload = buildFreshAnalysisPayload({
    uploadedContractId: "doc-1",
    userId: "user-1",
    model: "google/gemini-2.5-flash",
    score: 8,
    contractType: "Договор за наем",
    summary: "Резюме.",
    issues: [],
    missingClauses: [],
    cacheKey,
    verification: evidenceOk(),
    binding: b,
  });
  assertEquals(payload.text_hash, cacheKey);
  assert(isCacheReusable({ verification: payload.verification, currentBinding: b }));
  assertEquals(validateAnalysisVerification(payload.verification)?.status, "evidence_checked");
});

Deno.test("buildClonePayload копира точно договорените полета", async () => {
  const b = await binding();
  const cached = {
    uploaded_contract_id: "doc-old",
    user_id: "user-old",
    id: "row-old",
    created_at: "2026-01-01",
    verification: attachSourceBinding(evidenceOk(), b),
    model: "m",
    score: 5,
    contract_type: "t",
    summary: "s",
    issues: [],
    missing_clauses: [],
    text_hash: "h",
  };
  const p = buildClonePayload({ cached, uploadedContractId: "doc-new", userId: "user-1" });
  assertEquals(Object.keys(p).sort(), [
    "contract_type",
    "issues",
    "missing_clauses",
    "model",
    "score",
    "summary",
    "text_hash",
    "uploaded_contract_id",
    "user_id",
    "verification",
  ]);
  assertEquals(p.id, undefined);
  assertEquals(p.created_at, undefined);
});
