/**
 * Q4b — паритет „генериране → ревизия" и „генериране → анализ".
 *
 * Тук се доказва, че типизираните твърдения за намерението пътуват ВЪТРЕ в
 * подписания манифест за качество и че всяко пипване по тях (добавяне, махане,
 * подмяна на слот) разваля подписа. Никаква мрежа, никаква база, фиксиран
 * фалшив секрет.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildQualityManifest,
  GENERATED_QUALITY_POLICY_VERSION,
  mergeIntentFindingsIntoRisk,
  renderCanonicalPlainText,
  validateQualityManifest,
  verifyManifestSignatureOnly,
  verifyQualityManifest,
  type GatedRisk,
} from "./generated-document-quality.ts";
import {
  buildIntentAssertions,
  verifyIntentAssertions,
  type IntentAssertion,
} from "./intent-assertions.ts";

const SECRET = "test-only-fake-server-secret-0123456789";

const CONTRACT = {
  title: "ДОГОВОР ЗА ИЗРАБОТКА",
  preamble: "Днес между ВЪЗЛОЖИТЕЛЯ и ИЗПЪЛНИТЕЛЯ се сключи следният договор:",
  clauses: [
    { number: "Чл. 1", title: "Предмет", body: "Изпълнителят изработва уеб сайт." },
    { number: "Чл. 2", title: "Цена", body: "Възнаграждението е 1 000,00 EUR без ДДС." },
    { number: "Чл. 3", title: "Срок", body: "Срокът на договора е 30 дни от подписването." },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
};

const intentsFor = () =>
  buildIntentAssertions({
    serverSecret: SECRET,
    drafts: [
      { slot: "money.price", value: { kind: "money", amount: "1000", currency: "EUR" } },
      { slot: "duration.term", value: { kind: "duration", count: 30, unit: "day" } },
    ],
  });

const manifestFor = async (intents: readonly IntentAssertion[], contract: unknown = CONTRACT) =>
  await buildQualityManifest({
    origin: "generate-contract",
    signingSecret: SECRET,
    contract,
    intents,
    documentType: "dogovor-za-izrabotka",
    decisions: ["placeholders_for_personal_data", "optional_annex_details"],
  });

Deno.test("политиката е Q4b и манифестът НОСИ твърденията за намерението", async () => {
  assertEquals(GENERATED_QUALITY_POLICY_VERSION, "q4b-generated-quality-1");
  const m = await manifestFor(await intentsFor());
  assertEquals(m.intents.length, 2);
  assertEquals(m.intents.map((i) => i.slot).sort(), ["duration.term", "money.price"]);
});

Deno.test("паритет генериране → АНАЛИЗ: доверен манифест по чист текст носи твърденията", async () => {
  const intents = await intentsFor();
  const m = await manifestFor(intents);
  const plain = renderCanonicalPlainText(CONTRACT);
  // Анализът вижда САМО чист текст — обвързването е по подписания четим отпечатък.
  const trust = await verifyQualityManifest({
    manifest: m,
    content: plain,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assert(trust.trusted, "манифестът трябва да е доверен по чист текст");
  const report = await verifyIntentAssertions({
    assertions: trust.manifest.intents,
    documentText: plain,
    serverSecret: SECRET,
  });
  assertEquals(report.checked, 2);
  assertEquals(report.satisfied, 2);
});

Deno.test("паритет генериране → РЕВИЗИЯ: същият чист текст дава същия резултат", async () => {
  const m = await manifestFor(await intentsFor());
  const plain = renderCanonicalPlainText(CONTRACT);
  const trust = await verifyQualityManifest({
    manifest: m,
    content: plain,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assert(trust.trusted);
  const report = await verifyIntentAssertions({
    assertions: trust.manifest.intents,
    documentText: plain,
    serverSecret: SECRET,
  });
  assertEquals(report.mismatched_required.length, 0);
});

Deno.test("ПРОМЕНЕН текст обезсилва манифеста — недоверен, нищо не се потиска", async () => {
  const m = await manifestFor(await intentsFor());
  const edited = renderCanonicalPlainText({
    ...CONTRACT,
    clauses: [
      ...CONTRACT.clauses.slice(0, 1),
      { number: "Чл. 2", title: "Цена", body: "Възнаграждението е 5 000,00 EUR без ДДС." },
      ...CONTRACT.clauses.slice(2),
    ],
  });
  const trust = await verifyQualityManifest({
    manifest: m,
    content: edited,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assertEquals(trust.trusted, false);
  if (!trust.trusted) assertEquals(trust.reason, "content_mismatch");
});

Deno.test("ДОБАВЕНО, МАХНАТО или ПОДМЕНЕНО твърдение разваля подписа", async () => {
  const intents = await intentsFor();
  const m = await manifestFor(intents);
  const plain = renderCanonicalPlainText(CONTRACT);

  const forged = await buildIntentAssertions({
    serverSecret: SECRET,
    drafts: [{ slot: "money.penalty", value: { kind: "money", amount: "9000", currency: "EUR" } }],
  });

  const variants = [
    { ...m, intents: [...m.intents, ...forged] }, // добавено
    { ...m, intents: [m.intents[0]] }, // махнато
    { ...m, intents: [{ ...m.intents[0], slot: "money.penalty" }, m.intents[1]] }, // подменен слот
    { ...m, intents: [{ ...m.intents[0], required: !m.intents[0].required }, m.intents[1]] },
  ];
  for (const v of variants) {
    const t = await verifyQualityManifest({
      manifest: v,
      content: plain,
      signingSecret: SECRET,
      allowPlaintextMatch: true,
    });
    // Fail-closed: според вида на пипането отпада или по СХЕМА (несъвместим
    // вид/слот), или по ПОДПИС. И двете са отказ — нищо не се потиска.
    assertEquals(t.trusted, false, `подписът трябваше да падне: ${JSON.stringify(v.intents)}`);
    if (!t.trusted) {
      assert(
        t.reason === "signature_mismatch" || t.reason === "invalid",
        `неочаквана причина: ${t.reason}`,
      );
    }
  }
});

Deno.test("невалидна СХЕМА на твърдение прави целия манифест невалиден", async () => {
  const m = await manifestFor(await intentsFor());
  assertEquals(validateQualityManifest({ ...m, intents: [{ slot: "nope", kind: "money" }] }), null);
  assertEquals(validateQualityManifest({ ...m, intents: "не е масив" }), null);
});

Deno.test("манифест от ДРУГА политика/версия не се приема", async () => {
  const m = await manifestFor(await intentsFor());
  assertEquals(validateQualityManifest({ ...m, policy_version: "q4a-generated-quality-2" }), null);
  assertEquals(validateQualityManifest({ ...m, version: 1 }), null);
});

Deno.test("пренасяне при КОРЕКЦИЯ: само подписан манифест дава твърдения", async () => {
  const m = await manifestFor(await intentsFor());
  const carried = await verifyManifestSignatureOnly({ manifest: m, signingSecret: SECRET });
  assert(carried, "валидно подписан манифест се приема за пренасяне");
  assertEquals(carried!.intents.length, 2);

  // Измислен от браузъра манифест няма валиден подпис → нищо не се пренася.
  assertEquals(
    await verifyManifestSignatureOnly({
      manifest: { ...m, signature: { ...m.signature, value: "a".repeat(64) } },
      signingSecret: SECRET,
    }),
    null,
  );
  assertEquals(await verifyManifestSignatureOnly({ manifest: null, signingSecret: SECRET }), null);
});

Deno.test("нищо сурово не изтича в серизирания манифест", async () => {
  const m = await manifestFor(await intentsFor());
  const serialized = JSON.stringify(m);
  for (const forbidden of ["1000", "1 000", "30", "Иван", "0888", "ВЪЗЛОЖИТЕЛЯ"]) {
    assert(!serialized.includes(forbidden), `изтекла стойност: ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// Сливането на детерминираните находки
// ---------------------------------------------------------------------------

const baseRisk = (): GatedRisk => ({
  level: "low",
  score: 10,
  summary: "Няма съществени бележки.",
  issues: [],
  recommendations: [],
  strengths: [],
});

Deno.test("ДОКАЗАНО несъответствие не оставя „нисък риск“", async () => {
  const intents = await intentsFor();
  const report = await verifyIntentAssertions({
    assertions: intents,
    documentText: "Чл. 1 Предмет: услуга. Чл. 2 Цена: 5 000,00 лв. Чл. 3 Срок: 90 месеца.",
    serverSecret: SECRET,
  });
  assertEquals(report.mismatched_required.length, 2);
  const merged = mergeIntentFindingsIntoRisk({ risk: baseRisk(), report });
  assertEquals(merged.added, 2);
  assertEquals(merged.risk.level, "high");
  assert(merged.risk.score >= 60);
  assert(merged.risk.issues.every((i) => i.severity === "high"));
});

Deno.test("без несъответствие сливането НЕ променя нищо (никакво надуване)", async () => {
  const intents = await intentsFor();
  const report = await verifyIntentAssertions({
    assertions: intents,
    documentText: renderCanonicalPlainText(CONTRACT),
    serverSecret: SECRET,
  });
  const risk = baseRisk();
  const merged = mergeIntentFindingsIntoRisk({ risk, report });
  assertEquals(merged.added, 0);
  assertEquals(merged.risk, risk);
});

Deno.test("сливането е идемпотентно — не дублира една и съща бележка", async () => {
  const intents = await intentsFor();
  const report = await verifyIntentAssertions({
    assertions: intents,
    documentText: "Чл. 1 Предмет: услуга без цена и без срок.",
    serverSecret: SECRET,
  });
  const once = mergeIntentFindingsIntoRisk({ risk: baseRisk(), report });
  const twice = mergeIntentFindingsIntoRisk({ risk: once.risk, report });
  assertEquals(twice.risk.issues.length, once.risk.issues.length);
});
