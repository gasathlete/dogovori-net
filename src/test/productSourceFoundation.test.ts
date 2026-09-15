/**
 * Чистата основа за доказателства: карта на източника, разделяне без загуба,
 * съпоставяне на извадки, поправки без застъпване и проверка за отсъствие.
 *
 * Всички отмествания са в каноничната единица — Unicode кодови точки.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
  normalizeProductSourceText,
} from "@/lib/productSource";
import {
  PRODUCT_SOURCE_CHAR_UNIT as EDGE_CHAR_UNIT,
  countProductSourceChars as edgeCount,
  normalizeProductSourceText as edgeNormalize,
} from "../../supabase/functions/_shared/product-source";
import {
  buildSourceMap,
  locateOffset,
  sliceByCodePoints,
} from "../../supabase/functions/_shared/product-source-map";
import {
  chunkProductSource,
  verifyChunkCoverage,
} from "../../supabase/functions/_shared/product-source-chunks";
import { resolveEvidence } from "../../supabase/functions/_shared/product-evidence";
import {
  correctionId,
  detectAnchorOverlaps,
  resolveAnchorOverlaps,
} from "../../supabase/functions/_shared/product-corrections";
import { runAbsenceCheck } from "../../supabase/functions/_shared/product-absence-check";
import { FIXTURE_SOURCE_TEXT } from "@/lib/productResultFixtures";

/** Вектори за паритет между браузър, Edge и PostgreSQL `length()`. */
const LENGTH_VECTORS: ReadonlyArray<{ text: string; codePoints: number }> = [
  { text: "a", codePoints: 1 },
  { text: "Договор", codePoints: 7 },
  { text: "Пловди́в", codePoints: 8 }, // и + съчетаващ акцент = два знака
  { text: "✅", codePoints: 1 },
  { text: "👍🏽", codePoints: 2 }, // емоджи + модификатор
  { text: "𐍈", codePoints: 1 }, // извън BMP: UTF-16 би дало 2
  { text: "неустойка 0,5% 👍🏽", codePoints: 17 },
];

describe("Канонична единица за дължина", () => {
  it("е Unicode кодови точки и е една и съща в браузър и Edge", () => {
    expect(PRODUCT_SOURCE_CHAR_UNIT).toBe("unicode_code_points");
    expect(EDGE_CHAR_UNIT).toBe(PRODUCT_SOURCE_CHAR_UNIT);
  });

  it("брои еднакво емоджи, съчетаващи знаци и кирилица", () => {
    for (const v of LENGTH_VECTORS) {
      expect(countProductSourceChars(v.text), v.text).toBe(v.codePoints);
      expect(edgeCount(v.text), v.text).toBe(v.codePoints);
    }
  });

  it("не използва UTF-16 дължина за знаци извън BMP", () => {
    expect("𐍈".length).toBe(2);
    expect(countProductSourceChars("𐍈")).toBe(1);
  });

  it("нормализацията е една и съща в двете среди", () => {
    const raw = "  Ред 1 \r\n\r\n\r\n Ред 2\u00a0край  ";
    expect(normalizeProductSourceText(raw)).toBe(edgeNormalize(raw));
  });
});

describe("Карта на източника", () => {
  const map = buildSourceMap(FIXTURE_SOURCE_TEXT);

  it("брои знаците в кодови точки", () => {
    expect(map.charCount).toBe(countProductSourceChars(FIXTURE_SOURCE_TEXT));
  });

  it("разпознава абзаци и раздели без да измисля страници", () => {
    expect(map.paragraphs.length).toBeGreaterThan(5);
    expect(map.pages).toBeNull();
    for (const p of map.paragraphs) {
      expect(p.page).toBeNull();
      expect(sliceByCodePoints(FIXTURE_SOURCE_TEXT, p.start, p.end)).toBe(p.text);
    }
    const sections = map.paragraphs.map((p) => p.section).filter(Boolean);
    expect(sections.some((s) => s?.startsWith("3."))).toBe(true);
  });

  it("ползва страници само когато са измерени", () => {
    const withPages = buildSourceMap(FIXTURE_SOURCE_TEXT, [
      { page: 1, start: 0, end: 200 },
      { page: 2, start: 200, end: map.charCount },
    ]);
    expect(locateOffset(withPages, 10).page).toBe(1);
    expect(locateOffset(withPages, 250).page).toBe(2);
    expect(locateOffset(map, 250).page).toBeNull();
    expect(locateOffset(map, map.charCount + 5).paragraph).toBeNull();
  });

  it("дава раздел и абзац за отместване вътре в текста", () => {
    const at = FIXTURE_SOURCE_TEXT.indexOf("неустойка");
    const offset = countProductSourceChars(FIXTURE_SOURCE_TEXT.slice(0, at));
    const where = locateOffset(map, offset);
    expect(where.paragraph).not.toBeNull();
    expect(where.section).toContain("3.");
  });
});

describe("Разделяне без загуба", () => {
  const cases: Array<{ label: string; text: string }> = [
    { label: "един знак", text: "x" },
    { label: "точно на границата", text: "абв ".repeat(250).trim() },
    { label: "синтетичен договор", text: FIXTURE_SOURCE_TEXT },
    { label: "максимална дължина", text: "клауза за неустойка. ".repeat(3000) },
    { label: "емоджи и съчетаващи знаци", text: `Пловди́в 👍🏽 ${"текст ".repeat(500)}` },
  ];

  for (const c of cases) {
    it(`покрива всеки знак: ${c.label}`, () => {
      const text = c.text.slice(0, PRODUCT_MAX_SOURCE_CHARS);
      const chunks = chunkProductSource(text, { maxChars: 500, overlapChars: 50 });
      const coverage = verifyChunkCoverage(chunks, countProductSourceChars(text));
      expect(coverage.gaps).toEqual([]);
      expect(coverage.complete).toBe(true);
      // Сглобяването на ядрата дава ТОЧНО източника — нищо не е отрязано.
      const rebuilt = chunks
        .map((ch) => sliceByCodePoints(text, ch.start, ch.end))
        .join("");
      expect(rebuilt).toBe(text);
    });
  }

  it("дава детерминистични идентификатори и отмествания", () => {
    const a = chunkProductSource(FIXTURE_SOURCE_TEXT, { maxChars: 400 });
    const b = chunkProductSource(FIXTURE_SOURCE_TEXT, { maxChars: 400 });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
  });

  it("добавя застъпване само като контекст, не като покритие", () => {
    const chunks = chunkProductSource(FIXTURE_SOURCE_TEXT, { maxChars: 300, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].context_start).toBe(0);
    expect(chunks[1].context_start).toBeLessThan(chunks[1].start);
    const coverage = verifyChunkCoverage(chunks, countProductSourceChars(FIXTURE_SOURCE_TEXT));
    expect(coverage.covered).toBe(coverage.expected);
  });

  it("празен източник няма части", () => {
    expect(chunkProductSource("")).toEqual([]);
  });
});

describe("Съпоставяне на доказателство", () => {
  const source = FIXTURE_SOURCE_TEXT;

  it("намира точното място на буквална извадка", () => {
    const res = resolveEvidence(source, {
      excerpt: "неустойка 0,5% на ден без ограничение",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(sliceByCodePoints(source, res.span.start, res.span.end)).toBe(res.span.excerpt);
      expect(res.span.excerpt).toContain("неустойка");
    }
  });

  it("приема само документираните безопасни разлики в празните знаци", () => {
    const res = resolveEvidence(source, {
      excerpt: "  неустойка   0,5%\n на ден без ограничение  ",
    });
    expect(res.ok).toBe(true);
  });

  it("отхвърля измислена извадка", () => {
    const res = resolveEvidence(source, {
      excerpt: "Изпълнителят се отказва от всякакви претенции завинаги",
    });
    expect(res).toEqual({ ok: false, reason: "excerpt_not_found" });
  });

  it("отхвърля двусмислена извадка без подадено място", () => {
    const repeated = "Клаузата е нищожна. Друг текст. Клаузата е нищожна.";
    expect(resolveEvidence(repeated, { excerpt: "Клаузата е нищожна." })).toEqual({
      ok: false,
      reason: "excerpt_ambiguous",
    });
  });

  it("двусмислена извадка с вярно място е приемлива", () => {
    const repeated = "Клаузата е нищожна. Друг текст. Клаузата е нищожна.";
    const start = countProductSourceChars(repeated.slice(0, repeated.lastIndexOf("Клаузата")));
    const res = resolveEvidence(repeated, {
      excerpt: "Клаузата е нищожна.",
      start,
      end: start + countProductSourceChars("Клаузата е нищожна."),
    });
    expect(res.ok).toBe(true);
  });

  it("отхвърля място, което не съвпада с извадката", () => {
    expect(
      resolveEvidence(source, { excerpt: "неустойка 0,5% на ден", start: 0, end: 21 }),
    ).toEqual({ ok: false, reason: "anchor_mismatch" });
  });

  it("отхвърля място извън източника и празна извадка", () => {
    expect(
      resolveEvidence(source, { excerpt: "неустойка 0,5% на ден", start: 5, end: 999999 }),
    ).toEqual({ ok: false, reason: "anchor_out_of_range" });
    expect(resolveEvidence(source, { excerpt: "   " })).toEqual({
      ok: false,
      reason: "excerpt_missing",
    });
    // Без подадено място къса дума не е доказателство…
    expect(resolveEvidence(source, { excerpt: "цена" })).toEqual({
      ok: false,
      reason: "excerpt_too_short",
    });
    // …а със точно място 4 знака се приемат.
    const at = source.indexOf("цена");
    if (at >= 0) {
      const anchored = resolveEvidence(source, { excerpt: "цена", start: at, end: at + 4 });
      expect(anchored.ok).toBe(true);
    }
  });

  it("работи вярно с кирилица, съчетаващи знаци и емоджи", () => {
    const res = resolveEvidence(source, { excerpt: "Приемането е с протокол ✅." });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.span.end - res.span.start).toBe(
        countProductSourceChars("Приемането е с протокол ✅."),
      );
    }
    const city = resolveEvidence(source, { excerpt: "седалището на Възложителя в град Пловди́в" });
    expect(city.ok).toBe(true);
  });
});

describe("Поправки: идентификатори и застъпване", () => {
  const anchor = { start: 100, end: 140, mode: "replace" as const, original_text: "текст" };

  it("идентификаторът е детерминистичен и зависи от неизменните факти", () => {
    expect(correctionId(anchor)).toBe(correctionId({ ...anchor }));
    expect(correctionId(anchor)).not.toBe(correctionId({ ...anchor, end: 141 }));
    expect(correctionId(anchor)).not.toBe(correctionId({ ...anchor, original_text: "друг" }));
    expect(correctionId(anchor)).toMatch(/^fix_100_[0-9a-f]{8}$/);
  });

  it("открива всички застъпвания", () => {
    const items = [
      { id: "a", start: 0, end: 50, mode: "replace" as const, original_text: "1" },
      { id: "b", start: 40, end: 90, mode: "replace" as const, original_text: "2" },
      { id: "c", start: 90, end: 120, mode: "replace" as const, original_text: "3" },
    ];
    expect(detectAnchorOverlaps(items)).toHaveLength(1);
  });

  it("решава застъпването по изрично правило: по-конкретното място печели", () => {
    const items = [
      { id: "wide", start: 0, end: 100, mode: "replace" as const, original_text: "широко" },
      { id: "narrow", start: 10, end: 30, mode: "replace" as const, original_text: "тясно" },
      { id: "far", start: 200, end: 240, mode: "replace" as const, original_text: "далеч" },
    ];
    const res = resolveAnchorOverlaps(items);
    expect(res.kept.map((k) => k.id)).toEqual(["narrow", "far"]);
    expect(res.dropped.map((d) => d.id)).toEqual(["wide"]);
    expect(res.conflicts).toHaveLength(1);
    expect(detectAnchorOverlaps(res.kept)).toHaveLength(0);
  });

  it("резултатът е един и същ независимо от реда на входа", () => {
    const items = [
      { id: "a", start: 10, end: 40, mode: "replace" as const, original_text: "1" },
      { id: "b", start: 20, end: 50, mode: "replace" as const, original_text: "2" },
    ];
    const forward = resolveAnchorOverlaps(items).kept.map((k) => k.id);
    const backward = resolveAnchorOverlaps([...items].reverse()).kept.map((k) => k.id);
    expect(forward).toEqual(backward);
  });
});

describe("Проверка за отсъствие върху целия източник", () => {
  it("намира израз и връща точното място", () => {
    const check = runAbsenceCheck(FIXTURE_SOURCE_TEXT, {
      id: "a_notice",
      concept: "Предизвестие",
      terms: ["предизвестие"],
    });
    expect(check.found).toBe(true);
    expect(check.coverage).toBe("whole_document");
    expect(check.spans.length).toBeGreaterThan(0);
    for (const span of check.spans) {
      expect(sliceByCodePoints(FIXTURE_SOURCE_TEXT, span.start, span.end)).toBe(span.excerpt);
    }
  });

  it("записва какво е търсено и не твърди правен извод", () => {
    const check = runAbsenceCheck(FIXTURE_SOURCE_TEXT, {
      id: "a_cap",
      concept: "Таван на неустойката",
      terms: ["таван", "не повече от", "общ размер"],
    });
    expect(check.found).toBe(false);
    expect(check.spans).toEqual([]);
    expect(check.searched_terms).toEqual(["таван", "не повече от", "общ размер"]);
    expect(check.note).toBeNull();
  });

  it("търсенето е без значение за регистъра, но извадката е точна", () => {
    const check = runAbsenceCheck(FIXTURE_SOURCE_TEXT, {
      id: "a_contractor",
      concept: "Изпълнител",
      terms: ["ИЗПЪЛНИТЕЛЯТ"],
    });
    expect(check.found).toBe(true);
    expect(check.spans[0].excerpt).toBe("Изпълнителят");
  });
});
