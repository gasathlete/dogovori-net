/**
 * Q4b — регресии за поверителния типизиран договор за НАМЕРЕНИЕТО.
 *
 * Никакви реални лични данни, никаква мрежа, никаква база. Ключът е ФИКСИРАН
 * фалшив секрет само за теста.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildIntentAssertions,
  canonicalAmount,
  canonicalDate,
  canonicalIntentValue,
  canonicalizeIntentAssertions,
  computeIntentCommitment,
  extractIntentDrafts,
  hasIntentMismatch,
  intentMismatchChecks,
  intentMismatchIssues,
  MAX_INTENT_ASSERTIONS,
  validateIntentAssertions,
  verifyIntentAssertions,
  type IntentAssertion,
} from "./intent-assertions.ts";

const SECRET = "test-only-fake-server-secret-0123456789";
const OTHER_SECRET = "test-only-DIFFERENT-server-secret-9876543210";

// Валутата е точно съюзът от договора — иначе типът се разширява до `string`
// и типовата проверка на Deno гърми. Поведението в теста е непроменено.
const money = (amount: string, currency: "EUR" | "BGN" | "USD") =>
  ({ kind: "money", amount, currency } as const);

async function assertionsFor(
  drafts: Parameters<typeof buildIntentAssertions>[0]["drafts"],
  secret = SECRET,
) {
  return await buildIntentAssertions({ drafts, serverSecret: secret });
}

const verify = (assertions: readonly IntentAssertion[], documentText: string, secret = SECRET) =>
  verifyIntentAssertions({ assertions, documentText, serverSecret: secret });

// ---------------------------------------------------------------------------
// Канонична нормализация — материалните разлики се ПАЗЯТ
// ---------------------------------------------------------------------------

Deno.test("безобидните форматни варианти на сумата се нормализират еднакво", () => {
  const same = ["1000", "1 000", "1,000", "1.000", "1000.00", "1000,00", "01000"];
  const set = new Set(same.map((s) => canonicalAmount(s)));
  assertEquals(set.size, 1, `очаква се една канонична форма, получено: ${[...set]}`);
  assertEquals([...set][0], "1000");

  assertEquals(canonicalAmount("1000,50"), "1000.5");
  assertEquals(canonicalAmount("1 000,50"), "1000.5");
  assertEquals(canonicalAmount("1,000.50"), "1000.5");
  assertEquals(canonicalAmount("1.000,50"), "1000.5");
});

Deno.test("двусмислен или невалиден числов вход НЕ дава канонична стойност", () => {
  for (const bad of ["", "abc", "1,0000", "1.2.3", "1,23,456", "-5", "1000 лв", "1..2"]) {
    assertEquals(canonicalAmount(bad), null, `трябваше да е отказано: ${bad}`);
  }
});

Deno.test("1000 и 10000 НИКОГА не се сливат", () => {
  assertNotEquals(canonicalAmount("1 000"), canonicalAmount("10 000"));
  assertEquals(canonicalAmount("10 000"), "10000");
});

Deno.test("EUR и BGN са РАЗЛИЧНИ канонични стойности и различни commitment-и", async () => {
  const eur = canonicalIntentValue(money("1000", "EUR"))!;
  const bgn = canonicalIntentValue(money("1000", "лв."))!;
  assertNotEquals(eur, bgn);
  const a = await computeIntentCommitment({ slot: "money.price", canonical: eur, serverSecret: SECRET });
  const b = await computeIntentCommitment({ slot: "money.price", canonical: bgn, serverSecret: SECRET });
  assertNotEquals(a, b);
});

Deno.test("10 дни, 10 месеца и 10 години са РАЗЛИЧНИ", () => {
  const d = canonicalIntentValue({ kind: "duration", count: 10, unit: "дни" as never });
  const m = canonicalIntentValue({ kind: "duration", count: 10, unit: "месеца" as never });
  const y = canonicalIntentValue({ kind: "duration", count: 10, unit: "години" as never });
  assertEquals(new Set([d, m, y]).size, 3);
  assertEquals(d, "duration|10|day");
});

Deno.test("посоката/отрицанието са материални: купувач ≠ продавач, true ≠ false", () => {
  assertNotEquals(
    canonicalIntentValue({ kind: "party_role", side: "a", role: "buyer" }),
    canonicalIntentValue({ kind: "party_role", side: "a", role: "seller" }),
  );
  assertNotEquals(
    canonicalIntentValue({ kind: "party_role", side: "a", role: "buyer" }),
    canonicalIntentValue({ kind: "party_role", side: "b", role: "buyer" }),
  );
  assertNotEquals(
    canonicalIntentValue({ kind: "flag", name: "bilingual", value: true }),
    canonicalIntentValue({ kind: "flag", name: "bilingual", value: false }),
  );
});

Deno.test("датите се нормализират до ISO, невалидните се отказват", () => {
  assertEquals(canonicalDate("01.03.2026"), "2026-03-01");
  assertEquals(canonicalDate("2026-03-01"), "2026-03-01");
  assertEquals(canonicalDate("1 март 2026 г."), "2026-03-01");
  assertEquals(canonicalDate("31.02.2026"), null);
  assertEquals(canonicalDate("някой ден"), null);
});

// ---------------------------------------------------------------------------
// Проверка срещу реалния документ
// ---------------------------------------------------------------------------

const BG_DOC = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "Днес между ВЪЗЛОЖИТЕЛЯ и ИЗПЪЛНИТЕЛЯ се сключи следният договор.",
  "Чл. 1 Предмет: изработка на уеб сайт.",
  "Чл. 2 Цена: Възнаграждението е 1 000,00 EUR без ДДС.",
  "Чл. 3 Срок: Срокът на договора е 30 дни от подписването.",
  "Чл. 4 Начало: Договорът влиза в сила на 01.03.2026 г.",
].join("\n\n");

Deno.test("правилният BG документ ЗАДОВОЛЯВА твърденията", async () => {
  const a = await assertionsFor([
    { slot: "money.price", value: money("1000", "EUR") },
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
    { slot: "date.start", value: { kind: "date", iso: "2026-03-01" } },
  ]);
  const r = await verify(a, BG_DOC);
  assertEquals(r.checked, 3);
  assertEquals(r.satisfied, 3);
  assertEquals(hasIntentMismatch(r), false);
});

Deno.test("двуезичен документ (BG+EN) също задоволява твърденията", async () => {
  const bilingual = BG_DOC + "\n\nArticle 2 Price: The fee is 1,000.00 EUR excluding VAT." +
    "\n\nArticle 3 Term: The term is 30 days from signing.";
  const a = await assertionsFor([
    { slot: "money.price", value: money("1000", "EUR") },
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
  ]);
  const r = await verify(a, bilingual);
  assertEquals(r.satisfied, 2);
  assertEquals(hasIntentMismatch(r), false);
});

Deno.test("СМЕНЕНА валута в документа дава ДОКАЗАНО несъответствие", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const doc = BG_DOC.replace("1 000,00 EUR", "1 000,00 лв.");
  const r = await verify(a, doc);
  assertEquals(r.mismatched_required.length, 1);
  assertEquals(r.mismatched_required[0].slot, "money.price");
});

Deno.test("СМЕНЕНА сума (1000 → 10000) дава ДОКАЗАНО несъответствие", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const r = await verify(a, BG_DOC.replace("1 000,00 EUR", "10 000,00 EUR"));
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("сменена мерна единица (30 дни → 30 месеца) дава несъответствие", async () => {
  const a = await assertionsFor([
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
  ]);
  const r = await verify(a, BG_DOC.replace("30 дни", "30 месеца"));
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("ЛИПСВАЩА стойност в документа дава несъответствие, а не мълчание", async () => {
  const a = await assertionsFor([{ slot: "money.penalty", value: money("500", "EUR") }]);
  const doc = "Чл. 1 Предмет: изработка. Чл. 2 Страните уреждат отношенията си по ЗЗД.";
  const r = await verify(a, doc);
  assertEquals(r.mismatched_required.length, 1);
  assertEquals(r.mismatched_required[0].slot, "money.penalty");
});

Deno.test("ДРУГИ несвързани суми/дати НЕ задоволяват грешното твърдение", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const doc = "Чл. 1 Неустойка 500 EUR. Чл. 2 Депозит 2 000 лв. Чл. 3 Дата 05.05.2027 г.";
  const r = await verify(a, doc);
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("валидно твърдение НЕ поражда бележка само защото има и други суми", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const doc = BG_DOC + "\n\nЧл. 5 Неустойка: 500 EUR. Чл. 6 Депозит: 2 000 лв.";
  const r = await verify(a, doc);
  assertEquals(r.satisfied, 1);
  assertEquals(r.mismatched_required.length, 0);
});

Deno.test("посоката на ролите се проверява по РЕДА в документа", async () => {
  const ok = await assertionsFor([
    { slot: "party_role.a", value: { kind: "party_role", side: "a", role: "client" } },
    { slot: "party_role.b", value: { kind: "party_role", side: "b", role: "contractor" } },
  ]);
  assertEquals((await verify(ok, BG_DOC)).satisfied, 2);

  // Разменени роли — същият документ вече НЕ ги задоволява.
  const swapped = await assertionsFor([
    { slot: "party_role.a", value: { kind: "party_role", side: "a", role: "contractor" } },
    { slot: "party_role.b", value: { kind: "party_role", side: "b", role: "client" } },
  ]);
  const r = await verify(swapped, BG_DOC);
  assertEquals(r.mismatched_required.length, 2);
});

// ---------------------------------------------------------------------------
// Fail-closed
// ---------------------------------------------------------------------------

Deno.test("ПОДПРАВЕН commitment се проваля затворено", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const forged: IntentAssertion[] = [{ ...a[0], commitment: "f".repeat(64) }];
  const r = await verify(forged, BG_DOC);
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("commitment от ЧУЖД ключ не се приема", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }], OTHER_SECRET);
  const r = await verify(a, BG_DOC, SECRET);
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("commitment за ДРУГ слот не се преизползва (слотът влиза в HMAC-а)", async () => {
  const price = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const moved: IntentAssertion[] = [{ ...price[0], slot: "money.penalty" }];
  const r = await verify(moved, BG_DOC);
  assertEquals(r.mismatched_required.length, 1);
});

Deno.test("без сървърен ключ НЕ се твърди нищо (никакви фалшиви несъответствия)", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const r = await verifyIntentAssertions({ assertions: a, documentText: BG_DOC, serverSecret: null });
  assertEquals(r.checked, 0);
  assertEquals(hasIntentMismatch(r), false);
});

Deno.test("невалидна схема прави ЦЕЛИЯ набор недоверен (null), а празният е валиден", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  assertEquals(validateIntentAssertions([]), []);
  assertEquals(validateIntentAssertions(undefined), []);
  assertEquals(validateIntentAssertions([{ ...a[0], slot: "money.unknown" }]), null);
  assertEquals(validateIntentAssertions([{ ...a[0], kind: "date" }]), null);
  assertEquals(validateIntentAssertions([{ ...a[0], commitment: "zz" }]), null);
  assertEquals(validateIntentAssertions([{ ...a[0], required: "yes" }]), null);
  assertEquals(validateIntentAssertions("не е масив"), null);
  assertEquals(validateIntentAssertions(new Array(MAX_INTENT_ASSERTIONS + 1).fill(a[0])), null);
});

Deno.test("редът на твърденията е СТАБИЛЕН и не зависи от входния ред", async () => {
  const one = await assertionsFor([
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
    { slot: "money.price", value: money("1000", "EUR") },
  ]);
  const two = await assertionsFor([
    { slot: "money.price", value: money("1000", "EUR") },
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
  ]);
  assertEquals(canonicalizeIntentAssertions(one), canonicalizeIntentAssertions(two));
});

// ---------------------------------------------------------------------------
// Поверителност — нищо сурово в серизацията
// ---------------------------------------------------------------------------

Deno.test("серизираният набор НЕ съдържа сурови стойности или лични данни", async () => {
  const a = await assertionsFor([
    { slot: "money.price", value: money("1000", "EUR") },
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
    { slot: "date.start", value: { kind: "date", iso: "2026-03-01" } },
  ]);
  const serialized = JSON.stringify(a) + "\n" + canonicalizeIntentAssertions(a);
  for (const forbidden of ["1000", "1 000", "30", "2026-03-01", "2026", "Иван", "0888"]) {
    assert(
      !serialized.includes(forbidden),
      `изтекла сурова стойност в серизацията: ${forbidden}`,
    );
  }
  // Затворените метаданни СА допустими и очаквани.
  assert(serialized.includes("EUR"));
  assert(serialized.includes("day"));
});

Deno.test("бележките НЕ разкриват очакваната стойност", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const r = await verify(a, "Чл. 1 Предмет: услуга без посочена цена в текста на договора.");
  const issues = intentMismatchIssues(r);
  const checks = intentMismatchChecks(r);
  assertEquals(issues.length, 1);
  assertEquals(checks.length, 1);
  const all = JSON.stringify({ issues, checks });
  assert(!all.includes("1000"), "очакваната стойност не бива да се показва");
  assertEquals(issues[0].severity, "high");
  assertEquals(checks[0].status, "fail");
  assert(issues[0].title.includes("Несъответствие със заявеното"));
});

// ---------------------------------------------------------------------------
// Извличане САМО от недвусмислен структуриран вход
// ---------------------------------------------------------------------------

Deno.test("недвусмислените структурирани полета дават твърдения", async () => {
  const drafts = extractIntentDrafts({
    questions: [
      { id: "price", label: "Цена по договора" },
      { id: "term", label: "Срокът на договора" },
      { id: "start", label: "Начална дата" },
    ],
    answers: { price: "1 000 EUR", term: "30 дни", start: "01.03.2026" },
  });
  assertEquals(drafts.length, 3);
  const a = await assertionsFor(drafts);
  assertEquals((await verify(a, BG_DOC)).satisfied, 3);
});

Deno.test("двусмислен или неразпознат вход НЕ дава твърдение и НЕ дава фалшива бележка", async () => {
  const drafts = extractIntentDrafts({
    questions: [
      // Улучва и „наем", и „цена" → двусмислено, изпуска се.
      { id: "q1", label: "Наемна цена или цена за изкупуване" },
      // Свободна проза без разпознаваем формат.
      { id: "q2", label: "Други условия" },
      // Празен отговор.
      { id: "q3", label: "Неустойка" },
      // Без правило за слот.
      { id: "q4", label: "Име на страната" },
    ],
    answers: { q1: "по договаряне", q2: "както обичайно", q3: "", q4: "Иван Петров" },
  });
  assertEquals(drafts.length, 0);
  const r = await verify(await assertionsFor(drafts), BG_DOC);
  assertEquals(r.checked, 0);
  assertEquals(hasIntentMismatch(r), false);
});

Deno.test("един слот с ДВЕ различни стойности е двусмислен и се изпуска изцяло", async () => {
  const a = await assertionsFor([
    { slot: "money.price", value: money("1000", "EUR") },
    { slot: "money.price", value: money("2000", "EUR") },
  ]);
  assertEquals(a.length, 0);
});

Deno.test("флаговете се проверяват срещу СТРУКТУРНИ факти, не срещу текста", async () => {
  const a = await assertionsFor([
    { slot: "flag.bilingual", value: { kind: "flag", name: "bilingual", value: true }, required: false },
  ]);
  const good = await verifyIntentAssertions({
    assertions: a,
    documentText: BG_DOC,
    serverSecret: SECRET,
    structuralFlags: { bilingual: true },
  });
  assertEquals(good.satisfied, 1);

  const bad = await verifyIntentAssertions({
    assertions: a,
    documentText: BG_DOC,
    serverSecret: SECRET,
    structuralFlags: { bilingual: false },
  });
  assertEquals(bad.results[0].status, "mismatch");
  // Незадължителен флаг не блокира.
  assertEquals(bad.mismatched_required.length, 0);

  const noFacts = await verify(a, BG_DOC);
  assertEquals(noFacts.results[0].status, "unverifiable");
});

// ---------------------------------------------------------------------------
// Непрекъснатост при корекция / външни документи
// ---------------------------------------------------------------------------

Deno.test("корекция, която ПАЗИ стойността, запазва валидно доверие", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const corrected = BG_DOC.replace(
    "Чл. 2 Цена: Възнаграждението е 1 000,00 EUR без ДДС.",
    "Чл. 2 Цена и плащане: Възнаграждението е 1 000,00 EUR без ДДС, платимо по банков път.",
  );
  assertEquals((await verify(a, corrected)).satisfied, 1);
});

Deno.test("корекция, която ПРОМЕНЯ или МАХА стойността, не може да остане доверена", async () => {
  const a = await assertionsFor([{ slot: "money.price", value: money("1000", "EUR") }]);
  const changed = BG_DOC.replace("1 000,00 EUR", "1 500,00 EUR");
  assertEquals((await verify(a, changed)).mismatched_required.length, 1);
  const removed = BG_DOC.replace("Чл. 2 Цена: Възнаграждението е 1 000,00 EUR без ДДС.", "");
  assertEquals((await verify(a, removed)).mismatched_required.length, 1);
});

Deno.test("ВЪНШЕН документ без твърдения се анализира НЕЙТРАЛНО", async () => {
  const r = await verify([], "Външен договор, качен от потребителя, с произволно съдържание.");
  assertEquals(r.checked, 0);
  assertEquals(r.mismatched_required.length, 0);
  assertEquals(intentMismatchIssues(r).length, 0);
  assertEquals(intentMismatchChecks(r).length, 0);
});
