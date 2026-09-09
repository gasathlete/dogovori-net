// Q4a — регресионен корпус за качеството на собствено генерираните документи.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRiskConsistencyGate,
  buildQualityManifest,
  computeContentFingerprint,
  computeContextFingerprint,
  flattenGeneratedContract,
  validateQualityManifest,
  verifyQualityManifest,
} from "./generated-document-quality.ts";

const contract = {
  title: "Договор за изработка",
  preamble: "Днес, [дата], между [име] и [име] се сключи следният договор.",
  clauses: [
    { number: "Чл. 1.", title: "Предмет", body: "Изпълнителят се задължава да изработи уеб сайт срещу възнаграждение." },
    { number: "Чл. 2.", title: "Цена и плащане", body: "Възнаграждението е в размер на [сума] евро, платимо по банков път." },
    { number: "Чл. 3.", title: "Срок", body: "Срокът за изпълнение е 30 дни от датата на сключване." },
    { number: "Чл. 4.", title: "Неустойки", body: "При забава се дължи неустойка в размер на 0,1% на ден." },
    { number: "Чл. 5.", title: "Прекратяване", body: "Договорът се прекратява по реда на ЗЗД." },
  ],
  closing: "ВЪЗЛОЖИТЕЛ: [име] ИЗПЪЛНИТЕЛ: [име]",
};

const docText = flattenGeneratedContract(contract);

async function manifest(decisions: string[] = ["placeholders_for_personal_data", "optional_annex_details"]) {
  return await buildQualityManifest({
    origin: "generate-contract",
    contract,
    documentType: "dogovor-za-izrabotka",
    buildMode: "working",
    contextFingerprint: await computeContextFingerprint(["documentType", "bilingual:false"]),
    decisions,
  });
}

Deno.test("манифестът е без PII и е валиден", async () => {
  const m = await manifest();
  assertEquals(m.version, 1);
  assertEquals(m.origin, "generate-contract");
  assert(/^[0-9a-f]{64}$/.test(m.content_fingerprint));
  assertEquals(validateQualityManifest(m)?.content_fingerprint, m.content_fingerprint);
  const json = JSON.stringify(m);
  assert(!json.includes("Изпълнителят"));
  assert(!json.includes("[име]"));
});

Deno.test("отпечатъкът е стабилен при разлики в празно място и регистър", async () => {
  const a = await computeContentFingerprint(docText);
  const b = await computeContentFingerprint(`  ${docText.replace(/\n/g, "\n  ").toUpperCase()}  `);
  assertEquals(a, b);
});

Deno.test("подправен манифест не се доверява", async () => {
  const m = await manifest();
  const tampered = { ...m, content_fingerprint: "0".repeat(64) };
  const res = await verifyQualityManifest({ manifest: tampered, content: contract });
  assertEquals(res.trusted, false);
  assertEquals(res.trusted === false && res.reason, "content_mismatch");

  const okRes = await verifyQualityManifest({ manifest: m, content: contract });
  assertEquals(okRes.trusted, true);

  assertEquals((await verifyQualityManifest({ manifest: null, content: contract })).trusted, false);
  assertEquals((await verifyQualityManifest({ manifest: { version: 99 }, content: contract })).trusted, false);
});

Deno.test("чист генериран документ без дефекти остава без дефекти", async () => {
  const m = await manifest();
  const { risk, quality } = applyRiskConsistencyGate({
    risk: { level: "medium", score: 55, summary: "ок", issues: [], recommendations: [], strengths: ["Уредена е цена и плащане по банков път."] },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 0);
  assertEquals(risk.level, "low");
  assertEquals(risk.score, 0);
  assertEquals(risk.strengths.length, 1);
  assertEquals(quality.trusted_manifest, true);
});

Deno.test("недоказана самокритика се маха или сваля до опционална препоръка", async () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      level: "high",
      score: 80,
      issues: [
        { severity: "high", title: "Липсва клауза за киберсигурност", detail: "Договорът не урежда изисквания за информационна сигурност на доставчика при обработка." },
        { severity: "medium", title: "Кратко", detail: "" },
      ],
      recommendations: [],
      strengths: [],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 0);
  assertEquals(risk.level, "low");
  assert(risk.recommendations.some((r) => r.startsWith("Опционално:")));
  assertEquals(quality.downgraded_issues, 1);
  assertEquals(quality.removed_issues, 1);
});

Deno.test("реално противоречие между клаузи се запазва", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{ severity: "medium", title: "Противоречие в сроковете", detail: "Чл. 3 сочи 30 дни, а Чл. 5 предвижда различни срокове за същото задължение." }],
      score: 40,
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 1);
  assertEquals(risk.level, "medium");
});

Deno.test("нищожна/незаконна клауза се запазва като висок риск", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{ severity: "high", title: "Нищожна клауза за отказ от съдебна защита", detail: "Клаузата е недействителна и противоречи на императивна норма." }],
      score: 10,
    },
    documentText: docText,
    origin: "build-custom-contract",
  });
  assertEquals(risk.issues.length, 1);
  assertEquals(risk.level, "high");
  assert(risk.score >= 30);
});

Deno.test("несъответствие с изричното желание на потребителя се запазва", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{ severity: "medium", title: "Не съответства на избрания режим на плащане", detail: "Потребителят е заявил плащане на етапи, а договорът предвижда еднократно плащане." }],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 1);
});

Deno.test("плейсхолдъри и опционални приложения не са дефект", async () => {
  const m = await manifest();
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      issues: [
        { severity: "medium", title: "Липсват данни за страните", detail: "Имената, ЕГН/ЕИК и адресите са оставени като плейсхолдъри в квадратни скоби." },
        { severity: "low", title: "Няма приложение със спецификация", detail: "Препоръчително е да се добави приложение с детайлна спецификация на услугите." },
      ],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 0);
  assert(quality.reason_codes.includes("intentional_drafting_decision"));
});

Deno.test("недоверен манифест не потиска находки по същество", async () => {
  const m = await manifest();
  const untrusted = applyRiskConsistencyGate({
    risk: {
      issues: [{ severity: "high", title: "Нищожна неустойка", detail: "Неустойката е прекомерна и клаузата е недействителна." }],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: false,
  });
  assertEquals(untrusted.risk.issues.length, 1);
  assertEquals(untrusted.quality.trusted_manifest, false);
  assertEquals(untrusted.quality.content_fingerprint, null);
});

Deno.test("режимът на съставяне не налага брой issues", () => {
  for (const origin of ["generate-contract", "build-custom-contract"] as const) {
    const { risk } = applyRiskConsistencyGate({
      risk: { issues: [], score: 70, level: "high" },
      documentText: docText,
      origin,
    });
    assertEquals(risk.issues.length, 0);
    assertEquals(risk.level, "low");
    assertEquals(risk.score, 0);
  }
});

Deno.test("рискът след прилагане на корекции се преоценява", () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      level: "high",
      score: 90,
      issues: [
        { severity: "high", title: "Липсва клауза за поверителност", detail: "Не е ясно как се третира информацията." },
        { severity: "medium", title: "Противоречие в сумите", detail: "Чл. 2 сочи различна сума от закриващата част на договора." },
      ],
      strengths: ["Уредени са неустойки при забава."],
    },
    documentText: docText,
    origin: "apply-corrections",
  });
  assertEquals(risk.issues.length, 1);
  assertEquals(risk.level, "medium");
  assert(risk.score <= 60);
  assertEquals(quality.origin, "apply-corrections");
});
