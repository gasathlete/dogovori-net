/**
 * Q4b корекции — регресии за:
 *  1) СЛОТОВО обвързване: идентична канонична стойност в ДРУГ слот НЕ
 *     удовлетворява твърдението;
 *  2) НАБЛЮДАВАНИ структурни факти (двуезичност/арбитраж) от РЕЗУЛТАТА;
 *  3) непрекъснатост на подписаното ОЧАКВАНО намерение през корекция;
 *  4) извличане с висока увереност от известните полета `term`/`prices`.
 *
 * Без мрежа, без база, без лични данни. Ключът е фиксиран тестов секрет.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildIntentAssertions,
  detectArbitrationInText,
  detectBilingualStructure,
  extractIntentDrafts,
  verifyIntentAssertions,
  type IntentAssertion,
  type IntentSlot,
} from "./intent-assertions.ts";

const SECRET = "test-only-fake-server-secret-0123456789";

const assertionsFor = (drafts: Parameters<typeof buildIntentAssertions>[0]["drafts"]) =>
  buildIntentAssertions({ drafts, serverSecret: SECRET });

const verify = (
  assertions: readonly IntentAssertion[],
  documentText: string,
  structuralFlags?: { bilingual?: boolean; arbitration?: boolean },
) => verifyIntentAssertions({ assertions, documentText, serverSecret: SECRET, structuralFlags });

const status = async (
  assertions: readonly IntentAssertion[],
  text: string,
): Promise<string> => (await verify(assertions, text)).results[0].status;

const PAD =
  "\n\nЧл. 90 Общи разпоредби: За неуредените въпроси се прилагат разпоредбите на " +
  "действащото българско законодателство, включително ЗЗД и ТЗ.\n";

// ---------------------------------------------------------------------------
// 1) Еднаква стойност в ГРЕШЕН слот — за всеки поддържан слот
// ---------------------------------------------------------------------------

const MONEY_CASES: Array<{ slot: IntentSlot; wrong: string }> = [
  { slot: "money.price", wrong: "Чл. 5 Неустойка: Неустойката е 1 000,00 EUR." },
  { slot: "money.rent", wrong: "Чл. 5 Депозит: Депозитът е 1 000,00 EUR." },
  { slot: "money.penalty", wrong: "Чл. 2 Цена: Възнаграждението е 1 000,00 EUR." },
  { slot: "money.deposit", wrong: "Чл. 3 Наем: Месечният наем е 1 000,00 EUR." },
];

for (const c of MONEY_CASES) {
  Deno.test(`СЪЩАТА сума в друг слот НЕ удовлетворява ${c.slot}`, async () => {
    const a = await assertionsFor([
      { slot: c.slot, value: { kind: "money", amount: "1000", currency: "EUR" } },
    ]);
    assertEquals(await status(a, c.wrong + PAD), "mismatch");
  });
}

const DURATION_CASES: Array<{ slot: IntentSlot; wrong: string }> = [
  { slot: "duration.term", wrong: "Чл. 4 Срок за плащане: Плащането се извършва в срок от 30 дни." },
  { slot: "duration.notice", wrong: "Чл. 6 Срок на договора: Срокът на договора е 30 дни." },
  { slot: "duration.payment", wrong: "Чл. 7 Предизвестие: Предизвестието е 30 дни." },
];

for (const c of DURATION_CASES) {
  Deno.test(`СЪЩИЯТ срок в друг слот НЕ удовлетворява ${c.slot}`, async () => {
    const a = await assertionsFor([
      { slot: c.slot, value: { kind: "duration", count: 30, unit: "day" } },
    ]);
    assertEquals(await status(a, c.wrong + PAD), "mismatch");
  });
}

const DATE_CASES: Array<{ slot: IntentSlot; wrong: string }> = [
  { slot: "date.start", wrong: "Чл. 1 Дата на подписване: Договорът е подписан на 01.03.2026 г." },
  { slot: "date.end", wrong: "Чл. 1 Начална дата: Договорът влиза в сила на 01.03.2026 г." },
  { slot: "date.signing", wrong: "Чл. 1 Крайна дата: Крайната дата е 01.03.2026 г." },
];

for (const c of DATE_CASES) {
  Deno.test(`СЪЩАТА дата в друг слот НЕ удовлетворява ${c.slot}`, async () => {
    const a = await assertionsFor([
      { slot: c.slot, value: { kind: "date", iso: "2026-03-01" } },
    ]);
    assertEquals(await status(a, c.wrong + PAD), "mismatch");
  });
}

Deno.test("правилният слот СЕ удовлетворява дори при много клаузи с еднакви стойности", async () => {
  const doc = "Чл. 2 Цена: Възнаграждението е 1 000,00 EUR.\n" +
    "Чл. 5 Неустойка: Неустойката е 1 000,00 EUR.\n" +
    "Чл. 6 Депозит: Депозитът е 1 000,00 EUR.\n" +
    "Чл. 7 Срок на договора: Срокът на договора е 30 дни.\n" +
    "Чл. 8 Срок за плащане: Плащането се извършва в срок от 30 дни.\n" + PAD;
  const a = await assertionsFor([
    { slot: "money.price", value: { kind: "money", amount: "1000", currency: "EUR" } },
    { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
  ]);
  const r = await verify(a, doc);
  assertEquals(r.satisfied, 2);
  assertEquals(r.mismatched_required.length, 0);
});

Deno.test("ЗАГЛАВИЕ и следващо ТЯЛО работят като един прозорец", async () => {
  const doc = "ЦЕНА И ПЛАЩАНЕ\n\nСтраните се съгласяват, че възнаграждението възлиза на 2 500,00 EUR " +
    "без включен данък добавена стойност.\n" + PAD;
  const a = await assertionsFor([
    { slot: "money.price", value: { kind: "money", amount: "2500", currency: "EUR" } },
  ]);
  assertEquals(await status(a, doc), "satisfied");
});

Deno.test("EN документ също се обвързва слотово", async () => {
  const ok = "Article 2 Price: The contract price is EUR 1,000.00.\n" +
    "Article 5 Penalty: The penalty is EUR 4,000.00.\n" + PAD;
  const wrong = "Article 5 Penalty: The penalty is EUR 1,000.00.\n" + PAD;
  const a = await assertionsFor([
    { slot: "money.price", value: { kind: "money", amount: "1000", currency: "EUR" } },
  ]);
  assertEquals(await status(a, ok), "satisfied");
  assertEquals(await status(a, wrong), "mismatch");
});

// ---------------------------------------------------------------------------
// 2) Наблюдавани структурни факти
// ---------------------------------------------------------------------------

Deno.test("двуезичността се извежда от СТРУКТУРАТА, не от свойството", async () => {
  const claimed = {
    bilingual: true,
    title: "Договор",
    clauses: [{ title: "Чл. 1", text: "Предмет." }, { title: "Чл. 2", text: "Цена." }],
  };
  assertEquals(detectBilingualStructure(claimed), false);

  const real = {
    title: "Договор",
    title_en: "Agreement",
    clauses: [
      { title: "Чл. 1", text: "Предмет.", title_en: "Art. 1", text_en: "Subject." },
      { title: "Чл. 2", text: "Цена.", title_en: "Art. 2", text_en: "Price." },
    ],
  };
  assertEquals(detectBilingualStructure(real), true);
  assertEquals(detectBilingualStructure(null), null);
  assertEquals(detectBilingualStructure({ clauses: [] }), null);
});

Deno.test("ИЗБРАНА двуезичност без английско съдържание БЛОКИРА", async () => {
  const drafts = extractIntentDrafts({ flags: { bilingual: true } });
  assertEquals(drafts.length, 1);
  assert(drafts[0].required);
  const a = await assertionsFor(drafts);
  const bad = await verify(a, "Чл. 1 Предмет." + PAD, { bilingual: false });
  assertEquals(bad.mismatched_required.length, 1);
  const good = await verify(a, "Чл. 1 Предмет." + PAD, { bilingual: true });
  assertEquals(good.satisfied, 1);
});

Deno.test("арбитражът се извежда от РЕАЛНИЯ текст", async () => {
  const withClause = "Чл. 12 Арбитраж: Споровете се решават от арбитражен съд." + PAD;
  const without = "Чл. 12 Спорове: Споровете се решават от компетентния съд." + PAD;
  assertEquals(detectArbitrationInText(withClause), true);
  assertEquals(detectArbitrationInText(without), false);
  assertEquals(detectArbitrationInText("кратко"), null);

  const a = await assertionsFor(extractIntentDrafts({ flags: { arbitration: true } }));
  assertEquals(
    (await verify(a, without, { arbitration: detectArbitrationInText(without) ?? undefined }))
      .mismatched_required.length,
    1,
  );
  assertEquals(
    (await verify(a, withClause, {
      arbitration: detectArbitrationInText(withClause) ?? undefined,
    })).satisfied,
    1,
  );
});

Deno.test("НЕизбран флаг (false) НЕ поражда недоказуемо твърдение", () => {
  assertEquals(extractIntentDrafts({ flags: { bilingual: false, arbitration: false } }).length, 0);
});

Deno.test("флаг без наблюдаем факт остава НЕПРОВЕРИМ, никога 'изпълнен'", async () => {
  const a = await assertionsFor(extractIntentDrafts({ flags: { arbitration: true } }));
  const r = await verify(a, "Чл. 1 Предмет." + PAD);
  assertEquals(r.results[0].status, "unverifiable");
  assertEquals(r.satisfied, 0);
});

// ---------------------------------------------------------------------------
// 3) Непрекъснатост при корекция: подписаното ОЧАКВАНО намерение се пази
// ---------------------------------------------------------------------------

Deno.test("нарушено изискване се ПАЗИ в новия набор и се възпроизвежда по-късно", async () => {
  const original = await assertionsFor([
    { slot: "money.price", value: { kind: "money", amount: "1000", currency: "EUR" }, required: true },
  ]);
  // Корекцията променя цената — намерението е нарушено, но НЕ се изхвърля.
  const corrected = "Чл. 2 Цена: Възнаграждението е 2 000,00 EUR." + PAD;
  const now = await verify(original, corrected);
  assertEquals(now.mismatched_required.length, 1);

  // Наборът, който би бил подписан наново, е ЦЕЛИЯТ валиден набор.
  const carried = original;
  assertEquals(carried.length, 1);
  // По-късен анализ/ревизия на ТОЧНО този коригиран текст пак вижда несъответствието.
  const later = await verify(carried, corrected);
  assertEquals(later.mismatched_required.length, 1);
  assertEquals(later.satisfied, 0);
});

// ---------------------------------------------------------------------------
// 4) Известни структурирани полета `term` / `prices`
// ---------------------------------------------------------------------------

Deno.test("ЕДИН недвусмислен кандидат в term/prices дава твърдение", () => {
  const drafts = extractIntentDrafts({
    structured: {
      term: "Договорът се сключва за срок от 12 месеца.",
      prices: "Възнаграждението е 1 500,00 EUR без ДДС.",
    },
  });
  const slots = drafts.map((d) => d.slot).sort();
  assertEquals(slots, ["duration.term", "money.price"]);
});

Deno.test("НУЛА или НЯКОЛКО кандидата в term/prices не дават твърдение", () => {
  assertEquals(
    extractIntentDrafts({
      structured: { term: "Срокът се определя допълнително.", prices: "По договаряне." },
    }).length,
    0,
  );
  assertEquals(
    extractIntentDrafts({
      structured: {
        term: "Срок 12 месеца, с възможност за удължаване с 6 месеца.",
        prices: "Цената е 1 000,00 EUR, а при забава 2 000,00 EUR.",
      },
    }).length,
    0,
  );
});

Deno.test("свободната проза извън известните полета НЕ поражда намерение", () => {
  assertEquals(
    extractIntentDrafts({
      questions: [{ id: "subject", label: "Предмет" }],
      answers: { subject: "Изработка за 1 000,00 EUR в срок от 30 дни." },
    }).length,
    0,
  );
});

// ---------------------------------------------------------------------------
// Q4b финална корекция — точна схема за двуезичност + посока на арбитража
// ---------------------------------------------------------------------------

const BILINGUAL_OK = {
  title: "Договор за изработка",
  title_en: "Service Agreement",
  preamble: "Днес, между страните, се сключи следният договор:",
  preamble_en: "Today, between the parties, the following agreement was concluded:",
  clauses: [
    {
      number: "Чл. 1.",
      title: "Предмет",
      body: "Изпълнителят изработва уебсайт.",
      title_en: "Subject",
      body_en: "The contractor shall build a website.",
    },
    {
      number: "Чл. 2.",
      title: "Цена",
      body: "Цената е 1 000,00 EUR.",
      title_en: "Price",
      body_en: "The price is EUR 1,000.00.",
    },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
  closing_en: "This agreement was signed in two identical counterparts.",
};

const withoutKey = (path: string) => {
  const c = JSON.parse(JSON.stringify(BILINGUAL_OK)) as Record<string, unknown>;
  if (path.startsWith("clause0.")) {
    const clauses = c.clauses as Array<Record<string, unknown>>;
    delete clauses[0][path.slice(8)];
  } else delete c[path];
  return c;
};

Deno.test("двуезичност: пълен документ по реалната схема е доказан", () => {
  assertEquals(detectBilingualStructure(BILINGUAL_OK), true);
});

Deno.test("двуезичност: липсващ body_en при наличен title_en НЕ е превод", () => {
  assertEquals(detectBilingualStructure(withoutKey("clause0.body_en")), false);
});

Deno.test("двуезичност: липсващ preamble_en/closing_en НЕ е превод", () => {
  assertEquals(detectBilingualStructure(withoutKey("preamble_en")), false);
  assertEquals(detectBilingualStructure(withoutKey("closing_en")), false);
});

Deno.test("двуезичност: само свойството bilingual НЕ е доказателство", () => {
  assertEquals(detectBilingualStructure({ ...BILINGUAL_OK, bilingual: true, title_en: "" }), false);
});

Deno.test("двуезичност: неразпознаваем вход е НЕПРОВЕРИМ (null)", () => {
  assertEquals(detectBilingualStructure(null), null);
  assertEquals(detectBilingualStructure("Договор"), null);
  assertEquals(detectBilingualStructure([1, 2]), null);
  assertEquals(detectBilingualStructure({}), null);
  assertEquals(detectBilingualStructure({ clauses: [] }), null);
  assertEquals(detectBilingualStructure({ clauses: [{ foo: 1 }] }), null);
});

Deno.test("арбитраж: отрицание/изключване НЕ е арбитраж", () => {
  const negations = [
    "Чл. 12 Спорове: Споровете между страните се решават от компетентния български съд, без арбитраж.",
    "Чл. 12 Спорове: Споровете няма да се решават чрез арбитраж, а по съдебен ред.",
    "Article 12 Disputes: Any dispute is not subject to arbitration and shall be heard by the courts.",
    "Article 12 Disputes: Disputes shall not be resolved by arbitration but by the competent court.",
  ];
  for (const n of negations) assertEquals(detectArbitrationInText(n + PAD), false, n);
});

Deno.test("арбитраж: голо споменаване/заглавие остава НЕПРОВЕРИМО", () => {
  assertEquals(detectArbitrationInText("Чл. 12 Арбитраж" + PAD), null);
  assertEquals(
    detectArbitrationInText("Приложение: списък на арбитражните институции в Европа." + PAD),
    null,
  );
  assertEquals(detectArbitrationInText("арбитраж"), null);
});

Deno.test("арбитраж: ясна оперативна уговорка е доказана (BG и EN)", () => {
  assertEquals(
    detectArbitrationInText(
      "Чл. 12 Спорове: Всички спорове се решават чрез арбитраж от Арбитражния съд при БТПП." + PAD,
    ),
    true,
  );
  assertEquals(
    detectArbitrationInText(
      "Article 12 Disputes: All disputes shall be finally settled by arbitration under the ICC Rules." +
        PAD,
    ),
    true,
  );
});

Deno.test("ИЗБРАН арбитраж срещу отречен/гол изход => детерминиран несъответствие/непроверимост", async () => {
  const a = await assertionsFor(extractIntentDrafts({ flags: { arbitration: true } }));

  const negated = "Чл. 12 Спорове: Споровете няма да се решават чрез арбитраж." + PAD;
  const bad = await verify(a, negated, {
    arbitration: detectArbitrationInText(negated) ?? undefined,
  });
  assertEquals(bad.mismatched_required.length, 1);

  const bare = "Чл. 12 Арбитраж" + PAD;
  const unknown = await verify(a, bare, {
    arbitration: detectArbitrationInText(bare) ?? undefined,
  });
  assertEquals(unknown.satisfied, 0);
  assertEquals(unknown.results[0].status, "unverifiable");

  const good = "Чл. 12 Спорове: Всички спорове се решават чрез арбитраж от арбитражен съд." + PAD;
  const ok = await verify(a, good, { arbitration: detectArbitrationInText(good) ?? undefined });
  assertEquals(ok.satisfied, 1);
  assertEquals(ok.mismatched_required.length, 0);
});

Deno.test("арбитраж: изрично отрицание НАДДЯВА над положително звучащ фрагмент", () => {
  const mixed =
    "Чл. 12 Спорове: Споровете се решават чрез арбитраж само по взаимно съгласие; " +
    "до постигане на такова съгласие споровете няма да се решават чрез арбитраж, " +
    "а от компетентния български съд." + PAD;
  assertEquals(detectArbitrationInText(mixed), false);
});
