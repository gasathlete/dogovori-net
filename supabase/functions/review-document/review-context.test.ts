/**
 * Q2d — синтетични тестове за договора на ревизията.
 * Никакви реални AI повиквания и никакви реални потребителски данни.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildReviewClassificationCorpus,
  buildReviewRequest,
  computeReviewSourceDigest,
  isQuoteSupported,
  normalizeReviewResponse,
  redactReviewContext,
  REVIEW_TEXT_LIMIT,
  type ReviewRequest,
} from "./review-context.ts";
import { unredact } from "../_shared/redact.ts";
import { computeReviewSourceDigest as clientDigest } from "../../../src/lib/reviewSnapshot.ts";

const EMAIL = "review-person@example.invalid";
const OTHER_EMAIL = "second-person@example.invalid";
const IBAN = "BG18RZBB91550123456789";
const LONG = "Клауза за плащане в срок от 10 дни. ".repeat(20);

function body(over: Record<string, unknown> = {}) {
  return {
    documentText: `${LONG}\nПлащане по ${IBAN} на ${EMAIL}.`,
    documentTitle: "Договор за услуги",
    documentType: "dogovor-za-uslugi",
    documentVersion: "v1",
    context: { decisions: [{ label: "Срок", value: "12 месеца" }] },
    ignorePersonalData: true,
    ...over,
  };
}

function req(over: Record<string, unknown> = {}): ReviewRequest {
  const r = buildReviewRequest(body(over));
  assert(!("ok" in r), "заявката трябва да е валидна");
  return r as ReviewRequest;
}

Deno.test("валидна заявка запазва точния текст и решенията", () => {
  const r = req();
  assertEquals(r.documentTitle, "Договор за услуги");
  assertEquals(r.context?.decisions[0].value, "12 месеца");
  assertEquals(r.truncated, false);
  assertEquals(r.submittedText, r.documentText);
});

Deno.test("legacy заявка без контекст остава валидна", () => {
  const r = req({ context: undefined });
  assertEquals(r.context, null);
});

Deno.test("непознато поле или невалидно решение се отказва безопасно", () => {
  const bad = buildReviewRequest(body({ context: { jurisdiction: "BG", decisions: [] } }));
  assert("ok" in bad && bad.ok === false);
  const bad2 = buildReviewRequest(body({ context: { decisions: [{ label: "x", value: 5 }] } }));
  assert("ok" in bad2 && bad2.ok === false);
  const bad3 = buildReviewRequest(body({ documentText: "кратко" }));
  assert("ok" in bad3 && bad3.ok === false);
});

Deno.test("твърде дълъг вход се реже и се обявява явно", () => {
  const r = req({ documentText: "а".repeat(REVIEW_TEXT_LIMIT + 500) });
  assertEquals(r.truncated, true);
  assertEquals(r.submittedText.length, REVIEW_TEXT_LIMIT);
});

Deno.test("отпечатъкът се променя при промяна на клауза, сума, отрицание или контекст", async () => {
  const base = await computeReviewSourceDigest(req());
  assertEquals(base, await computeReviewSourceDigest(req()));
  assertNotEquals(base, await computeReviewSourceDigest(req({ documentText: `${LONG} 20 дни.` })));
  assertNotEquals(
    base,
    await computeReviewSourceDigest(req({ documentText: `${LONG}\nНЕ се плаща по ${IBAN}.` })),
  );
  assertNotEquals(base, await computeReviewSourceDigest(req({ documentTitle: "Друго заглавие" })));
  assertNotEquals(base, await computeReviewSourceDigest(req({ documentVersion: "v2" })));
  assertNotEquals(
    base,
    await computeReviewSourceDigest(req({ context: { decisions: [{ label: "Срок", value: "24 месеца" }] } })),
  );
});

Deno.test("една обща редакция: заглавие, вид, роля и решения нямат сурови данни", () => {
  const r = req({
    documentTitle: `Договор с ${EMAIL}`,
    context: { role: `Възложител ${OTHER_EMAIL}`, decisions: [{ label: "Плащане", value: IBAN }] },
  });
  const out = redactReviewContext(r, { redactionRequired: true });
  assert(out.ok);
  const outgoing = JSON.stringify(out.context);
  for (const v of [EMAIL, OTHER_EMAIL, IBAN]) {
    assert(!outgoing.includes(v), `изтекла стойност: ${v}`);
  }
  // Една и съща стойност → един плейсхолдър в текста и в решението.
  const ph = out.context.decisions[0].value;
  assert(out.context.text.includes(ph));
  assertNotEquals(out.context.role, "");
  // Различните стойности остават различни.
  assertNotEquals(out.context.title, out.context.role);
  assertEquals(unredact(out.context.title, out.mapping), `Договор с ${EMAIL}`);
  assertEquals(unredact(out.context.decisions[0].value, out.mapping), IBAN);
});

Deno.test("без изискана редакция контекстът е непроменен и мапингът е празен", () => {
  const r = req();
  const out = redactReviewContext(r, { redactionRequired: false });
  assert(out.ok);
  assertEquals(out.redactionApplied, false);
  assertEquals(out.mapping, {});
  assertEquals(out.context.title, r.documentTitle);
});

Deno.test("резервиран плейсхолдър или служебен разделител се отказва безопасно", () => {
  const a = redactReviewContext(req({ documentTitle: "Договор <EMAIL_1>" }), { redactionRequired: true });
  assertEquals(a.ok, false);
  const b = redactReviewContext(
    req({ context: { decisions: [{ label: "x", value: "а \u241E\u241E\u241E б" }] } }),
    { redactionRequired: true },
  );
  assertEquals(b.ok, false);
});

Deno.test("корпусът за класификация покрива ЦЕЛИЯ изходящ контекст", () => {
  const r = req({
    documentTitle: `Договор с ${EMAIL}`,
    context: { role: "Възложител", decisions: [{ label: "Плащане", value: IBAN }] },
  });
  const corpus = buildReviewClassificationCorpus(r);
  assert(corpus.includes(EMAIL));
  assert(corpus.includes(IBAN));
  assert(corpus.includes("Възложител"));
});

Deno.test("отрязан вход никога не изглежда готов", () => {
  const r = req({ documentText: "а".repeat(REVIEW_TEXT_LIMIT + 10) });
  const n = normalizeReviewResponse({
    parsed: { verdict: "ready", confidence: 95, summary: "Готово", checks: [] },
    truncated: r.truncated,
    submittedText: r.submittedText,
  });
  assertEquals(n.completeness.status, "incomplete");
  assertNotEquals(n.verdict, "ready");
  assert(n.confidence <= 40);
  assert(n.completeness.reasons.includes("input_truncated"));
});

Deno.test("нечетим отговор е непълен, не чист", () => {
  const n = normalizeReviewResponse({ parsed: "не е обект", truncated: false, submittedText: "текст" });
  assertEquals(n.completeness.status, "incomplete");
  assertNotEquals(n.verdict, "ready");
});

Deno.test("противоречие без откъс от текста се отхвърля, доказаните остават", () => {
  const source = "Възнаграждението е 1 200,50 EUR и НЕ се дължи предварително.";
  const n = normalizeReviewResponse({
    parsed: {
      verdict: "ready",
      confidence: 90,
      summary: "Проверено",
      checks: [{ label: "Реквизити", status: "pass" }],
      contradictions: [
        { detail: "Сумата е противоречива", quote: "1 200,50 EUR" },
        { detail: "Измислено твърдение", quote: "плаща се предварително" },
        { detail: "Без откъс" },
      ],
    },
    truncated: false,
    submittedText: source,
  });
  assertEquals(n.contradictions.length, 1);
  assertEquals(n.contradictions[0].quote, "1 200,50 EUR");
  assertEquals(n.completeness.status, "partial");
  assertNotEquals(n.verdict, "ready");
  assert(n.confidence <= 70);
});

Deno.test("пълен и доказан отговор запазва готовата присъда", () => {
  const source = "Страните се съгласяват срок 12 месеца.";
  const n = normalizeReviewResponse({
    parsed: {
      verdict: "ready",
      confidence: 88,
      summary: "Няма отчетени пропуски",
      checks: [{ label: "Срок", status: "pass" }],
      contradictions: [{ detail: "Срокът е двусмислен", quote: "срок 12 месеца" }],
      legal_basis: [{ act: "ЗЗД", article: "чл. 20" }],
    },
    truncated: false,
    submittedText: source,
  });
  assertEquals(n.completeness.status, "complete");
  assertEquals(n.verdict, "ready");
  assertEquals(n.legal_basis.length, 1);
});

Deno.test("проверката на откъс е нечувствителна само към празнини и регистър", () => {
  const src = "Плаща се   1 200,50 EUR в срок.";
  assert(isQuoteSupported("плаща се 1 200,50 eur", src));
  assertEquals(isQuoteSupported("плаща се 1 300,50 EUR", src), false);
  assertEquals(isQuoteSupported("", src), false);
  assertEquals(isQuoteSupported(42, src), false);
});

Deno.test("браузърният помощник дава ТОЧНО същия отпечатък като edge функцията", async () => {
  const b = body();
  const server = await computeReviewSourceDigest(req());
  const client = await clientDigest({
    documentText: b.documentText as string,
    documentTitle: b.documentTitle as string,
    documentType: b.documentType as string,
    documentVersion: b.documentVersion as string,
    context: b.context as { decisions: Array<{ label: string; value: string }> },
    ignorePersonalData: true,
  });
  assertEquals(client, server);
});
