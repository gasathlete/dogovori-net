/**
 * Deno проверка на Edge-safe основата: валидаторът, картата на източника,
 * разделянето без загуба, доказателствата и поправките.
 *
 * Тук се пази ЕДНАКВОТО поведение с браузърния слой (същите модули).
 */
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countProductSourceChars, PRODUCT_SOURCE_CHAR_UNIT } from "./product-source.ts";
import { validateProductResult } from "./product-result-contract.ts";
import { buildSourceMap, sliceByCodePoints, validatePageBoundaries } from "./product-source-map.ts";
import { chunkProductSource, verifyChunkCoverage } from "./product-source-chunks.ts";
import { resolveEvidence } from "./product-evidence.ts";
import { correctionId, resolveAnchorOverlaps } from "./product-corrections.ts";
import { runAbsenceCheck } from "./product-absence-check.ts";

const SOURCE = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "",
  "3. Цена и плащане",
  "Възнаграждението е 24 000 € без ДДС и се плаща в срок от 20 дни след приемане.",
  "При забава Възложителят дължи неустойка 0,5% на ден без ограничение в размера.",
  "",
  "6. Спорове",
  "Споровете се решават от съда по седалището на Възложителя в град Пловди́в ✅.",
].join("\n");

function span(needle: string) {
  const cps = Array.from(SOURCE);
  const wanted = Array.from(needle);
  for (let i = 0; i + wanted.length <= cps.length; i += 1) {
    if (cps.slice(i, i + wanted.length).join("") === needle) {
      return { start: i, end: i + wanted.length, excerpt: needle };
    }
  }
  throw new Error(`липсва: ${needle}`);
}

const penalty = span("неустойка 0,5% на ден без ограничение в размера");

/** Копие без типове: тестовете чупят нарочно точно по едно поле. */
// deno-lint-ignore no-explicit-any
function clone(): any {
  return structuredClone(BASE);
}

const BASE = {
  schema_version: 2,
  product_id: "contract_check",
  generated_at: "2026-09-12T09:00:00.000Z",
  source: {
    document_id: "3f1c9d64-0f4a-4b7e-9a2c-6d5e8b1a2c34",
    source_hash: "a".repeat(64),
    source_kind: "pdf",
    char_count: countProductSourceChars(SOURCE),
    char_unit: PRODUCT_SOURCE_CHAR_UNIT,
    source_updated_at: "2026-09-12T08:30:00.000Z",
    page_count: null,
  },
  payload: {
    passport: {
      title: "Договор за изработка",
      document_type: "Договор за изработка",
      parties: [],
      governing_law: null,
      signature_state: null,
    },
    executive_summary: "Неустойката за забава няма таван.",
    priority_summary: [{ finding_id: "f_cap", rank: 1, reason: "Най-голям паричен риск." }],
    findings: [
      {
        id: "f_cap",
        title: "Неустойка без таван",
        severity: "high",
        affected_party: "counterparty",
        explanation: "Неустойката расте без ограничение при продължителна забава.",
        consequence: "При 20 дни забава дължимото е 2 400 € и продължава да расте.",
        next_step: "Предложете таван като процент от възнаграждението.",
        span: penalty,
      },
    ],
    obligations: [],
    economic_terms: [],
    termination: { summary: "Няма изрична клауза за прекратяване.", spans: [] },
    disputes: { summary: "Спорът е пред съда по седалището на Възложителя.", spans: [] },
    contradictions: [],
    absence_checks: [],
    missing_protections: [],
    questions: [],
  },
};

Deno.test("валидаторът приема пълен резултат по схема v2", () => {
  const res = validateProductResult(structuredClone(BASE));
  assert(res.ok, JSON.stringify(res));
});

Deno.test("валидаторът е дълбок: чупи се на едно поле навътре", () => {
  const bad = clone();
  bad.payload.findings[0].span.excerpt = "измислено";
  assertFalse(validateProductResult(bad).ok);

  const badUnit = clone();
  badUnit.source.char_unit = "utf16_units";
  assertFalse(validateProductResult(badUnit).ok);

  const badVersion = clone();
  badVersion.schema_version = 1;
  assertFalse(validateProductResult(badVersion).ok);
});

Deno.test("нула находки е валиден резултат", () => {
  const clean = clone();
  clean.payload.findings = [];
  clean.payload.priority_summary = [];
  assert(validateProductResult(clean).ok);
});

Deno.test("частите покриват всеки знак от източника", () => {
  const map = buildSourceMap(SOURCE);
  const chunks = chunkProductSource(map, { maxChars: 120, overlapChars: 20 });
  const coverage = verifyChunkCoverage(chunks, map.charCount);
  assert(coverage.complete);
  assertEquals(coverage.gaps.length, 0);
  assertEquals(
    chunks.map((c) => sliceByCodePoints(SOURCE, c.start, c.end)).join(""),
    SOURCE,
  );
});

Deno.test("доказателството се проверява срещу точния източник", () => {
  const ok = resolveEvidence(SOURCE, { excerpt: "неустойка 0,5% на ден" });
  assert(ok.ok);
  assertFalse(resolveEvidence(SOURCE, { excerpt: "клауза, която не съществува тук" }).ok);
  assertFalse(resolveEvidence(SOURCE, { excerpt: "неустойка 0,5% на ден", start: 0, end: 21 }).ok);
});

Deno.test("поправките имат стабилен идентификатор и не се застъпват", () => {
  const anchor = {
    id: "x",
    start: penalty.start,
    end: penalty.end,
    mode: "replace" as const,
    original_text: penalty.excerpt,
  };
  assertEquals(correctionId(anchor), correctionId({ ...anchor }));
  const resolved = resolveAnchorOverlaps([
    anchor,
    { ...anchor, id: "y", start: penalty.start + 5 },
  ]);
  assertEquals(resolved.kept.length, 1);
});

Deno.test("проверката за отсъствие не измисля правен извод", () => {
  const check = runAbsenceCheck(SOURCE, {
    id: "a_cap",
    concept: "Таван на неустойката",
    terms: ["таван", "не повече от"],
  });
  assertFalse(check.found);
  assertEquals(check.spans.length, 0);
  assertEquals(check.coverage, "whole_document");
});

// ---------------------------------------------------- Unicode: точни отмествания

/** Източник с няколко знака извън BMP преди и вътре в целта. */
const NON_BMP_SOURCE = [
  "🙂 Начало 🙂 на документа.",
  "Клаузата гласи: неустойка 🙂 0,5% на ден без ТАВАН и без ограничение.",
  "Отделно: неустойка 0,5% на ден без ограничение.",
  "Край 🙂 с комбиниран знак Пловди́в.",
].join("\n");

Deno.test("извадка след и вътре в емоджи сочи точното място", () => {
  const needle = "неустойка 🙂 0,5% на ден без ТАВАН";
  const res = resolveEvidence(NON_BMP_SOURCE, { excerpt: needle });
  assert(res.ok, JSON.stringify(res));
  if (!res.ok) return;
  assertEquals(
    sliceByCodePoints(NON_BMP_SOURCE, res.span.start, res.span.end),
    res.span.excerpt,
  );
  assertEquals(res.span.excerpt, needle);
  // Отместването е в кодови точки, не в UTF-16 units.
  assertEquals(res.span.end - res.span.start, Array.from(needle).length);
});

Deno.test("двусмислена извадка се отхвърля, вместо да сочи първото място", () => {
  const res = resolveEvidence(NON_BMP_SOURCE, {
    excerpt: "на ден без ограничение.",
  });
  assertFalse(res.ok);
});

Deno.test("подадено място трябва да съвпада точно, дори при съчетаващ знак", () => {
  const combining = "комбиниран знак Пловди́в";
  const ok = resolveEvidence(NON_BMP_SOURCE, { excerpt: combining });
  assert(ok.ok);
  if (!ok.ok) return;
  assertEquals(sliceByCodePoints(NON_BMP_SOURCE, ok.span.start, ok.span.end), combining);
  assertFalse(
    resolveEvidence(NON_BMP_SOURCE, { excerpt: combining, start: 0, end: Array.from(combining).length })
      .ok,
  );
});

Deno.test("проверката за отсъствие намира израз след емоджи и с друг регистър", () => {
  const check = runAbsenceCheck(NON_BMP_SOURCE, {
    id: "a_cap",
    concept: "Таван на неустойката",
    terms: ["таван"],
  });
  assert(check.found);
  assertEquals(check.spans.length, 1);
  assertEquals(
    sliceByCodePoints(NON_BMP_SOURCE, check.spans[0].start, check.spans[0].end),
    "ТАВАН",
  );
});

Deno.test("празните знаци и новият ред не местят отместването", () => {
  const check = runAbsenceCheck(NON_BMP_SOURCE, {
    id: "a_multi",
    concept: "Неустойка",
    terms: ["неустойка"],
  });
  assertEquals(check.spans.length, 2);
  for (const span of check.spans) {
    assertEquals(
      sliceByCodePoints(NON_BMP_SOURCE, span.start, span.end).toLocaleLowerCase("bg-BG"),
      "неустойка",
    );
  }
});

Deno.test("невалидна карта на страниците не закача грешна страница", () => {
  const text = "Първа страница.\nВтора страница.";
  const count = Array.from(text).length;
  const bad = [
    [{ page: 0, start: 0, end: 5 }],
    [{ page: 1, start: 0, end: 10 }, { page: 1, start: 10, end: count }],
    [{ page: 1, start: 0, end: 12 }, { page: 2, start: 5, end: count }],
    [{ page: 1, start: 0, end: count + 5 }],
    [{ page: 2, start: 5, end: 3 }],
  ];
  for (const pages of bad) {
    assertEquals(validatePageBoundaries(pages, count), null);
    assertEquals(buildSourceMap(text, pages).pages, null);
  }
  const good = [{ page: 1, start: 0, end: 16 }, { page: 2, start: 16, end: count }];
  assertEquals(validatePageBoundaries(good, count)?.length, 2);
});
