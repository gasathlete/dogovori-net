/**
 * Q4b — паритет на редакцията в ревизията.
 *
 * Ревизията ползваше СТАРОТО текстово рамкиране (`join`/`split` по разделител).
 * Точно то беше причината телефон в КРАЯ на поле да „изяде" следващия нов ред и
 * напълно нормални име/телефон/адрес да се превърнат в `context_not_redactable`.
 * Тук се доказва, че ревизията вече ползва СЪЩАТА структурно безопасна редакция
 * като генератора, без да губи fail-closed поведението за запазени маркери.
 *
 * Синтетични стойности — никакви реални лични данни, никаква мрежа и база.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReviewRequest, redactReviewContext, type ReviewRequest } from "./review-context.ts";
import { unredact } from "../_shared/redact.ts";

const LONG_TEXT =
  "ДОГОВОР ЗА УСЛУГИ. Страните се договарят за изработка на уеб сайт срещу възнаграждение " +
  "от 1 000,00 EUR, платимо по банков път в срок от 30 дни от подписването на договора. " +
  "Всички спорове се решават по реда на ЗЗД и приложимото българско законодателство.";

function requestOf(over: Record<string, unknown> = {}): ReviewRequest {
  const r = buildReviewRequest({
    documentText: LONG_TEXT,
    documentTitle: "Договор за услуги",
    documentType: "dogovor-za-uslugi",
    ...over,
  });
  assert(!("ok" in r), "заявката трябва да е валидна");
  return r as ReviewRequest;
}

const redact = (r: ReviewRequest) => {
  const out = redactReviewContext(r, { redactionRequired: true });
  assert(out.ok, `редакцията трябва да успее: ${!out.ok ? out.code : ""}`);
  return out;
};

Deno.test("телефон в КРАЯ на всяко изходящо поле не разваля редакцията", () => {
  // Всяко от изходящите полета се проверява поотделно с PII точно в края.
  const cases: Array<Record<string, unknown>> = [
    { documentText: `${LONG_TEXT} Телефон за контакт: 0888123456` },
    { documentTitle: "Договор с 0888123456" },
    { documentType: "uslugi-0888123456" },
    { context: { role: "Възложител 0888123456", decisions: [] } },
    { context: { decisions: [{ label: "Телефон 0888123456", value: "да" }] } },
    { context: { decisions: [{ label: "Телефон", value: "0888123456" }] } },
    {
      context: {
        decisions: [
          { label: "Телефон", value: "0888123456" },
          { label: "Адрес", value: "гр. Пловдив, ул. Рила 5" },
        ],
      },
    },
  ];
  for (const over of cases) {
    const r = requestOf(over);
    const out = redact(r);
    const outgoing = JSON.stringify(out.context);
    assert(!outgoing.includes("0888123456"), `изтекъл телефон при ${JSON.stringify(over)}`);
    assertEquals(out.context.decisions.length, r.context?.decisions.length ?? 0);
  }
});

Deno.test("нормални име/телефон/адрес НЕ дават context_not_redactable", () => {
  const r = requestOf({
    context: {
      role: "Възложител",
      decisions: [
        { label: "Име на страната", value: "Иван Петров Иванов" },
        { label: "Телефон", value: "0888123456" },
        { label: "Адрес", value: "гр. София, бул. Витоша 1" },
      ],
    },
  });
  const out = redactReviewContext(r, { redactionRequired: true });
  assertEquals(out.ok, true);
});

Deno.test("една и съща стойност в различни полета получава ЕДИН плейсхолдър", () => {
  const r = requestOf({
    context: {
      decisions: [
        { label: "Телефон", value: "0888 123 456" },
        { label: "Обратна връзка", value: "Обадете се на 0888 123 456" },
      ],
    },
  });
  const out = redact(r);
  const ph = out.context.decisions[0].value.match(/<PHONE_\d+(?:_[0-9a-f]+)?>/);
  assert(ph, "трябва да има PHONE плейсхолдър");
  assert(out.context.decisions[1].value.includes(ph![0]));
});

Deno.test("РАЗЛИЧНИ стойности остават РАЗЛИЧНИ плейсхолдъри и се възстановяват точно", () => {
  const r = requestOf({
    context: {
      decisions: [
        { label: "Телефон 1", value: "0888 123 456" },
        { label: "Телефон 2", value: "0899 777 888" },
      ],
    },
  });
  const out = redact(r);
  const a = out.context.decisions[0].value.match(/<PHONE_\d+(?:_[0-9a-f]+)?>/)![0];
  const b = out.context.decisions[1].value.match(/<PHONE_\d+(?:_[0-9a-f]+)?>/)![0];
  assertNotEquals(a, b);
  assert(unredact(a, out.mapping).includes("0888 123 456"));
  assert(unredact(b, out.mapping).includes("0899 777 888"));
});

Deno.test("кавички, обратни наклонени черти, нови редове и Unicode се запазват точно", () => {
  const tricky = 'Клауза "А" \\ пътека\nвтори ред — тире, emoji ✅, тел. 0888123456';
  const r = requestOf({
    context: { decisions: [{ label: "Особени условия", value: tricky }] },
  });
  const out = redact(r);
  assertEquals(unredact(out.context.decisions[0].value, out.mapping), tricky);
});

Deno.test("ЗАПАЗЕН маркер във входа все още се отказва (fail-closed)", () => {
  const withPlaceholder = redactReviewContext(
    requestOf({ context: { decisions: [{ label: "Плащане", value: "Плати на <EMAIL_1>" }] } }),
    { redactionRequired: true },
  );
  assertEquals(withPlaceholder.ok, false);
  if (!withPlaceholder.ok) assertEquals(withPlaceholder.code, "context_not_redactable");

  const withControlMark = redactReviewContext(
    requestOf({ context: { decisions: [{ label: "Бележка", value: "текст \u241E\u241E\u241E тук" }] } }),
    { redactionRequired: true },
  );
  assertEquals(withControlMark.ok, false);
});

Deno.test("без изискана редакция контекстът минава непроменен", () => {
  const r = requestOf({
    context: { decisions: [{ label: "Телефон", value: "0888123456" }] },
  });
  const out = redactReviewContext(r, { redactionRequired: false });
  assert(out.ok);
  assertEquals(out.redactionApplied, false);
  assertEquals(out.context.decisions[0].value, "0888123456");
  assertEquals(Object.keys(out.mapping).length, 0);
});
