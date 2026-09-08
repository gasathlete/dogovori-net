/**
 * Q2c0 — синтетични тестове за ЕДИННАТА редакция на изходящия контекст.
 * Никакви реални AI повиквания, никакви реални потребителски данни.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildGeneratorCacheIdentity,
  buildGeneratorClassificationCorpus,
  buildGeneratorContext,
  buildQaLines,
  GENERATOR_CACHE_POLICY_VERSION,
  redactGeneratorContext,
  type GeneratorContext,
} from "./generator-context.ts";
import { unredact } from "../_shared/redact.ts";

const A_EMAIL = "first-person@example.invalid";
const B_EMAIL = "second-person@example.invalid";
const A_IBAN = "BG18RZBB91550123456789";
const B_IBAN = "BG80BNBG96611020345678";
const A_NAME = "Иван Петров Иванов";
const B_NAME = "Георги Димитров Георгиев";

function body(over: Record<string, unknown> = {}) {
  return {
    sector: "IT услуги",
    contractName: "Договор за услуги",
    documentName: "Договор за услуги",
    parties: { a: `${A_NAME}, ${A_EMAIL}`, b: `${B_NAME}, ${B_EMAIL}` },
    questions: [
      { id: "q1", label: "Банкова сметка на изпълнителя" },
      { id: "q2", label: "Банкова сметка на възложителя" },
      { id: "q3", label: "Празен въпрос" },
    ],
    answers: { q1: A_IBAN, q2: B_IBAN, q3: "  " },
    arbitration: { enabled: true, courtName: "Арбитражен съд при БТПП" },
    ...over,
  };
}

function ctxOf(over: Record<string, unknown> = {}): GeneratorContext {
  const c = buildGeneratorContext(body(over));
  assert(!("ok" in c), "контекстът трябва да е валиден");
  return c as GeneratorContext;
}

Deno.test("контекстът пази реда на въпросите и изпуска празните отговори", () => {
  const c = ctxOf();
  assertEquals(c.qa.map((q) => q.id), ["q1", "q2"]);
  assertEquals(c.qa[0].label, "Банкова сметка на изпълнителя");
  assertEquals(c.arbitrationCourt, "Арбитражен съд при БТПП");
});

Deno.test("двете страни получават РАЗЛИЧНИ плейсхолдъри и се възстановяват вярно", () => {
  const c = ctxOf();
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assert(r.ok);
  assertNotEquals(r.context.partyA, r.context.partyB);
  // Никаква сурова стойност в изходящия контекст.
  const outgoing = JSON.stringify(r.context);
  for (const v of [A_EMAIL, B_EMAIL, A_IBAN, B_IBAN, A_NAME, B_NAME]) {
    assert(!outgoing.includes(v), `изтекла стойност: ${v}`);
  }
  // Обратното възстановяване връща ТОЧНО оригиналите — без разместване.
  assertEquals(unredact(r.context.partyA, r.mapping), c.partyA);
  assertEquals(unredact(r.context.partyB, r.mapping), c.partyB);
  assertEquals(unredact(r.context.qa[0].answer, r.mapping), A_IBAN);
  assertEquals(unredact(r.context.qa[1].answer, r.mapping), B_IBAN);
});

Deno.test("една и съща стойност навсякъде получава ЕДИН плейсхолдър", () => {
  const c = ctxOf({
    parties: { a: `Страна А, ${A_EMAIL}`, b: `Страна Б, ${B_EMAIL}` },
    answers: { q1: `Контакт: ${A_EMAIL}`, q2: `Контакт: ${A_EMAIL}` },
  });
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assert(r.ok);
  const ph = r.context.qa[0].answer.match(/<EMAIL_\d+>/)![0];
  assertEquals(r.context.qa[1].answer.includes(ph), true);
  assert(r.context.partyA.includes(ph));
  assert(!r.context.partyB.includes(ph));
  assertEquals(unredact(r.context.partyB, r.mapping), c.partyB);
});

Deno.test("всички изходящи полета са санитирани, включително етикети и съд", () => {
  const c = ctxOf({
    questions: [{ id: "q1", label: `Кой плаща на ${A_NAME}?` }],
    answers: { q1: `Плаща ${B_NAME} по ${B_IBAN}` },
    arbitration: { enabled: true, courtName: `Арбитраж, контакт ${A_EMAIL}` },
    languageContext: `Кореспонденция на ${B_EMAIL}`,
  });
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assert(r.ok);
  const prompt = `${buildQaLines(r.context)}\n${r.context.arbitrationCourt}\n${r.context.languageContext}`;
  for (const v of [A_NAME, B_NAME, B_IBAN, A_EMAIL, B_EMAIL]) {
    assert(!prompt.includes(v), `изтекла стойност в промпта: ${v}`);
  }
  assertEquals(unredact(prompt, r.mapping).includes(B_IBAN), true);
});

Deno.test("без изискана редакция контекстът остава непроменен, с празен мапинг", () => {
  const c = ctxOf();
  const r = redactGeneratorContext(c, { redactionRequired: false });
  assert(r.ok);
  assertEquals(r.redactionApplied, false);
  assertEquals(r.mapping, {});
  assertEquals(r.context.partyA, c.partyA);
});

Deno.test("вече наличен резервиран плейсхолдър се отказва безопасно", () => {
  const c = ctxOf({ answers: { q1: "Плати на <EMAIL_1>", q2: B_IBAN } });
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.code, "context_not_redactable");
});

Deno.test("служебният разделител във входа се отказва безопасно", () => {
  const c = ctxOf({ answers: { q1: "текст \u241E\u241E\u241E тук", q2: B_IBAN } });
  const r = redactGeneratorContext(c, { redactionRequired: true });
  assertEquals(r.ok, false);
});

Deno.test("непроходим вход не се обработва", () => {
  const bad = buildGeneratorContext({ ...body(), questions: "не е списък" });
  assert("ok" in bad && bad.ok === false);
  const bad2 = buildGeneratorContext({ ...body(), questions: [{ label: "без id" }] });
  assert("ok" in bad2 && bad2.ok === false);
});

Deno.test("корпусът за класификация покрива ЦЕЛИЯ изходящ контекст", () => {
  const c = ctxOf({
    questions: [{ id: "q1", label: "Здравен статус" }],
    answers: { q1: `Диагноза на ${A_NAME}` },
  });
  const corpus = buildGeneratorClassificationCorpus(c);
  assert(corpus.includes("Здравен статус"));
  assert(corpus.includes(A_NAME));
  assert(corpus.includes(c.partyB));
  assert(corpus.includes(c.arbitrationCourt));
});

Deno.test("идентичността на кеша включва политика, повикващ, етикети и ред", async () => {
  const base = {
    context: ctxOf(),
    promptVersion: "v3-doc-type",
    docTypeId: "contract",
    bilingual: false,
    arbitrationEnabled: true,
    callerKey: "user:u-1",
  };
  const k = buildGeneratorCacheIdentity(base);
  assert(k.includes(GENERATOR_CACHE_POLICY_VERSION));
  assert(k.includes("user:u-1"));

  // Друг повикващ → друг ключ.
  assertNotEquals(k, buildGeneratorCacheIdentity({ ...base, callerKey: "user:u-2" }));
  // Само промяна на ЕТИКЕТА на въпрос → друг ключ (старият кеш го пропускаше).
  const relabeled = ctxOf({
    questions: [{ id: "q1", label: "ДРУГ етикет" }, { id: "q2", label: "Банкова сметка на възложителя" }],
  });
  assertNotEquals(k, buildGeneratorCacheIdentity({ ...base, context: relabeled }));
  // Само промяна на РЕДА на въпросите → друг ключ.
  const reordered: GeneratorContext = { ...base.context, qa: [...base.context.qa].reverse() };
  assertNotEquals(k, buildGeneratorCacheIdentity({ ...base, context: reordered }));
  // Двуезичен и арбитражен избор влизат в идентичността.
  assertNotEquals(k, buildGeneratorCacheIdentity({ ...base, bilingual: true }));
  assertNotEquals(k, buildGeneratorCacheIdentity({ ...base, arbitrationEnabled: false }));
  // Същите входове → същият ключ (детерминизъм).
  assertEquals(k, buildGeneratorCacheIdentity({ ...base, context: ctxOf() }));
  await Promise.resolve();
});

Deno.test("старият формат на ключа никога не съвпада с новия", () => {
  const c = ctxOf();
  const legacy = JSON.stringify({
    v: "v3-doc-type",
    sector: c.sector,
    contractName: c.contractName,
    documentName: c.documentName,
    docType: "contract",
    parties: { a: c.partyA, b: c.partyB },
    answers: { q1: c.qa[0].answer, q2: c.qa[1].answer },
    arbitration: { enabled: true, courtName: c.arbitrationCourt },
    bilingual: false,
  });
  const fresh = buildGeneratorCacheIdentity({
    context: c,
    promptVersion: "v3-doc-type",
    docTypeId: "contract",
    bilingual: false,
    arbitrationEnabled: true,
    callerKey: "user:u-1",
  });
  assertNotEquals(legacy, fresh);
  assert(!legacy.includes(GENERATOR_CACHE_POLICY_VERSION));
});
