/**
 * Регресии за JSON рамкирането на изходящия контекст (Q4a fix).
 * Никакви реални AI повиквания и никакви реални потребителски данни.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGeneratorContext, redactGeneratorContext, type GeneratorContext } from "./generator-context.ts";
import { unredact } from "../_shared/redact.ts";

function ctxOf(over: Record<string, unknown> = {}): GeneratorContext {
  const c = buildGeneratorContext({
    sector: "IT услуги",
    contractName: "Договор за услуги",
    documentName: "Договор за услуги",
    parties: { a: "Иван Петров Иванов", b: "Георги Димитров Георгиев" },
    questions: [{ id: "q1", label: "Телефон" }, { id: "q2", label: "Адрес" }],
    answers: { q1: "0888123456", q2: "гр. Пловдив, ул. Рила 5" },
    arbitration: { enabled: true, courtName: "Арбитражен съд при БТПП" },
    ...over,
  });
  assert(!("ok" in c), "контекстът трябва да е валиден");
  return c as GeneratorContext;
}

function redact(c: GeneratorContext) {
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assert(r.ok, "редакцията трябва да успее");
  return r;
}

Deno.test("телефон в КРАЯ на поле не разваля рамкирането (докладваният случай)", () => {
  const c = ctxOf({ answers: { q1: "0888123456", q2: "гр. София, бул. Витоша 1" } });
  const r = redact(c);
  assertEquals(r.context.qa.length, 2);
  assert(!r.context.qa[0].answer.includes("0888123456"));
  assertEquals(unredact(r.context.qa[0].answer, r.mapping), "0888123456");
  assertEquals(unredact(r.context.qa[1].answer, r.mapping), "гр. София, бул. Витоша 1");
});

Deno.test("няколко телефона, имена и адрес в различни полета се редактират коректно", () => {
  const c = ctxOf({
    parties: { a: "Иван Петров Иванов, 0888111222", b: "Георги Димитров Георгиев, 0899333444" },
    answers: { q1: "0877555666", q2: "гр. Варна, ул. Дунав 12" },
  });
  const r = redact(c);
  const outgoing = JSON.stringify(r.context);
  for (const v of ["0888111222", "0899333444", "0877555666"]) {
    assert(!outgoing.includes(v), `изтекла стойност: ${v}`);
  }
  assertEquals(unredact(r.context.partyA, r.mapping), c.partyA);
  assertEquals(unredact(r.context.partyB, r.mapping), c.partyB);
  assertEquals(unredact(r.context.qa[0].answer, r.mapping), "0877555666");
});

Deno.test("кавички, обратни наклонени черти, нови редове и Unicode се запазват точно", () => {
  const tricky = 'Клауза "А" \\ пътека\nвтори ред — тире, emoji ✅, тел. 0888123456';
  const c = ctxOf({ answers: { q1: tricky, q2: 'Той каза: "да" \\\\ край' } });
  const r = redact(c);
  assertEquals(unredact(r.context.qa[0].answer, r.mapping), tricky);
  assertEquals(unredact(r.context.qa[1].answer, r.mapping), 'Той каза: "да" \\\\ край');
});

Deno.test("една и съща PII в различни полета получава ЕДИН плейсхолдър", () => {
  const c = ctxOf({ answers: { q1: "0888 123 456", q2: "Обратна връзка на 0888 123 456" } });
  const r = redact(c);
  const ph = r.context.qa[0].answer.match(/<PHONE_\d+>/);
  assert(ph, "трябва да има PHONE плейсхолдър");
  assert(r.context.qa[1].answer.includes(ph![0]));
});

Deno.test("различни стойности остават различни плейсхолдъри", () => {
  const c = ctxOf({ answers: { q1: "0888 123 456", q2: "Резервен тел. 0899 777 888" } });
  const r = redact(c);
  const a = r.context.qa[0].answer.match(/<PHONE_\d+>/)![0];
  const b = r.context.qa[1].answer.match(/<PHONE_\d+>/)![0];
  assertNotEquals(a, b);
  assertEquals(unredact(a, r.mapping).trim(), "0888 123 456");
  assert(unredact(b, r.mapping).includes("0899 777 888"));
});

Deno.test("резервиран плейсхолдър във входа все още се отказва (fail-closed)", () => {
  const c = ctxOf({ answers: { q1: "Плати на <EMAIL_1>", q2: "адрес" } });
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "context_not_redactable");

  const c2 = ctxOf({ answers: { q1: "текст \u241E\u241E\u241E тук", q2: "адрес" } });
  assertEquals(redactGeneratorContext(c2, { redactionRequired: true }).ok, false);
});
