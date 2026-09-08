// Q2a — синтетични тестове (без жив LLM, без база, без клиентски данни).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isTrustedCachedVerification,
  isValidModelScore,
  NEUTRAL_INCOMPLETE_SUMMARY,
  normalizeEvidenceText,
  runAnalysisEvidencePipeline,
  validateAnalysisVerification,
  verifyQuoteAgainstSource,
} from "./analysis-evidence.ts";
import { VERIFICATION_FIXTURES } from "./analysis-evidence.fixtures.ts";

const SRC =
  "Наемателят дължи наем в размер на 1 200,00 EUR месечно. Наемодателят не дължи неустойка при забава. Срокът на договора е 12 месеца.";
const NORM = normalizeEvidenceText(SRC);

const alwaysMissing = () => true;
const neverMissing = () => false;

function issue(over: Record<string, unknown> = {}) {
  return {
    severity: "high",
    title: "Липса на неустойка за наемодателя",
    clause: "Наемодателят не дължи неустойка при забава.",
    explanation: "Клаузата освобождава едната страна от отговорност.",
    ...over,
  };
}

function run(parsed: unknown, opts: { truncated?: boolean; missingFn?: typeof alwaysMissing } = {}) {
  return runAnalysisEvidencePipeline({
    parsed,
    sentText: SRC,
    normalizedSource: SRC.toLowerCase(),
    inputTruncated: opts.truncated ?? false,
    isClauseActuallyMissing: opts.missingFn ?? alwaysMissing,
  });
}

function goodDoc(over: Record<string, unknown> = {}) {
  return {
    summary: "Договор за наем с ясни страни и срок.",
    score: 6,
    contract_type: "Договор за наем",
    issues: [issue()],
    missing_clauses: [{ name: "Форсмажор", why: "Липсва уредба при непреодолима сила." }],
    ...over,
  };
}

// --- нормализация и цитатна проверка --------------------------------------

Deno.test("точен непрекъснат цитат се приема", () => {
  assertEquals(verifyQuoteAgainstSource("Наемодателят не дължи неустойка при забава.", NORM).verified, true);
});

Deno.test("различно празно място и NBSP не пречат", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемодателят   не\u00A0дължи\nнеустойка при забава.", NORM).verified,
    true,
  );
});

Deno.test("различни форми кавички съвпадат", () => {
  const src = normalizeEvidenceText('Страната „Изпълнител" носи пълна отговорност за вредите.');
  assertEquals(
    verifyQuoteAgainstSource('Страната "Изпълнител" носи пълна отговорност за вредите.', src).verified,
    true,
  );
});

Deno.test("разпръснати думи (torba s dumi) се отхвърлят", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемодателят неустойка договора месеца забава дължи", NORM).verified,
    false,
  );
});

Deno.test("обърнат словоред се отхвърля", () => {
  assertEquals(
    verifyQuoteAgainstSource("При забава не дължи неустойка Наемодателят.", NORM).verified,
    false,
  );
});

Deno.test("премахнато отрицание се отхвърля", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемодателят дължи неустойка при забава напълно.", NORM).verified,
    false,
  );
});

Deno.test("променена сума се отхвърля", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемателят дължи наем в размер на 2 200,00 EUR месечно.", NORM).verified,
    false,
  );
});

Deno.test("сменен десетичен разделител се отхвърля", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемателят дължи наем в размер на 1 200.00 EUR месечно.", NORM).verified,
    false,
  );
});

Deno.test("сменена валута се отхвърля", () => {
  assertEquals(
    verifyQuoteAgainstSource("Наемателят дължи наем в размер на 1 200,00 BGN месечно.", NORM).verified,
    false,
  );
});

Deno.test("горен индекс НЕ се разгъва в цифра (без NFKC)", () => {
  const src = normalizeEvidenceText("Съгласно приложение 1\u00B2 страните уреждат допълнителните разходи.");
  // NFKC би превърнал „1²" в „12" и фалшиво би съвпаднал с „12".
  assertEquals(
    verifyQuoteAgainstSource("Съгласно приложение 12 страните уреждат допълнителните разходи.", src).verified,
    false,
  );
  assertEquals(
    verifyQuoteAgainstSource("Съгласно приложение 1\u00B2 страните уреждат допълнителните разходи.", src).verified,
    true,
  );
});

Deno.test("съвместимостна дроб не се нормализира", () => {
  const src = normalizeEvidenceText("Дължимата част е \u00BD от общата стойност по договора между страните.");
  assertEquals(
    verifyQuoteAgainstSource("Дължимата част е 1/2 от общата стойност по договора между страните.", src).verified,
    false,
  );
});

Deno.test("къс, дълъг, празен и нестрингов цитат са непроверени", () => {
  assertEquals(verifyQuoteAgainstSource("къс цитат", NORM).reason, "too_short");
  assertEquals(verifyQuoteAgainstSource("", NORM).reason, "too_short");
  assertEquals(verifyQuoteAgainstSource(null, NORM).reason, "not_a_string");
  assertEquals(verifyQuoteAgainstSource(42, NORM).reason, "not_a_string");
  assertEquals(verifyQuoteAgainstSource("а".repeat(281), NORM).reason, "too_long");
});

// --- конвейер --------------------------------------------------------------

Deno.test("напълно обоснован анализ е evidence_checked и пази находката", () => {
  const r = run(goodDoc());
  assertEquals(r.verification.status, "evidence_checked");
  assertEquals(r.verification.score_trusted, true);
  assertEquals(r.issues.length, 1);
  assertEquals(r.score, 6);
  assertEquals(r.summary, "Договор за наем с ясни страни и срок.");
});

Deno.test("реална висока тежест се запазва и таванът на оценката важи", () => {
  const r = run(goodDoc({ score: 10 }));
  assertEquals(r.issues[0].severity, "high");
  assertEquals(r.score, 6); // 1 high → таван 6
});

Deno.test("непроверен цитат прави анализа непълен и НЕ вдига оценката", () => {
  const base = run(goodDoc({ score: 4 }));
  const r = run(goodDoc({
    score: 4,
    issues: [issue(), issue({ clause: "Изпълнителят се задължава да плати 5 000 EUR неустойка." })],
  }));
  assertEquals(r.verification.status, "incomplete");
  assertEquals(r.verification.reason_codes.includes("quote_unverified"), true);
  assertEquals(r.issues.length, 1);
  assertEquals(r.score <= base.score, true);
  assertEquals(r.verification.score_trusted, false);
});

Deno.test("находка с валиден цитат, но липсваща тежест/заглавие, не е evidence_checked", () => {
  for (const bad of [
    issue({ severity: undefined }),
    issue({ severity: "critical" }),
    issue({ title: "  " }),
    issue({ explanation: undefined }),
    issue({ title: "x".repeat(400) }),
  ]) {
    const r = run(goodDoc({ issues: [bad] }));
    assertEquals(r.verification.status, "incomplete");
    assertEquals(r.verification.reason_codes.includes("issue_malformed"), true);
    assertEquals(r.issues.length, 0);
  }
});

Deno.test("null / число / масив като находка не хвърля и се отчита", () => {
  const r = run(goodDoc({ issues: [null, 42, [], issue()] }));
  assertEquals(r.issues.length, 1);
  assertEquals(r.verification.counts.issues_raw, 4);
  assertEquals(r.verification.counts.issues_rejected, 3);
  assertEquals(r.verification.status, "incomplete");
});

Deno.test("missing_clauses: [null, {}, 42] се отхвърлят като невалидни", () => {
  const r = run(goodDoc({ missing_clauses: [null, {}, 42] }));
  assertEquals(r.missingClauses.length, 0);
  assertEquals(r.verification.reason_codes.includes("missing_clause_malformed"), true);
  assertEquals(r.verification.status, "incomplete");
  assertEquals(r.verification.counts.missing_rejected, 3);
});

Deno.test("липсваща клауза без обяснение 'why' се отхвърля (undefined/null/празно)", () => {
  for (const why of [undefined, null, "", "   ", "\n\t", 42, {}]) {
    const bad: Record<string, unknown> = { name: "Форсмажор" };
    if (why !== undefined) bad.why = why;
    const r = run(goodDoc({
      missing_clauses: [bad, { name: "Конфиденциалност", why: "Няма защита на търговската тайна." }],
    }));
    // Отхвърля се само дефектната клауза; истинската препоръка се запазва.
    assertEquals(r.missingClauses.length, 1, JSON.stringify(why));
    assertEquals((r.missingClauses[0] as { name: string }).name, "Конфиденциалност");
    assertEquals(r.verification.counts.missing_raw, 2);
    assertEquals(r.verification.counts.missing_kept, 1);
    assertEquals(r.verification.counts.missing_rejected, 1);
    assertEquals(r.verification.reason_codes.includes("missing_clause_malformed"), true);
    assertEquals(r.verification.status, "incomplete");
    assertEquals(r.verification.score_trusted, false);
    // Валидните находки с цитат остават видими.
    assertEquals(r.issues.length, 1);
  }
});

Deno.test("липсваща клауза с непразно name И why се запазва напълно", () => {
  const r = run(goodDoc({
    missing_clauses: [{ name: "Форсмажор", why: "Липсва уредба при непреодолима сила." }],
  }));
  assertEquals(r.missingClauses.length, 1);
  assertEquals(r.verification.counts.missing_rejected, 0);
  assertEquals(r.verification.reason_codes.includes("missing_clause_malformed"), false);
  assertEquals(r.verification.status, "evidence_checked");
});

Deno.test("прекалено дълго 'why' също е дефектна клауза", () => {
  const r = run(goodDoc({
    missing_clauses: [{ name: "Форсмажор", why: "я".repeat(2001) }],
  }));
  assertEquals(r.missingClauses.length, 0);
  assertEquals(r.verification.reason_codes.includes("missing_clause_malformed"), true);
});

Deno.test("филтрирана липсваща клауза (намерен синоним) дава непълнота", () => {
  const r = run(goodDoc(), { missingFn: neverMissing });
  assertEquals(r.verification.reason_codes.includes("missing_clause_filtered"), true);
  assertEquals(r.missingClauses.length, 0);
});

Deno.test("невалиден корен, липсващи масиви и празно резюме → incomplete без зелен резултат", () => {
  for (const bad of [null, 42, "текст", [], {}, goodDoc({ issues: "не е масив" }), goodDoc({ summary: "" })]) {
    const r = run(bad);
    assertEquals(r.verification.status, "incomplete");
    assertEquals(r.verification.score_trusted, false);
    assertEquals(r.summary, NEUTRAL_INCOMPLETE_SUMMARY);
  }
});

Deno.test("невалидна оценка → неутрална стойност, недоверена", () => {
  for (const bad of [0, 11, 7.5, NaN, Infinity, "8", null, undefined]) {
    const r = run(goodDoc({ score: bad }));
    assertEquals(r.verification.reason_codes.includes("score_invalid"), true);
    assertEquals(r.verification.score_trusted, false);
    assertEquals(r.score, 5);
  }
});

Deno.test("съкратен вход винаги е непълен", () => {
  const r = run(goodDoc(), { truncated: true });
  assertEquals(r.verification.status, "incomplete");
  assertEquals(r.verification.reason_codes.includes("input_truncated"), true);
});

Deno.test("маркерът за съкращаване не е доказателство", () => {
  const marker = "\n\n[...текстът е съкратен поради дължина...]";
  assertEquals(
    verifyQuoteAgainstSource("[...текстът е съкратен поради дължина...]", normalizeEvidenceText(SRC)).verified,
    false,
  );
  // Ако маркерът беше част от sentText, цитатът щеше да съвпадне — затова се изключва.
  assertEquals(
    verifyQuoteAgainstSource("[...текстът е съкратен поради дължина...]", normalizeEvidenceText(SRC + marker)).verified,
    true,
  );
});

Deno.test("при непълнота резюмето е системно и неутрално, а находките се пазят", () => {
  const r = run(goodDoc({
    summary: "Договорът е напълно безопасен за подпис.",
    issues: [issue(), issue({ clause: "Измислен пасаж, който не е в договора никъде." })],
  }));
  assertEquals(r.summary, NEUTRAL_INCOMPLETE_SUMMARY);
  assertEquals(r.summary.includes("безопасен за подпис"), false);
  assertEquals(r.issues.length, 1);
});

Deno.test("броевете винаги се сглобяват: raw = kept + rejected", () => {
  const r = run(goodDoc({ issues: [issue(), null, issue({ clause: "нещо друго и по-дълго от двайсет знака" })] }));
  const c = r.verification.counts;
  assertEquals(c.issues_raw, c.issues_kept + c.issues_rejected);
  assertEquals(c.missing_raw, c.missing_kept + c.missing_rejected);
});

Deno.test("метаданните не съдържат текст, цитати или идентификатори", () => {
  const r = run(goodDoc());
  const json = JSON.stringify(r.verification);
  assertEquals(json.includes("Наемодател"), false);
  assertEquals(json.includes("Форсмажор"), false);
  assertEquals(Object.keys(r.verification).sort().join(","), "counts,reason_codes,score_trusted,status,version");
});

// --- строгата схема на метаданните (общ набор случаи с фронтенда) ----------

Deno.test("строгият валидатор дава очаквания резултат по общия набор случаи", () => {
  for (const f of VERIFICATION_FIXTURES) {
    const ok = validateAnalysisVerification(f.value) !== null;
    assertEquals(ok, f.valid, f.name);
    assertEquals(isTrustedCachedVerification(f.value), f.valid, f.name);
  }
});

Deno.test("оценката е цяло число 1..10", () => {
  assertEquals(isValidModelScore(1), true);
  assertEquals(isValidModelScore(10), true);
  assertEquals(isValidModelScore(0), false);
  assertEquals(isValidModelScore(11), false);
  assertEquals(isValidModelScore(6.5), false);
  assertEquals(isValidModelScore(NaN), false);
  assertEquals(isValidModelScore("6"), false);
});

Deno.test("резултатът от конвейера винаги минава строгата схема", () => {
  for (const p of [goodDoc(), goodDoc({ score: 99 }), null, goodDoc({ issues: [null] })]) {
    const r = run(p);
    assertEquals(validateAnalysisVerification(r.verification) !== null, true);
  }
});
