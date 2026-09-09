// Q4a — регресионен корпус за качеството на собствено генерираните документи.
// Подписът се тества с ФИКСИРАН фалшив секрет — истинският сървърен ключ никога
// не участва в тестове и никъде не се отпечатва.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRiskConsistencyGate,
  buildQualityManifest,
  computeContentFingerprint,
  computeContextFingerprint,
  computeManifestTrustIdentity,
  flattenGeneratedContract,
  renderCanonicalPlainText,
  validateQualityManifest,
  verifyQualityManifest,
} from "./generated-document-quality.ts";

const SECRET = "fake-service-role-secret-for-tests-0123456789";
const OTHER_SECRET = "different-fake-secret-0123456789abcdef";

const contract = {
  title: "Договор за изработка",
  preamble: "Днес, [дата], между [име] и [име] се сключи следният договор.",
  clauses: [
    { number: "Чл. 1.", title: "Предмет", body: "Изпълнителят се задължава да изработи уеб сайт срещу възнаграждение." },
    { number: "Чл. 2.", title: "Цена и плащане", body: "Възнаграждението е в размер на [сума] евро, платимо по банков път." },
    { number: "Чл. 3.", title: "Срок", body: "Срокът за изпълнение е 30 дни от датата на сключване." },
    { number: "Чл. 4.", title: "Неустойки", body: "При забава се дължи неустойка в размер на 0,1% на ден без ограничение в общия размер." },
    { number: "Чл. 5.", title: "Прекратяване", body: "Договорът се прекратява по реда на ЗЗД, като страните нямат право на съдебна защита." },
  ],
  closing: "ВЪЗЛОЖИТЕЛ: [име] ИЗПЪЛНИТЕЛ: [име]",
};

const docText = flattenGeneratedContract(contract);

async function manifest(
  decisions: string[] = ["placeholders_for_personal_data", "optional_annex_details"],
  secret = SECRET,
) {
  return await buildQualityManifest({
    origin: "generate-contract",
    contract,
    signingSecret: secret,
    documentType: "dogovor-za-izrabotka",
    buildMode: "working",
    contextFingerprint: await computeContextFingerprint(["documentType", "bilingual:false"]),
    decisions,
  });
}

// ---------------------------------------------------------------------------
// Манифест, отпечатък, подпис
// ---------------------------------------------------------------------------

Deno.test("манифестът е без PII, подписан и валиден", async () => {
  const m = await manifest();
  assertEquals(m.version, 1);
  assertEquals(m.origin, "generate-contract");
  assertEquals(m.signature.alg, "HMAC-SHA-256");
  assert(/^[0-9a-f]{64}$/.test(m.signature.value));
  assert(/^[0-9a-f]{64}$/.test(m.content_fingerprint));
  assertEquals(validateQualityManifest(m)?.content_fingerprint, m.content_fingerprint);
  const json = JSON.stringify(m);
  assert(!json.includes("Изпълнителят"));
  assert(!json.includes("[име]"));
  assert(!json.includes(SECRET));
});

Deno.test("без ключ за подпис няма манифест (fail closed)", async () => {
  await assertRejects(() =>
    buildQualityManifest({ origin: "generate-contract", contract, signingSecret: "" })
  );
});

Deno.test("отпечатъкът пренебрегва само празно място, НЕ регистъра", async () => {
  const a = await computeContentFingerprint(docText);
  const spaced = await computeContentFingerprint(`  ${docText.replace(/\n/g, " \r\n ")}  `);
  assertEquals(a, spaced);
  const upper = await computeContentFingerprint(docText.toUpperCase());
  assert(a !== upper, "смяна на регистъра ТРЯБВА да променя отпечатъка");
});

Deno.test("смяна на регистъра в документа обезсилва доверието", async () => {
  const m = await manifest();
  const changed = { ...contract, title: "ДОГОВОР ЗА ИЗРАБОТКА" };
  const res = await verifyQualityManifest({ manifest: m, content: changed, signingSecret: SECRET });
  assertEquals(res.trusted, false);
  assertEquals(res.trusted === false && res.reason, "content_mismatch");
});

Deno.test("английските полета също се обвързват", async () => {
  const bilingual = {
    ...contract,
    bilingual: true,
    title_en: "Service Agreement",
    preamble_en: "Today, between the parties, the following agreement was concluded.",
    closing_en: "CLIENT: [name] CONTRACTOR: [name]",
    clauses: contract.clauses.map((c, i) =>
      i === 0 ? { ...c, title_en: "Subject", body_en: "The contractor shall build a website." } : c
    ),
  };
  const m = await buildQualityManifest({
    origin: "build-custom-contract",
    contract: bilingual,
    signingSecret: SECRET,
    decisions: ["bilingual_parallel_text"],
  });
  assertEquals((await verifyQualityManifest({ manifest: m, content: bilingual, signingSecret: SECRET })).trusted, true);

  const enChanged = {
    ...bilingual,
    clauses: bilingual.clauses.map((c, i) =>
      i === 0 ? { ...c, body_en: "The contractor shall build a mobile app." } : c
    ),
  };
  const res = await verifyQualityManifest({ manifest: m, content: enChanged, signingSecret: SECRET });
  assertEquals(res.trusted, false);
  assertEquals(res.trusted === false && res.reason, "content_mismatch");

  const flagChanged = { ...bilingual, bilingual: false };
  assertEquals(
    (await verifyQualityManifest({ manifest: m, content: flagChanged, signingSecret: SECRET })).trusted,
    false,
  );
});

Deno.test("подправяне на твърденията се отхвърля с signature_mismatch", async () => {
  const m = await manifest();
  const cases: Record<string, unknown>[] = [
    { ...m, decisions: ["placeholders_for_personal_data", "optional_annex_details", "brief_clause_set"] },
    { ...m, origin: "apply-corrections" },
    { ...m, document_type: "dogovor-za-naem" },
    { ...m, build_mode: "strict" },
    { ...m, context_fingerprint: "a".repeat(64) },
  ];
  for (const forged of cases) {
    const res = await verifyQualityManifest({ manifest: forged, content: contract, signingSecret: SECRET });
    assertEquals(res.trusted, false);
    assertEquals(res.trusted === false && res.reason, "signature_mismatch");
  }
});

Deno.test("манифест, изфабрикуван от клиент или подписан с чужд ключ, не се доверява", async () => {
  const claims = await manifest();
  const clientForged = { ...claims, signature: { v: 1, alg: "HMAC-SHA-256", value: "b".repeat(64) } };
  const r1 = await verifyQualityManifest({ manifest: clientForged, content: contract, signingSecret: SECRET });
  assertEquals(r1.trusted === false && r1.reason, "signature_mismatch");

  const wrongKey = await manifest(undefined, OTHER_SECRET);
  const r2 = await verifyQualityManifest({ manifest: wrongKey, content: contract, signingSecret: SECRET });
  assertEquals(r2.trusted === false && r2.reason, "signature_mismatch");

  const noSig = { ...claims } as Record<string, unknown>;
  delete noSig.signature;
  const r3 = await verifyQualityManifest({ manifest: noSig, content: contract, signingSecret: SECRET });
  assertEquals(r3.trusted === false && r3.reason, "invalid");

  assertEquals(
    (await verifyQualityManifest({ manifest: null, content: contract, signingSecret: SECRET })).trusted,
    false,
  );
  const noKey = await verifyQualityManifest({ manifest: claims, content: contract, signingSecret: null });
  assertEquals(noKey.trusted === false && noKey.reason, "signing_key_missing");

  const ok = await verifyQualityManifest({ manifest: claims, content: contract, signingSecret: SECRET });
  assertEquals(ok.trusted, true);
});

Deno.test("причините се различават: absent / invalid / signature / content", async () => {
  const m = await manifest();
  const reasons: string[] = [];
  for (
    const c of [
      { manifest: undefined, content: contract },
      { manifest: { version: 99 }, content: contract },
      { manifest: { ...m, origin: "refine-contract" }, content: contract },
      { manifest: { ...m, content_fingerprint: "0".repeat(64) }, content: contract },
    ]
  ) {
    const r = await verifyQualityManifest({ ...c, signingSecret: SECRET });
    reasons.push(r.trusted === false ? r.reason : "trusted");
  }
  assertEquals(reasons, ["absent", "invalid", "signature_mismatch", "signature_mismatch"]);

  // Точно content_mismatch: валиден подпис, но друго съдържание.
  const other = { ...contract, title: "Договор за наем" };
  const r = await verifyQualityManifest({ manifest: m, content: other, signingSecret: SECRET });
  assertEquals(r.trusted === false && r.reason, "content_mismatch");
});

Deno.test("идентичността за кеша се различава при различно доверие/решения", async () => {
  const a = await computeManifestTrustIdentity(
    await verifyQualityManifest({ manifest: await manifest(), content: contract, signingSecret: SECRET }),
  );
  const b = await computeManifestTrustIdentity(
    await verifyQualityManifest({
      manifest: await manifest(["placeholders_for_personal_data"]),
      content: contract,
      signingSecret: SECRET,
    }),
  );
  const untrusted = await computeManifestTrustIdentity(
    await verifyQualityManifest({ manifest: null, content: contract, signingSecret: SECRET }),
  );
  assert(a !== b, "различни решения → различен кеш-ключ");
  assert(a !== untrusted && b !== untrusted, "доверен и недоверен анализ не споделят кеш");
});

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

Deno.test("чист генериран документ без дефекти остава без дефекти", async () => {
  const m = await manifest();
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      level: "medium",
      score: 55,
      summary: "ок",
      issues: [],
      recommendations: [],
      strengths: ["Уредено е възнаграждението и плащането по банков път."],
    },
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

Deno.test("недоказана самокритика се маха или сваля до опционална препоръка", () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      level: "high",
      score: 80,
      issues: [
        { severity: "high", title: "Липсва клауза за киберсигурност", detail: "Документът не урежда изисквания за информационна сигурност на доставчика при обработка." },
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

Deno.test("етикет 'нищожна клауза' БЕЗ доказателство не е дефект", () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "high",
        title: "Нищожна клауза за конкуренция",
        detail: "Клаузата е недействителна, защото ограничава конкуренцията без териториално ограничение.",
      }],
      score: 90,
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 0, "халюциниран дефект без цитат не се пази");
  assertEquals(risk.level, "low");
  assert(quality.reason_codes.includes("legal_label_unsupported"));
});

Deno.test("реално противоречие между клаузи се запазва (с цитат)", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "medium",
        title: "Противоречие в сроковете",
        detail: "Чл. 3 сочи 30 дни, а закриващата част предвижда различни срокове за същото задължение.",
        quote: "Срокът за изпълнение е 30 дни от датата на сключване.",
      }],
      score: 40,
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 1);
  assertEquals(risk.level, "medium");
});

Deno.test("незаконна клауза с дословен цитат се запазва като висок риск", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "high",
        title: "Нищожен отказ от съдебна защита",
        detail: "Отказът от съдебна защита противоречи на императивна норма и клаузата е недействителна.",
        clause: "Договорът се прекратява по реда на ЗЗД, като страните нямат право на съдебна защита.",
      }],
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
      issues: [{
        severity: "medium",
        title: "Не съответства на заявеното плащане",
        detail: "Заявено е плащане на етапи, а документът предвижда еднократно възнаграждение по банков път.",
        quote: "Възнаграждението е в размер на [сума] евро, платимо по банков път.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 1);
});

Deno.test("плейсхолдъри и опционални приложения не са дефект ПРИ доверен манифест", async () => {
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

Deno.test("БЕЗ доверен манифест умишлените решения НЕ се потискат (fail closed)", async () => {
  const m = await manifest();
  const issues = [{
    severity: "medium",
    title: "Липсват данни за страните",
    detail: "Имената, ЕГН/ЕИК и адресите са оставени като плейсхолдъри в квадратни скоби.",
    quote: "Днес, [дата], между [име] и [име] се сключи следният договор.",
  }];
  for (const trustedManifest of [false, undefined]) {
    const res = applyRiskConsistencyGate({
      risk: { issues },
      documentText: docText,
      origin: "generate-contract",
      manifest: m,
      trustedManifest,
    });
    assertEquals(res.quality.trusted_manifest, false);
    assertEquals(res.quality.content_fingerprint, null);
    assert(!res.quality.reason_codes.includes("intentional_drafting_decision"));
    assertEquals(res.risk.issues.length, 1, "външен документ: находката остава");
  }
});

Deno.test("доверен манифест потиска САМО изброените решения", async () => {
  const only = await manifest(["optional_annex_details"]);
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "medium",
        title: "Липсват данни за страните",
        detail: "Имената, ЕГН/ЕИК и адресите са оставени като плейсхолдъри в квадратни скоби.",
        quote: "Днес, [дата], между [име] и [име] се сключи следният договор.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: only,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 1, "решението за лични данни не е в манифеста → няма потискане");
});

Deno.test("стилистичните бележки стават опционални, а не дефект", () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      issues: [{ severity: "medium", title: "Стилът на текста е твърде тежък", detail: "Формулировките са дълги и трудни за четене от неюрист." }],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.issues.length, 0);
  assert(quality.reason_codes.includes("style_note_downgraded"));
  assert(risk.recommendations.some((r) => r.startsWith("Опционално:")));
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
        {
          severity: "medium",
          title: "Противоречие в сумите",
          detail: "Чл. 2 сочи различна сума от закриващата част на документа.",
          quote: "Възнаграждението е в размер на [сума] евро, платимо по банков път.",
        },
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

// ---------------------------------------------------------------------------
// Q4a — обвързване по КАНОНИЧЕН ЧЕТИМ ТЕКСТ (пътят на ревизията)
// ---------------------------------------------------------------------------

/** Златен образец — ТОЧНО същият, който `contractToPlainText` дава на фронтенда. */
const GOLDEN_CONTRACT = {
  title: "ДОГОВОР ЗА ИЗРАБОТКА",
  preamble: "Днес, между страните, се сключи следният договор:",
  clauses: [
    { number: "Чл. 1", title: "Предмет", body: "Изпълнителят изработва уеб сайт." },
    { number: "Чл. 2", title: "Цена", body: "Възнаграждението е 1000 EUR." },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
};

const GOLDEN_PLAIN_TEXT = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "Днес, между страните, се сключи следният договор:",
  "Чл. 1 Предмет",
  "Изпълнителят изработва уеб сайт.",
  "Чл. 2 Цена",
  "Възнаграждението е 1000 EUR.",
  "Настоящият договор се подписа в два еднообразни екземпляра.",
].join("\n\n");

Deno.test("каноничният четим текст съвпада със златния образец на фронтенда", () => {
  assertEquals(renderCanonicalPlainText(GOLDEN_CONTRACT), GOLDEN_PLAIN_TEXT);
});

Deno.test("ревизия по чист текст се доверява на подписания манифест", async () => {
  const manifest = await buildQualityManifest({
    origin: "generate-contract",
    contract: GOLDEN_CONTRACT,
    signingSecret: SECRET,
    decisions: ["placeholders_for_personal_data"],
  });
  const trust = await verifyQualityManifest({
    manifest,
    content: GOLDEN_PLAIN_TEXT,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assertEquals(trust.trusted, true);

  // Без изричното разрешение чистият текст НЕ е обвързан със структурата.
  const strict = await verifyQualityManifest({
    manifest,
    content: GOLDEN_PLAIN_TEXT,
    signingSecret: SECRET,
  });
  assertEquals(strict.trusted, false);
});

Deno.test("редактиран чист текст (дори само регистър) губи доверието", async () => {
  const manifest = await buildQualityManifest({
    origin: "generate-contract",
    contract: GOLDEN_CONTRACT,
    signingSecret: SECRET,
  });
  for (
    const edited of [
      GOLDEN_PLAIN_TEXT.replace("Цена", "цена"),
      GOLDEN_PLAIN_TEXT.replace("1000 EUR", "5000 EUR"),
    ]
  ) {
    const trust = await verifyQualityManifest({
      manifest,
      content: edited,
      signingSecret: SECRET,
      allowPlaintextMatch: true,
    });
    assertEquals(trust.trusted, false);
    if (!trust.trusted) assertEquals(trust.reason, "content_mismatch");
  }
});

// ---------------------------------------------------------------------------
// Q4a — препокриване: доказан съществен дефект НЕ се крие от умишлено решение
// ---------------------------------------------------------------------------

Deno.test("цитирано реално противоречие остава, макар да споменава приложение", async () => {
  const m = await manifest();
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "high",
        title: "Противоречие между приложението и чл. 2",
        detail:
          "Липсва приложение със спецификация, но чл. 2 препраща към него за размера на възнаграждението — двете разпоредби си противоречат.",
        quote: "Възнаграждението е в размер на [сума] евро, платимо по банков път.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 1);
  assert(quality.reason_codes.includes("substantive_defect_preserved"));
  assert(!quality.reason_codes.includes("intentional_drafting_decision"));
});

Deno.test("цитирана нищожна клауза остава, макар да споменава плейсхолдъри", async () => {
  const m = await manifest();
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "high",
        title: "Нищожна клауза до плейсхолдърите за лични данни",
        detail: "Отказът от съдебна защита е нищожен, независимо че имената са оставени като плейсхолдъри.",
        quote: "Договорът се прекратява по реда на ЗЗД, като страните нямат право на съдебна защита.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 1);
});

Deno.test("НЕсъществена самокритика все още се потиска при доверен манифест", async () => {
  const m = await manifest();
  const { risk, quality } = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "low",
        title: "Няма приложение със спецификация",
        detail: "Препоръчително е да се добави приложение с детайлна спецификация на услугите.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
    manifest: m,
    trustedManifest: true,
  });
  assertEquals(risk.issues.length, 0);
  assert(quality.reason_codes.includes("intentional_drafting_decision"));
});

// ---------------------------------------------------------------------------
// Q4a — силните страни изискват робустно доказателство
// ---------------------------------------------------------------------------

Deno.test("силна страна с една случайна дума се маха (лъжливо положителна)", () => {
  const { risk, quality } = applyRiskConsistencyGate({
    risk: { issues: [], strengths: ["Уредена е арбитражна процедура пред международна институция."] },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.strengths.length, 0);
  assert(quality.reason_codes.includes("strength_unsupported_removed"));
});

Deno.test("силна страна с реално покритие в текста се запазва", () => {
  const { risk } = applyRiskConsistencyGate({
    risk: {
      issues: [],
      strengths: [
        "Уредени са възнаграждението, срокът за изпълнение и неустойка при забава.",
      ],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(risk.strengths.length, 1);
});

// ---------------------------------------------------------------------------
// Q4a — двуезичен каноничен четим текст (паритет с фронтенда)
// ---------------------------------------------------------------------------

const GOLDEN_BILINGUAL = {
  title: "ДОГОВОР ЗА ИЗРАБОТКА",
  title_en: "WORK CONTRACT",
  preamble: "Днес, между страните, се сключи следният договор:",
  preamble_en: "Today, the parties concluded the following contract:",
  bilingual: true,
  clauses: [
    {
      number: "Чл. 1",
      title: "Предмет",
      title_en: "Subject",
      body: "Изпълнителят изработва уеб сайт.",
      body_en: "The contractor builds a website.",
    },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
  closing_en: "This contract was signed in two identical counterparts.",
};

const GOLDEN_BILINGUAL_PLAIN_TEXT = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "WORK CONTRACT",
  "Днес, между страните, се сключи следният договор:",
  "Today, the parties concluded the following contract:",
  "Чл. 1 Предмет",
  "Изпълнителят изработва уеб сайт.",
  "Чл. 1 Subject",
  "The contractor builds a website.",
  "Настоящият договор се подписа в два еднообразни екземпляра.",
  "This contract was signed in two identical counterparts.",
].join("\n\n");

Deno.test("двуезичният каноничен текст включва и английските полета", () => {
  assertEquals(renderCanonicalPlainText(GOLDEN_BILINGUAL), GOLDEN_BILINGUAL_PLAIN_TEXT);
});

Deno.test("промяна САМО в английския текст обезсилва подадения манифест", async () => {
  const m = await buildQualityManifest({
    origin: "generate-contract",
    contract: GOLDEN_BILINGUAL,
    signingSecret: SECRET,
  });
  const ok = await verifyQualityManifest({
    manifest: m,
    content: GOLDEN_BILINGUAL_PLAIN_TEXT,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assertEquals(ok.trusted, true);

  const edited = GOLDEN_BILINGUAL_PLAIN_TEXT.replace("builds a website", "builds a mobile app");
  const bad = await verifyQualityManifest({
    manifest: m,
    content: edited,
    signingSecret: SECRET,
    allowPlaintextMatch: true,
  });
  assertEquals(bad.trusted, false);
  if (!bad.trusted) assertEquals(bad.reason, "content_mismatch");
});

// ---------------------------------------------------------------------------
// Q4a — ОГРАНИЧЕНИЕ: отпечатъкът не носи стойностите на потребителското желание
// ---------------------------------------------------------------------------

Deno.test("ограничение: несъответствие с желанието се пази само с доказателство + изрично твърдение", () => {
  // Има изрично твърдение за несъответствие + дословен цитат → запазва се.
  const withEvidence = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "medium",
        title: "Не съответства на заявения срок",
        detail: "Заявен е срок от 60 дни, а документът предвижда 30 дни.",
        quote: "Срокът за изпълнение е 30 дни от датата на сключване.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(withEvidence.risk.issues.length, 1);

  // Без доказателство от ТЕКУЩИЯ документ твърдението не се приема за дефект —
  // отпечатъкът на контекста е защитаващ поверителността и НЕ съдържа
  // стойностите на желанието, така че типизираното сравнение остава за
  // следващия етап (каноничен контекст).
  const withoutEvidence = applyRiskConsistencyGate({
    risk: {
      issues: [{
        severity: "high",
        title: "Не съответства на заявеното",
        detail: "Клиентът вероятно е искал друга уговорка за прехвърляне на авторските правомощия.",
      }],
    },
    documentText: docText,
    origin: "generate-contract",
  });
  assertEquals(withoutEvidence.risk.issues.length, 0);
  assert(withoutEvidence.quality.reason_codes.includes("legal_label_unsupported"));
});
