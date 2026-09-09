// N0/N1 — тестове за адаптерите и детерминистичните решения на монитора.
// Всичко е синтетично и локално: без мрежа, без DB записи, без AI/embeddings.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseCellarSparqlJson,
  parseEurLexOjIndex,
  parseNationalAssemblyIndex,
  parseStateGazetteIndex,
  parseStrategyConsultationsRss,
  runAdapter,
  sanitizeExternalText,
} from "./legal-source-adapters.ts";
import {
  buildRunRecord,
  computeFreshnessState,
  decideSnapshot,
  registryTouchForRun,
  toCandidateRows,
} from "./legal-monitor-core.ts";
import {
  CELLAR_SPARQL_JSON,
  DV_INDEX_HTML,
  DV_INDEX_HTML_CHANGED,
  EURLEX_OJ_HTML,
  MALFORMED_HTML,
  MALFORMED_JSON,
  MALFORMED_XML,
  NA_INDEX_HTML,
  PDF_METADATA_ONLY,
  STRATEGY_RSS,
  STRATEGY_RSS_PROMPT_INJECTION,
  testEntry,
} from "./legal-source.fixtures.ts";

// ---------- Държавен вестник ----------

Deno.test("ДВ: обнародване и влизане в сила са РАЗЛИЧНИ дати", () => {
  const env = parseStateGazetteIndex(DV_INDEX_HTML);
  assertEquals(env.parserStatus, "ok");
  const first = env.items[0];
  assertEquals(first.lifecycle, "promulgated");
  assertEquals(first.publicationDate, "2026-07-25");
  // Отложено влизане в сила остава отделна, изрично намерена дата.
  assertEquals(first.effectiveDate, "2027-01-01");
  assert(first.publicationDate !== first.effectiveDate);
});

Deno.test("ДВ: извънреден брой се маркира critical и има собствен ключ", () => {
  const env = parseStateGazetteIndex(DV_INDEX_HTML);
  const extra = env.items.find((i) => i.itemKey.includes(":x:"));
  assert(extra, "липсва извънреден брой");
  assertEquals(extra!.severity, "critical");
  assert(extra!.gazetteIssue!.includes("извънреден"));
  const normal = env.items.find((i) => i.itemKey.includes(":n:"));
  assert(normal && normal.itemKey !== extra!.itemKey);
});

Deno.test("ДВ: поправка се разпознава като corrected", () => {
  const env = parseStateGazetteIndex(DV_INDEX_HTML);
  assert(env.items.some((i) => i.lifecycle === "corrected"));
});

// ---------- Законодателен процес / консултации ----------

Deno.test("НС: законопроект НИКОГА не е действащо право", () => {
  const env = parseNationalAssemblyIndex(NA_INDEX_HTML);
  assertEquals(env.parserStatus, "ok");
  for (const item of env.items) {
    assertEquals(item.lifecycle, "proposed");
    // Дори когато текстът съдържа "Влиза в сила от ...", предложението няма дата.
    assertEquals(item.effectiveDate, null);
    assertEquals(item.severity, "watch");
  }
});

Deno.test("Strategy.bg: консултация е само предложение", () => {
  const env = parseStrategyConsultationsRss(STRATEGY_RSS);
  assertEquals(env.parserStatus, "ok");
  assertEquals(env.items.length, 1);
  assertEquals(env.items[0].lifecycle, "proposed");
  assertEquals(env.items[0].effectiveDate, null);
  assertEquals(env.items[0].publicationDate, "2026-08-03");
});

Deno.test("prompt-подобен текст остава ИНЕРТНИ данни", () => {
  const env = parseStrategyConsultationsRss(STRATEGY_RSS_PROMPT_INJECTION);
  assertEquals(env.parserStatus, "ok");
  const item = env.items[0];
  // Съдържанието не променя нито жизнения цикъл, нито тежестта.
  assertEquals(item.lifecycle, "proposed");
  assertEquals(item.severity, "watch");
  assertEquals(item.effectiveDate, null);
  // Текстът се пази само като ограничено, обезопасено резюме.
  assert(item.summary.length <= 4000);
  assert(!/[\u0000-\u001F]/.test(item.summary + item.title));
});

// ---------- EU ----------

Deno.test("EUR-Lex: CELEX се извлича, прилагането е отделна дата", () => {
  const env = parseEurLexOjIndex(EURLEX_OJ_HTML);
  assertEquals(env.parserStatus, "ok");
  const reg = env.items.find((i) => i.celex === "32026R1234");
  assert(reg);
  assertEquals(reg!.publicationDate, "2026-07-20");
  assertEquals(reg!.effectiveDate, "2027-01-01");
  assertEquals(reg!.gazetteIssue, null);
  assert(env.items.some((i) => i.lifecycle === "corrected"));
});

Deno.test("CELLAR: консолидацията е помощна и не доказва влизане в сила", () => {
  const env = parseCellarSparqlJson(CELLAR_SPARQL_JSON);
  assertEquals(env.parserStatus, "ok");
  assertEquals(env.items[0].lifecycle, "unknown");
  assert(env.items[0].summary.includes("non-authentic"));
});

// ---------- Fail-closed парсване ----------

Deno.test("парсер: деформиран вход => fail closed, без елементи", () => {
  const cases: Array<[string, string]> = [
    ["bg_state_gazette_index", MALFORMED_HTML],
    ["bg_strategy_consultations_rss", MALFORMED_XML],
    ["eu_cellar_sparql", MALFORMED_JSON],
    ["bg_state_gazette_index", PDF_METADATA_ONLY],
    ["bg_state_gazette_index", ""],
    ["eu_eurlex_oj_index", MALFORMED_HTML],
  ];
  for (const [adapter, raw] of cases) {
    const env = runAdapter(adapter, raw);
    assertEquals(env.items.length, 0, `${adapter} не трябва да връща елементи`);
    assertEquals(env.parserStatus, "parser_error");
    assert(env.errorCode !== null);
  }
});

Deno.test("парсер: дрейф на схемата се докладва needs_review, не фалшив успех", () => {
  // Реална форма, но без разпознаваем брой/CELEX в част от елементите.
  const drift = `<html><body><ul>
<li>Нова неразпозната структура без брой</li>
<li>Държавен вестник, брой 70 от 10.09.2026 г.</li>
</ul></body></html>`;
  const env = parseStateGazetteIndex(drift);
  assertEquals(env.parserStatus, "needs_review");
  assertEquals(env.errorCode, "unrecognized_schema");
  assertEquals(env.items.length, 1);

  const euDrift = `<html><body><ul><li>no celex here</li><li>32026R1234 — ok 2026-07-20</li></ul></body></html>`;
  assertEquals(parseEurLexOjIndex(euDrift).parserStatus, "needs_review");
});

Deno.test("парсер: таван на елементите", () => {
  const many = "<html><body><ul>" +
    Array.from({ length: 60 }, (_, i) => `<li>брой ${i + 1} от 01.01.2026 г.</li>`).join("") +
    "</ul></body></html>";
  const env = parseStateGazetteIndex(many);
  assertEquals(env.parserStatus, "parser_error");
  assertEquals(env.errorCode, "item_cap_exceeded");
  assertEquals(env.items.length, 0);
});

Deno.test("парсер: неизвестен адаптер => контролирана грешка", () => {
  const env = runAdapter("does_not_exist", DV_INDEX_HTML);
  assertEquals(env.parserStatus, "parser_error");
  assertEquals(env.items.length, 0);
});

Deno.test("sanitize: контролните символи изчезват и дължината е ограничена", () => {
  const s = sanitizeExternalText("a\u0000b\u001Fc" + "x".repeat(9000), 100);
  assert(!/[\u0000-\u001F]/.test(s));
  assertEquals(s.length, 100);
});

// ---------- Идемпотентност на snapshot / кандидати ----------

Deno.test("snapshot: идентичен checksum е no-op; променен създава кандидати", () => {
  assertEquals(decideSnapshot("a".repeat(64), "a".repeat(64)), "unchanged");
  assertEquals(decideSnapshot("a".repeat(64), "b".repeat(64)), "new_snapshot");
  assertEquals(decideSnapshot(null, "b".repeat(64)), "new_snapshot");

  const before = parseStateGazetteIndex(DV_INDEX_HTML);
  const after = parseStateGazetteIndex(DV_INDEX_HTML_CHANGED);
  assert(JSON.stringify(before.items) !== JSON.stringify(after.items));
});

Deno.test("кандидати: един елемент от един snapshot дава точно един ред", () => {
  const env = parseStateGazetteIndex(DV_INDEX_HTML);
  const rows = toCandidateRows(env, "11111111-1111-1111-1111-111111111111", "c".repeat(64));
  const keys = rows.map((r) => r.item_key);
  assertEquals(new Set(keys).size, keys.length);
  for (const r of rows) {
    assert(r.title.length <= 500);
    assert(r.summary.length <= 4000);
    // CELEX и брой на ДВ са взаимно изключващи се.
    assert(r.celex === null || r.gazette_issue === null);
    assertEquals(r.diff_metadata.snapshot_checksum, "c".repeat(64));
  }
});

Deno.test("кандидати: proposed никога не носи дата на влизане в сила", () => {
  const env = parseStrategyConsultationsRss(STRATEGY_RSS);
  // Дори при форсиран вход инвариантът се налага на слоя за запис.
  env.items[0].effectiveDate = "2027-01-01";
  const rows = toCandidateRows(env, "22222222-2222-2222-2222-222222222222", "d".repeat(64));
  assertEquals(rows[0].lifecycle, "proposed");
  assertEquals(rows[0].effective_date, null);
});

// ---------- Пробези и свежест ----------

Deno.test("пробег: неуспехът НИКОГА не обновява last_success_at", () => {
  const entry = testEntry();
  const prev = "2026-09-01T00:00:00.000Z";
  for (const outcome of ["failed", "needs_review", "skipped"] as const) {
    const touch = registryTouchForRun({
      entry,
      outcome,
      at: "2026-09-09T10:00:00.000Z",
      previousLastSuccessAt: prev,
    });
    assertEquals(touch.last_success_at, undefined);
    assertEquals(touch.last_change_at, undefined);
    assertEquals(touch.last_attempt_at, "2026-09-09T10:00:00.000Z");
  }
  const okTouch = registryTouchForRun({
    entry,
    outcome: "changed",
    at: "2026-09-09T10:00:00.000Z",
    previousLastSuccessAt: prev,
  });
  assertEquals(okTouch.last_success_at, "2026-09-09T10:00:00.000Z");
  assertEquals(okTouch.last_change_at, "2026-09-09T10:00:00.000Z");
});

Deno.test("пробег: error_code е затворен код и само при неуспех", () => {
  const ok = buildRunRecord({
    sourceKey: "bg_state_gazette",
    trigger: "manual",
    startedAt: "2026-09-09T10:00:00.000Z",
    finishedAt: "2026-09-09T10:00:01.000Z",
    outcome: "changed",
    errorCode: "should_be_dropped",
  });
  assertEquals(ok.error_code, null);

  const bad = buildRunRecord({
    sourceKey: "bg_state_gazette",
    trigger: "manual",
    startedAt: "2026-09-09T10:00:00.000Z",
    finishedAt: "2026-09-09T10:00:01.000Z",
    outcome: "failed",
    errorCode: "<html>secret body</html>",
  });
  // Свободен текст не преминава: остава null вместо да изтече съдържание.
  assertEquals(bad.error_code, null);

  const closed = buildRunRecord({
    sourceKey: "bg_state_gazette",
    trigger: "manual",
    startedAt: "2026-09-09T10:00:00.000Z",
    finishedAt: "2026-09-09T10:00:01.000Z",
    outcome: "failed",
    errorCode: "redirect_origin_changed",
  });
  assertEquals(closed.error_code, "redirect_origin_changed");
});

Deno.test("свежест: изключен / липсващ успех / остарял / актуален", () => {
  const now = Date.parse("2026-09-09T12:00:00.000Z");
  assertEquals(
    computeFreshnessState({
      enabled: false,
      expectedCadence: "daily",
      lastSuccessAt: null,
      lastAttemptAt: null,
      nowMs: now,
    }),
    "disabled",
  );
  assertEquals(
    computeFreshnessState({
      enabled: true,
      expectedCadence: "daily",
      lastSuccessAt: null,
      lastAttemptAt: null,
      nowMs: now,
    }),
    "unknown",
  );
  assertEquals(
    computeFreshnessState({
      enabled: true,
      expectedCadence: "daily",
      lastSuccessAt: null,
      lastAttemptAt: "2026-09-09T11:00:00.000Z",
      nowMs: now,
    }),
    "failing",
  );
  assertEquals(
    computeFreshnessState({
      enabled: true,
      expectedCadence: "daily",
      lastSuccessAt: "2026-09-09T09:00:00.000Z",
      lastAttemptAt: "2026-09-09T11:00:00.000Z",
      nowMs: now,
    }),
    "fresh",
  );
  assertEquals(
    computeFreshnessState({
      enabled: true,
      expectedCadence: "daily",
      lastSuccessAt: "2026-08-01T09:00:00.000Z",
      lastAttemptAt: "2026-09-09T11:00:00.000Z",
      nowMs: now,
    }),
    "stale",
  );
});

Deno.test("изолация: провалът на един източник не отбелязва друг като успешен", () => {
  const entry = testEntry();
  const results = (["failed", "changed"] as const).map((outcome, i) =>
    registryTouchForRun({
      entry,
      outcome,
      at: `2026-09-09T1${i}:00:00.000Z`,
      previousLastSuccessAt: null,
    })
  );
  assertEquals(results[0].last_success_at, undefined);
  assertEquals(results[1].last_success_at, "2026-09-09T11:00:00.000Z");
  assert(results[0].freshness_state !== "fresh");
});

Deno.test("контракт: изходът на монитора не съдържа сурови payload-и", () => {
  const env = parseStateGazetteIndex(DV_INDEX_HTML);
  const record = buildRunRecord({
    sourceKey: env.sourceKey,
    trigger: "dry_run",
    startedAt: "2026-09-09T10:00:00.000Z",
    finishedAt: "2026-09-09T10:00:01.000Z",
    outcome: "changed",
    discovered: env.items.length,
    changed: env.items.length,
    byteCount: DV_INDEX_HTML.length,
    contentType: "text/html",
  });
  const serialized = JSON.stringify(record);
  assert(!serialized.includes("<html"));
  assert(!serialized.includes("Държавен вестник"));
  assertEquals(
    Object.keys(record).sort().join(","),
    "byte_count,changed_count,content_type,discovered_count,error_code,finished_at,http_status,outcome,source_key,started_at,trigger",
  );
});
