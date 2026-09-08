/**
 * Синтетични тестове — измислени данни, без модел, без мрежа, без реални качени
 * документи. Проверяват, че НИТО едно изходящо поле не носи сурови лични данни и
 * че мапингът е ЕДИН за целия контекст.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { unredact } from "../_shared/redact.ts";
import {
  buildClassificationCorpus,
  redactCorrectionContext,
  type CorrectionContext,
} from "./context-redaction.ts";
import type { SelectedIssue, SelectedMissing } from "./request.ts";

const EMAIL = "ivan.petrov@example-firma.bg";
const EMAIL2 = "maria.ivanova@example-firma.bg";
const IBAN = "BG18RZBB91550123456789";
const NAME = "Иван Петров Георгиев";

const CLAUSE = `Плащанията се превеждат по сметка ${IBAN} на ${NAME}.`;

const ctx = (over: Partial<CorrectionContext> = {}): CorrectionContext => ({
  sourceText:
    `ДОГОВОР ЗА УСЛУГА\n\n1. Страни. ${NAME}, ел. поща ${EMAIL}.\n\n2. Плащане. ${CLAUSE}\n`,
  contractType: "Договор за услуга",
  summary: `Договор между ${NAME} (${EMAIL}) и дружеството; плащане по ${IBAN}.`,
  issues: [
    {
      severity: "high",
      title: `Сметката на ${NAME} е единствената допустима`,
      clause: CLAUSE,
      explanation: `Изплащането само по ${IBAN} ограничава страната.`,
      suggestion: `Допуснете и друга сметка, известете на ${EMAIL}.`,
    } satisfies SelectedIssue,
  ],
  missing: [
    { name: "Кореспонденция", why: `Не е уговорен адрес, различен от ${EMAIL}.` } satisfies SelectedMissing,
  ],
  ...over,
});

function outgoing(c: CorrectionContext): string {
  return [
    c.sourceText,
    c.contractType,
    c.summary,
    ...c.issues.map((i) => `${i.title} ${i.clause} ${i.explanation} ${i.suggestion ?? ""}`),
    ...c.missing.map((m) => `${m.name} ${m.why}`),
  ].join("\n");
}

Deno.test("една и съща стойност в текст, цитат и резюме получава ЕДИН плейсхолдър", () => {
  const r = redactCorrectionContext(ctx(), { redactionRequired: true });
  assert(r.ok);
  const all = outgoing(r.context);

  // Нищо сурово не излиза навън — нито през документа, нито през находките.
  assert(!all.includes(EMAIL));
  assert(!all.includes(IBAN));
  assert(!all.includes(NAME));

  // Един и същ e-mail/IBAN/име = един и същ плейсхолдър навсякъде.
  const placeholders = Object.entries(r.mapping);
  const emailPh = placeholders.filter(([, v]) => v === EMAIL);
  const ibanPh = placeholders.filter(([, v]) => v === IBAN);
  assertEquals(emailPh.length, 1);
  assertEquals(ibanPh.length, 1);
  for (const field of [r.context.sourceText, r.context.summary, r.context.issues[0].explanation]) {
    assert(field.includes(ibanPh[0][0]) || field.includes(emailPh[0][0]));
  }
  assert(r.context.summary.includes(emailPh[0][0]));
  assert(r.context.issues[0].clause.includes(ibanPh[0][0]));
  assert(r.context.missing[0].why.includes(emailPh[0][0]));
});

Deno.test("заявката към RAG също няма сурови данни", () => {
  const r = redactCorrectionContext(ctx(), { redactionRequired: true });
  assert(r.ok);
  const ragQuery = `${r.context.contractType} ${r.context.summary}\n${r.context.sourceText}`.slice(0, 4000);
  assert(!ragQuery.includes(EMAIL));
  assert(!ragQuery.includes(IBAN));
  assert(!ragQuery.includes(NAME));
});

Deno.test("различните стойности остават различни плейсхолдъри", () => {
  const base = ctx();
  const r = redactCorrectionContext({
    ...base,
    summary: `${base.summary} Копие до ${EMAIL2}.`,
  }, { redactionRequired: true });
  assert(r.ok);
  const forEmail1 = Object.entries(r.mapping).filter(([, v]) => v === EMAIL).map(([k]) => k);
  const forEmail2 = Object.entries(r.mapping).filter(([, v]) => v === EMAIL2).map(([k]) => k);
  assertEquals(forEmail1.length, 1);
  assertEquals(forEmail2.length, 1);
  assert(forEmail1[0] !== forEmail2[0]);
  assert(!outgoing(r.context).includes(EMAIL2));
});

Deno.test("няма колизия и рестартиращи се броячи между полетата", () => {
  const r = redactCorrectionContext(ctx(), { redactionRequired: true });
  assert(r.ok);
  const keys = Object.keys(r.mapping);
  assertEquals(new Set(keys).size, keys.length);
  const values = Object.values(r.mapping);
  assertEquals(new Set(values).size, values.length);
});

Deno.test("отговорът на модела се възстановява през същия мапинг", () => {
  const r = redactCorrectionContext(ctx(), { redactionRequired: true });
  assert(r.ok);
  const modelOutput =
    `Коригиран текст: ${r.context.issues[0].clause}\nСтрана: ${r.context.summary}`;
  const restored = unredact(modelOutput, r.mapping);
  assert(restored.includes(IBAN));
  assert(restored.includes(EMAIL));
  assert(restored.includes(NAME));
  assert(!restored.includes("<IBAN_"));
});

Deno.test("без изискване за редакция контекстът е непроменен и мапингът празен", () => {
  const original = ctx();
  const r = redactCorrectionContext(original, { redactionRequired: false });
  assert(r.ok);
  assertEquals(r.redactionApplied, false);
  assertEquals(r.mapping, {});
  assertEquals(r.context.sourceText, original.sourceText);
  assertEquals(r.context.issues[0].clause, CLAUSE);
});

Deno.test("повреден или неподдържан контекст се отказва (fail closed)", () => {
  const bad: unknown[] = [
    { ...ctx(), summary: null },
    { ...ctx(), contractType: undefined },
    { ...ctx(), sourceText: 12 },
    { ...ctx(), issues: null },
    { ...ctx(), missing: "не е списък" },
    { ...ctx(), issues: [{ severity: "high", title: "Т", clause: null, explanation: "x" }] },
    { ...ctx(), missing: [{ name: "Т", why: 5 }] },
    { ...ctx(), issues: [null] },
    null,
    // Служебният разделител в данните не се допуска.
    { ...ctx(), summary: "резюме \u241E скрито" },
  ];
  for (const b of bad) {
    const r = redactCorrectionContext(b as CorrectionContext, { redactionRequired: true });
    assertEquals(r.ok, false, JSON.stringify(b));
    if (!r.ok) assertEquals(r.code, "context_not_redactable");
  }
});

Deno.test("класификацията вижда и находките, не само документа", () => {
  const corpus = buildClassificationCorpus(ctx({ sourceText: "Кратък договор без лични данни." }));
  assert(corpus.includes(EMAIL));
  assert(corpus.includes(IBAN));
  // Празният избор не води до загуба на документа от корпуса.
  const onlyDoc = buildClassificationCorpus(ctx({ issues: [], missing: [] }));
  assert(onlyDoc.includes("ДОГОВОР ЗА УСЛУГА"));
});

Deno.test("липсваща препоръка не се превръща в стойност", () => {
  const base = ctx();
  const issue: SelectedIssue = { ...base.issues[0] };
  delete issue.suggestion;
  const r = redactCorrectionContext({ ...base, issues: [issue] }, { redactionRequired: true });
  assert(r.ok);
  assertEquals(r.context.issues[0].suggestion, undefined);
  assertEquals(r.context.issues[0].severity, "high");
  assert(!outgoing(r.context).includes(EMAIL));
});
