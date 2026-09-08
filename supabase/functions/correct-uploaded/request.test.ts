import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CORRECTION_MAX_SOURCE_CHARS,
  CORRECTION_PRESERVATION_SUFFIX,
  parseCorrectionRequest,
  selectFindings,
  SELECTION_MAX_INDEX,
} from "./request.ts";

const binding = { version: 1, text_sha256: "a".repeat(64), title_sha256: "b".repeat(64) };

const base = {
  uploadedContractId: "d1",
  analysisId: "a1",
  expectedSourceBinding: binding,
  selectedIssueIndices: [0],
  selectedMissingIndices: [] as number[],
  userConfirmed: true,
};

Deno.test("валидна заявка се приема с точните индекси", () => {
  const r = parseCorrectionRequest({ ...base, selectedIssueIndices: [2, 0], selectedMissingIndices: [1] });
  assert(r.ok);
  assertEquals(r.value.selectedIssueIndices, [2, 0]);
  assertEquals(r.value.selectedMissingIndices, [1]);
  assertEquals(r.value.userConfirmed, true);
});

Deno.test("празна категория остава празна и НЕ пада към всички", () => {
  const r = parseCorrectionRequest({ ...base, selectedIssueIndices: [], selectedMissingIndices: [1] });
  assert(r.ok);
  assertEquals(r.value.selectedIssueIndices, []);
});

Deno.test("липсващи/невалидни идентификатори се отхвърлят с 400", () => {
  for (const body of [
    null, 42, "x", [],
    { ...base, uploadedContractId: "" },
    { ...base, uploadedContractId: 5 },
    { ...base, analysisId: null },
    { ...base, analysisId: "   " },
  ]) {
    const r = parseCorrectionRequest(body);
    assert(!r.ok);
    assertEquals(r.error.status, 400);
  }
});

Deno.test("липсващо обвързване с източника е 409", () => {
  const r = parseCorrectionRequest({ ...base, expectedSourceBinding: undefined });
  assert(!r.ok);
  assertEquals(r.error.status, 409);
  assertEquals(r.error.code, "source_binding_missing");
});

Deno.test("индексите трябва да са цели, неотрицателни, ограничени и уникални", () => {
  for (const bad of [
    "0", null, undefined, {},
    [0, 0],
    [1.5],
    [-1],
    [SELECTION_MAX_INDEX + 1],
    ["0"],
    [Number.NaN],
  ]) {
    const r = parseCorrectionRequest({ ...base, selectedIssueIndices: bad });
    assert(!r.ok, JSON.stringify(bad));
    assertEquals(r.error.status, 400);
  }
});

Deno.test("нула избрани елемента се отхвърля преди всякакъв AI", () => {
  const r = parseCorrectionRequest({ ...base, selectedIssueIndices: [], selectedMissingIndices: [] });
  assert(!r.ok);
  assertEquals(r.error.code, "selection_empty");
});

Deno.test("userConfirmed по подразбиране е false", () => {
  const r = parseCorrectionRequest({ ...base, userConfirmed: "yes" });
  assert(r.ok);
  assertEquals(r.value.userConfirmed, false);
});

const CLAUSE_A = "Неустойката е в размер на 50% от стойността на договора.";
const CLAUSE_B = "Срокът за изпълнение се определя допълнително от Възложителя.";
const SOURCE = `ДОГОВОР\n\n1. ${CLAUSE_A}\n\n2. ${CLAUSE_B}\n`;

const issues = [
  { severity: "high", title: "Неустойка", clause: CLAUSE_A, explanation: "Прекомерна неустойка.", suggestion: "Намали" },
  { severity: "low", title: "Срок", clause: CLAUSE_B, explanation: "Неясен срок за изпълнение." },
];
const missing = [
  { name: "Конфиденциалност", why: "Липсва защита на данни" },
  { name: "Прекратяване", why: "Няма ред за прекратяване" },
];

Deno.test("избраните находки се четат от базата, точно по индекс", () => {
  const r = selectFindings({ issues, missingClauses: missing, issueIndices: [1], missingIndices: [0], sourceText: SOURCE });
  assert(r.ok);
  assertEquals(r.issues.length, 1);
  assertEquals(r.issues[0].title, "Срок");
  assertEquals(r.issues[0].clause, CLAUSE_B);
  assertEquals(r.missing.length, 1);
  assertEquals(r.missing[0].name, "Конфиденциалност");
});

Deno.test("празна категория дава празен списък, не всички находки", () => {
  const r = selectFindings({ issues, missingClauses: missing, issueIndices: [], missingIndices: [1], sourceText: SOURCE });
  assert(r.ok);
  assertEquals(r.issues, []);
  assertEquals(r.missing.length, 1);
});

Deno.test("индекс извън обхвата или повредена находка се отхвърля", () => {
  for (const input of [
    { issues, missingClauses: missing, issueIndices: [5], missingIndices: [] },
    { issues, missingClauses: missing, issueIndices: [], missingIndices: [9] },
    { issues: null, missingClauses: missing, issueIndices: [0], missingIndices: [] },
    { issues: [{ title: "", explanation: "x" }], missingClauses: missing, issueIndices: [0], missingIndices: [] },
    { issues: [{ title: "x" }], missingClauses: missing, issueIndices: [0], missingIndices: [] },
    { issues, missingClauses: [{ name: "x" }], issueIndices: [], missingIndices: [0] },
    { issues, missingClauses: [{ name: "x", why: "  " }], issueIndices: [], missingIndices: [0] },
    { issues: ["не е обект"], missingClauses: missing, issueIndices: [0], missingIndices: [] },
  ]) {
    const r = selectFindings({ ...input, sourceText: SOURCE } as Parameters<typeof selectFindings>[0]);
    assert(!r.ok, JSON.stringify(input));
    assertEquals(r.error.code, "selection_out_of_range");
  }
});

Deno.test("ограничителният суфикс пази суми/валути и обхвата на промените", () => {
  assert(CORRECTION_PRESERVATION_SUFFIX.includes("САМО"));
  assert(/валут/i.test(CORRECTION_PRESERVATION_SUFFIX));
  assert(!/в евро \(€\)/.test(CORRECTION_PRESERVATION_SUFFIX));
  assertEquals(CORRECTION_MAX_SOURCE_CHARS, 30000);
});

Deno.test("находка, чийто цитат липсва в текущия текст, се отхвърля", () => {
  const r = selectFindings({
    issues: [{ severity: "high", title: "Неустойка", clause: "Неустойката НЕ се дължи.", explanation: "Не е в текста." }],
    missingClauses: missing,
    issueIndices: [0],
    missingIndices: [],
    sourceText: SOURCE,
  });
  assert(!r.ok);
  assertEquals(r.error.code, "selection_quote_unverified");
});
