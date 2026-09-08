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
  restoreLeaves,
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

const FULL_CHECKS = [
  { id: "forma_i_deystvitelnost", label: "Форма и действителност", status: "pass" },
  { id: "strani", label: "Страни", status: "pass" },
  { id: "predmet", label: "Предмет", status: "pass" },
  { id: "cena", label: "Цена", status: "pass" },
  { id: "srok", label: "Срок", status: "pass" },
  { id: "podpisi", label: "Подписи", status: "pass" },
];

function fullBody(over: Record<string, unknown> = {}) {
  return {
    verdict: "ready",
    confidence: 90,
    summary: "Няма отчетени пропуски",
    checks: FULL_CHECKS,
    missing_requisites: [],
    unfilled_fields: [],
    contradictions: [],
    legal_basis: [{ act: "ЗЗД", article: "чл. 20" }],
    ...over,
  };
}

Deno.test("противоречие без откъс от текста се отхвърля, доказаните остават", () => {
  const source = "Възнаграждението е 1 200,50 EUR и НЕ се дължи предварително.";
  const n = normalizeReviewResponse({
    parsed: fullBody({
      contradictions: [
        { detail: "Сумата е противоречива", quote: "1 200,50 EUR" },
        { detail: "Измислено твърдение", quote: "плаща се предварително" },
        { detail: "Без откъс" },
      ],
    }),
    truncated: false,
    submittedText: source,
  });
  assertEquals(n.contradictions.length, 1);
  assertEquals(n.contradictions[0].quote, "1 200,50 EUR");
  assertEquals(n.completeness.status, "partial");
  assertNotEquals(n.verdict, "ready");
  assert(n.confidence <= 70);
  assert(n.summary.includes("Показани са наличните констатации"));
});

Deno.test("пълен отговор без находки запазва готовата присъда", () => {
  const n = normalizeReviewResponse({
    parsed: fullBody(),
    truncated: false,
    submittedText: "Страните се съгласяват срок 12 месеца.",
  });
  assertEquals(n.completeness.status, "complete");
  assertEquals(n.verdict, "ready");
  assertEquals(n.summary, "Няма отчетени пропуски");
  assertEquals(n.legal_basis.length, 1);
});

Deno.test("оскъдно готово без задължителните структури не остава готово", () => {
  const n = normalizeReviewResponse({
    parsed: { verdict: "ready", confidence: 99, summary: "Всичко е наред", checks: [{ label: "Едно", status: "pass" }] },
    truncated: false,
    submittedText: "Страните се съгласяват срок 12 месеца и цена 1 000 EUR.",
  });
  assertNotEquals(n.verdict, "ready");
  assertEquals(n.completeness.status, "incomplete");
  assert(n.completeness.reasons.includes("form_check_missing"));
  assert(n.completeness.reasons.includes("legal_basis_missing"));
  assert(n.completeness.reasons.includes("missing_requisites_missing"));
  assert(n.summary !== "Всичко е наред");
  assert(n.confidence <= 40);
});

Deno.test("готово с провалена проверка или с пропуски се сваля", () => {
  const failed = normalizeReviewResponse({
    parsed: fullBody({
      checks: [...FULL_CHECKS.slice(1), { id: "forma_i_deystvitelnost", label: "Форма", status: "fail" }],
    }),
    truncated: false,
    submittedText: "Страните се съгласяват срок 12 месеца.",
  });
  assertNotEquals(failed.verdict, "ready");

  const gaps = normalizeReviewResponse({
    parsed: fullBody({ missing_requisites: ["Липсва дата"] }),
    truncated: false,
    submittedText: "Страните се съгласяват срок 12 месеца.",
  });
  assertEquals(gaps.verdict, "needs_fixes");
  assert(gaps.completeness.reasons.includes("ready_with_gaps"));
});

Deno.test("нечетими записи в масивите се отчитат, не се крият", () => {
  const n = normalizeReviewResponse({
    parsed: fullBody({
      missing_requisites: ["Липсва дата", 5, null],
      legal_basis: [{ act: "ЗЗД" }, { article: "чл. 9" }, "не е обект"],
      contradictions: [{ detail: 7 }],
    }),
    truncated: false,
    submittedText: "Страните се съгласяват срок 12 месеца.",
  });
  assertEquals(n.missing_requisites, ["Липсва дата"]);
  assertEquals(n.legal_basis.length, 1);
  assert(n.completeness.reasons.includes("missing_requisites_malformed"));
  assert(n.completeness.reasons.includes("legal_basis_malformed"));
  assert(n.completeness.reasons.includes("contradiction_malformed"));
  assertNotEquals(n.verdict, "ready");
});

Deno.test("рязан вход прави проверката непълна с неутрално обобщение", () => {
  const n = normalizeReviewResponse({
    parsed: fullBody(),
    truncated: true,
    submittedText: "Страните се съгласяват срок 12 месеца.",
  });
  assertEquals(n.completeness.status, "incomplete");
  assert(n.completeness.reasons.includes("input_truncated"));
  assertNotEquals(n.verdict, "ready");
  assert(n.summary.includes("Показани са наличните констатации"));
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

Deno.test("каноничният източник не се преправя чрез разделители", async () => {
  const a = req({ context: { decisions: [{ label: "a=b", value: "c" }] } });
  const b = req({ context: { decisions: [{ label: "a", value: "b=c" }] } });
  assertNotEquals(await computeReviewSourceDigest(a), await computeReviewSourceDigest(b));

  const c1 = req({ context: { decisions: [{ label: "Срок", value: "12" }, { label: "Цена", value: "5" }] } });
  const c2 = req({ context: { decisions: [{ label: "Срок", value: "12\u0000Цена\u0000" }, { label: "x", value: "5" }] } });
  assertNotEquals(await computeReviewSourceDigest(c1), await computeReviewSourceDigest(c2));

  const withSep = req({ documentTitle: "Договор\u241E\u0000таен" });
  assertNotEquals(await computeReviewSourceDigest(withSep), await computeReviewSourceDigest(req()));
});

Deno.test("златен отпечатък: браузър и edge съвпадат при кавички и контролни знаци", async () => {
  const tricky = {
    documentText: `Клауза „А" гласи: сумата е 1 200,50 EUR.\nВтора\tклауза с \\ обратна черта.${"x".repeat(60)}`,
    documentTitle: 'Договор "Алфа" \\ ООД',
    documentType: "dogovor-za-uslugi",
    documentVersion: "v2",
    context: { role: "Изпълнител", decisions: [{ label: 'Цена "нето"', value: "1 200,50 EUR\\месец" }] },
    ignorePersonalData: true,
  };
  const built = buildReviewRequest(tricky);
  assert(!("ok" in built));
  const server = await computeReviewSourceDigest(built as ReviewRequest);
  const client = await clientDigest(tricky);
  assertEquals(client, server);
});

Deno.test("възстановяването по листа не се чупи от кавички и контролни знаци", () => {
  const mapping = { "<EMAIL_1>": 'ко"нтакт\\т\u0007@пример' };
  const parsed = {
    summary: "Плати на <EMAIL_1>",
    checks: [{ label: "<EMAIL_1>", status: "warn", note: "виж <EMAIL_1>" }],
    nested: { list: ["<EMAIL_1>", 5, null, true] },
  };
  const restored = restoreLeaves(parsed, mapping, unredact) as typeof parsed;
  assertEquals(restored.summary, `Плати на ${mapping["<EMAIL_1>"]}`);
  assertEquals(restored.checks[0].label, mapping["<EMAIL_1>"]);
  assertEquals(restored.nested.list[0], mapping["<EMAIL_1>"]);
  assertEquals(restored.nested.list[1], 5);
  // Ключовете на обектите остават непроменени.
  assertEquals(Object.keys(restored).sort(), ["checks", "nested", "summary"]);
});
