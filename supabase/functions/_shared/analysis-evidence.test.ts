import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAnalysisVerification,
  isTrustedCachedVerification,
  isValidModelScore,
  normalizeEvidenceText,
  verifyQuoteAgainstSource,
  type VerificationInput,
} from "./analysis-evidence.ts";

const SOURCE = normalizeEvidenceText(
  `ДОГОВОР ЗА ИЗРАБОТКА

  Чл. 4. Изпълнителят не дължи неустойка при забава над 30 дни.
  Чл. 5. Възложителят заплаща 1 200,00 EUR в срок от 5 работни дни.
  Чл. 6. Страните уреждат споровете чрез „арбитраж" в София.`,
);

const BASE: VerificationInput = {
  rootShapeValid: true,
  issuesIsArray: true,
  missingIsArray: true,
  issuesRaw: 2,
  issuesKept: 2,
  malformedIssues: 0,
  quoteRejected: 0,
  missingRaw: 1,
  missingKept: 1,
  missingRejected: 0,
  inputTruncated: false,
  scoreValid: true,
};

Deno.test("точен цитат се приема", () => {
  const q = "Изпълнителят не дължи неустойка при забава над 30 дни";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, true);
});

Deno.test("разлики в празно място, NBSP и форма на кавичките се приемат", () => {
  const q = "Страните\u00A0уреждат   споровете\nчрез “арбитраж” в София";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, true);
});

Deno.test("разпръснати думи не са доказателство", () => {
  const q = "неустойка Възложителят арбитраж срок работни дни договор";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("разместен ред на думите не е доказателство", () => {
  const q = "при забава над 30 дни Изпълнителят не дължи неустойка";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("сменено отрицание не е доказателство", () => {
  const q = "Изпълнителят дължи неустойка при забава над 30 дни";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("сменена сума не е доказателство", () => {
  const q = "Възложителят заплаща 1 500,00 EUR в срок от 5 работни дни";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("сменен десетичен разделител не е доказателство", () => {
  const q = "Възложителят заплаща 1 200.00 EUR в срок от 5 работни дни";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("сменена валута не е доказателство", () => {
  const q = "Възложителят заплаща 1 200,00 лева в срок от 5 работни дни";
  assertEquals(verifyQuoteAgainstSource(q, SOURCE).verified, false);
});

Deno.test("твърде кратък, празен и нестрингов цитат са непроверени", () => {
  assertEquals(verifyQuoteAgainstSource("неустойка", SOURCE).reason, "too_short");
  assertEquals(verifyQuoteAgainstSource("", SOURCE).reason, "too_short");
  assertEquals(verifyQuoteAgainstSource(null, SOURCE).reason, "not_a_string");
  assertEquals(verifyQuoteAgainstSource({ clause: "x" }, SOURCE).reason, "not_a_string");
});

Deno.test("прекалено дълъг цитат е непроверен", () => {
  assertEquals(verifyQuoteAgainstSource("а".repeat(400), SOURCE).reason, "too_long");
});

Deno.test("цитат срещу празен изпратен текст е непроверен", () => {
  const q = "Изпълнителят не дължи неустойка при забава над 30 дни";
  assertEquals(verifyQuoteAgainstSource(q, "").verified, false);
});

Deno.test("напълно обоснован анализ е evidence_checked и оценката е доверена", () => {
  const m = buildAnalysisVerification(BASE);
  assertEquals(m.status, "evidence_checked");
  assertEquals(m.reason_codes, []);
  assertEquals(m.score_trusted, true);
});

Deno.test("отпаднал цитат прави анализа непълен и оценката недоверена", () => {
  const m = buildAnalysisVerification({ ...BASE, issuesKept: 1, quoteRejected: 1 });
  assertEquals(m.status, "incomplete");
  assertEquals(m.reason_codes, ["quote_unverified"]);
  assertEquals(m.score_trusted, false);
  assertEquals(m.counts.issues_rejected, 1);
});

Deno.test("отрязан вход, невалидна оценка и невалидна структура водят до incomplete", () => {
  assertEquals(buildAnalysisVerification({ ...BASE, inputTruncated: true }).status, "incomplete");
  assertEquals(buildAnalysisVerification({ ...BASE, scoreValid: false }).status, "incomplete");
  assertEquals(
    buildAnalysisVerification({ ...BASE, rootShapeValid: false, issuesIsArray: false }).reason_codes
      .includes("issues_not_array"),
    true,
  );
});

Deno.test("филтрирана липсваща клауза прави анализа непълен, но не изисква цитат", () => {
  const m = buildAnalysisVerification({ ...BASE, missingKept: 0, missingRejected: 1 });
  assertEquals(m.status, "incomplete");
  assertEquals(m.reason_codes, ["missing_clause_filtered"]);
});

Deno.test("метаданните никога не съдържат текст или идентификатори", () => {
  const m = buildAnalysisVerification({ ...BASE, quoteRejected: 1, sourceTextHash: "abc123" });
  const json = JSON.stringify(m);
  assertEquals(json.includes("Изпълнителят"), false);
  assertEquals(m.source_text_hash, "abc123");
});

Deno.test("кеш: липсващи, стари и повредени метаданни не са доверени", () => {
  assertEquals(isTrustedCachedVerification(undefined), false);
  assertEquals(isTrustedCachedVerification(null), false);
  assertEquals(isTrustedCachedVerification("evidence_checked"), false);
  assertEquals(isTrustedCachedVerification([]), false);
  assertEquals(isTrustedCachedVerification({ version: 0, status: "evidence_checked" }), false);
  assertEquals(isTrustedCachedVerification({ version: 1, status: "clean" }), false);
  assertEquals(
    isTrustedCachedVerification({ version: 1, status: "incomplete", reason_codes: {}, counts: {}, score_trusted: false }),
    false,
  );
});

Deno.test("кеш: валидни метаданни са доверени", () => {
  assertEquals(isTrustedCachedVerification(buildAnalysisVerification(BASE)), true);
  assertEquals(
    isTrustedCachedVerification(buildAnalysisVerification({ ...BASE, quoteRejected: 1 })),
    true,
  );
});

Deno.test("валидност на модел-оценката", () => {
  assertEquals(isValidModelScore(7), true);
  assertEquals(isValidModelScore(0), false);
  assertEquals(isValidModelScore(11), false);
  assertEquals(isValidModelScore(6.5), false);
  assertEquals(isValidModelScore("8"), false);
  assertEquals(isValidModelScore(NaN), false);
  assertEquals(isValidModelScore(null), false);
});
