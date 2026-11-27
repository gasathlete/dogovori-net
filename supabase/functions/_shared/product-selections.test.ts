import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  acceptedDecisions,
  ProductSelectionError,
  validateExpectedVersion,
  validateIdempotencyKey,
  validateSelectionDecisions,
} from "./product-selections.ts";
import { buildProductPatch, ProductPatchError } from "./product-patch.ts";
import type { Correction } from "./product-result-contract.ts";
import {
  ProductRefinementError,
  refinementRemaining,
  validateRefinementIdempotencyKey,
  validateRefinementInstruction,
} from "./product-refinement.ts";

const SOURCE = "Цената е 100 лева. Срокът е 5 дни. Неустойката е 0,5% на ден.";

function correction(
  id: string,
  start: number,
  end: number,
  mode: Correction["mode"],
  replacement: string,
): Correction {
  const original = Array.from(SOURCE).slice(start, end).join("");
  const option = (stance: "conservative" | "balanced" | "assertive") => ({
    stance,
    replacement_text: replacement,
    trade_off: "Компромис.",
  });
  return {
    id,
    title: "Клауза",
    mode,
    span: { start, end, excerpt: original },
    original_text: original,
    rationale: "Причина.",
    options: [option("conservative"), option("balanced"), option("assertive")],
  } as Correction;
}

const corrections = [
  correction("c1", 0, 17, "replace", "Цената е 120 лева"),
  correction("c2", 19, 33, "replace", "Срокът е 10 дни"),
];

const binding = Object.freeze({
  document_id: "11111111-1111-4111-8111-111111111111",
  source_hash: "a".repeat(64),
  source_kind: "docx" as const,
  char_count: Array.from(SOURCE).length,
  char_unit: "unicode_code_points" as const,
  source_updated_at: "2026-01-01T00:00:00.000Z",
  page_count: null,
});

Deno.test("всяка поправка иска изрично решение — без подразбиране", () => {
  assertThrows(
    () => validateSelectionDecisions(corrections, [{ correction_id: "c1", decision: "accept", strategy: "balanced" }]),
    ProductSelectionError,
  );
  assertThrows(
    () =>
      validateSelectionDecisions(
        corrections,
        [
          { correction_id: "c1", decision: "accept", strategy: "balanced" },
          { correction_id: "c1", decision: "reject", strategy: null },
          { correction_id: "c2", decision: "reject", strategy: null },
        ],      ),
    ProductSelectionError,
  );
  assertThrows(
    () =>
      validateSelectionDecisions(
        corrections,
        [
          { correction_id: "c1", decision: "accept", strategy: null },
          { correction_id: "c2", decision: "reject", strategy: null },
        ],      ),
    ProductSelectionError,
  );
  assertThrows(
    () =>
      validateSelectionDecisions(
        corrections,
        [
          { correction_id: "c1", decision: "reject", strategy: "balanced" },
          { correction_id: "c2", decision: "reject", strategy: null },
        ],      ),
    ProductSelectionError,
  );
  const ok = validateSelectionDecisions(
    corrections,
    [
      { correction_id: "c2", decision: "reject", strategy: null },
      { correction_id: "c1", decision: "accept", strategy: "conservative" },
    ],  );
  assertEquals(ok.map((d) => d.correction_id), ["c1", "c2"]);
  assertEquals(acceptedDecisions(ok).length, 1);
});

Deno.test("версия и ключ за повторение се проверяват строго", () => {
  assertEquals(validateExpectedVersion(0), 0);
  assertThrows(() => validateExpectedVersion(-1), ProductSelectionError);
  assertThrows(() => validateExpectedVersion(1.5), ProductSelectionError);
  assertThrows(() => validateExpectedVersion("1"), ProductSelectionError);
  assertEquals(validateIdempotencyKey(" k1 "), "k1");
  assertThrows(() => validateIdempotencyKey(""), ProductSelectionError);
});

Deno.test("поправеният текст се получава детерминистично по кодови точки", async () => {
  const decisions = validateSelectionDecisions(
    corrections,
    [
      { correction_id: "c1", decision: "accept", strategy: "balanced" },
      { correction_id: "c2", decision: "reject", strategy: null },
    ],  );
  const digest = async (value: string) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  const first = await buildProductPatch(
    { sourceText: SOURCE, sourceBinding: binding, resultBinding: binding, corrections, decisions },
    digest,
  );
  const second = await buildProductPatch(
    { sourceText: SOURCE, sourceBinding: binding, resultBinding: binding, corrections, decisions },
    digest,
  );
  assertEquals(first.output_hash, second.output_hash);
  assertEquals(first.applied.length, 1);
  assertEquals(first.rejected.length, 1);
  assertEquals(first.corrected_text.startsWith("Цената е 120 лева"), true);
  assertEquals(first.corrected_text.includes("Срокът е 5 дни"), true);
});

Deno.test("несъответстващ източник или застъпване спира поправката", async () => {
  const digest = async () => "0".repeat(64);
  const decisions = validateSelectionDecisions(
    corrections,
    [
      { correction_id: "c1", decision: "accept", strategy: "balanced" },
      { correction_id: "c2", decision: "accept", strategy: "balanced" },
    ],  );
  await assertRejectsPatch(() =>
    buildProductPatch(
      { sourceText: "Друг текст.", sourceBinding: binding, resultBinding: binding, corrections, decisions },
      digest,
    )
  );
  const overlapping = [corrections[0], correction("c3", 5, 25, "replace", "нещо друго")];
  const overlapDecisions = validateSelectionDecisions(
    overlapping,
    [
      { correction_id: "c1", decision: "accept", strategy: "balanced" },
      { correction_id: "c3", decision: "accept", strategy: "balanced" },
    ],  );
  await assertRejectsPatch(() =>
    buildProductPatch(
      {
        sourceText: SOURCE,
        sourceBinding: binding,
        resultBinding: binding,
        corrections: overlapping,
        decisions: overlapDecisions,
      },
      digest,
    )
  );
});

async function assertRejectsPatch(fn: () => Promise<unknown>) {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  assertEquals(thrown instanceof ProductPatchError, true);
}

Deno.test("указанието за уточнение е ограничено и точно едно уточнение е включено", () => {
  assertThrows(() => validateRefinementInstruction("кратко"), ProductRefinementError);
  assertThrows(() => validateRefinementInstruction("а".repeat(1201)), ProductRefinementError);
  assertEquals(
    validateRefinementInstruction("  Моля, засилете клаузата за неустойка.  "),
    "Моля, засилете клаузата за неустойка.",
  );
  assertEquals(validateRefinementIdempotencyKey("k"), "k");
  assertThrows(() => validateRefinementIdempotencyKey(5), ProductRefinementError);
  assertEquals(refinementRemaining(0), 1);
  assertEquals(refinementRemaining(1), 0);
});

const sha256 = async (value: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.test("две поправки с един номер спират поправката", async () => {
  const duplicated = [corrections[0], correction("c1", 19, 33, "replace", "Срокът е 10 дни")];
  const decisions = [
    { correction_id: "c1", decision: "accept" as const, strategy: "balanced" as const },
  ];
  await assertRejectsPatch(() =>
    buildProductPatch(
      {
        sourceText: SOURCE,
        sourceBinding: binding,
        resultBinding: binding,
        corrections: duplicated,
        decisions,
      },
      sha256,
    )
  );
});

Deno.test("вмъкване в заменен обхват и две вмъквания на едно място са застъпване", async () => {
  const inside = [corrections[0], correction("c9", 5, 5, "insert_before", "(нова клауза) ")];
  const insideDecisions = [
    { correction_id: "c1", decision: "accept" as const, strategy: "balanced" as const },
    { correction_id: "c9", decision: "accept" as const, strategy: "balanced" as const },
  ];
  await assertRejectsPatch(() =>
    buildProductPatch(
      {
        sourceText: SOURCE,
        sourceBinding: binding,
        resultBinding: binding,
        corrections: inside,
        decisions: insideDecisions,
      },
      sha256,
    )
  );

  const sameAnchor = [
    correction("a1", 19, 19, "insert_before", "Първо. "),
    correction("a2", 19, 19, "insert_before", "Второ. "),
  ];
  const anchorDecisions = [
    { correction_id: "a1", decision: "accept" as const, strategy: "balanced" as const },
    { correction_id: "a2", decision: "accept" as const, strategy: "balanced" as const },
  ];
  await assertRejectsPatch(() =>
    buildProductPatch(
      {
        sourceText: SOURCE,
        sourceBinding: binding,
        resultBinding: binding,
        corrections: sameAnchor,
        decisions: anchorDecisions,
      },
      sha256,
    )
  );
});

Deno.test("съседни, незастъпващи се поправки остават позволени", async () => {
  const decisions = validateSelectionDecisions(corrections, [
    { correction_id: "c1", decision: "accept", strategy: "balanced" },
    { correction_id: "c2", decision: "accept", strategy: "balanced" },
  ]);
  const manifest = await buildProductPatch(
    { sourceText: SOURCE, sourceBinding: binding, resultBinding: binding, corrections, decisions },
    sha256,
  );
  assertEquals(manifest.applied_count, 2);
  assertEquals(manifest.corrected_text.includes("Срокът е 10 дни"), true);
});

Deno.test("кирилица и знаци извън BMP се местят по кодови точки", async () => {
  const source = "Договорът 🧾 е валиден. Неустойката е 0,5% на ден 🔒.";
  const cps = Array.from(source);
  const start = cps.indexOf("Н");
  const end = start + Array.from("Неустойката е 0,5% на ден").length;
  const target: Correction = {
    id: "u1",
    title: "Неустойка",
    mode: "replace",
    span: { start, end, excerpt: cps.slice(start, end).join("") },
    original_text: cps.slice(start, end).join(""),
    rationale: "Причина.",
    options: [
      { stance: "conservative", replacement_text: "Неустойката е 0,3% на ден", trade_off: "Компромис." },
      { stance: "balanced", replacement_text: "Неустойката е 0,5% на ден, но не повече от 10%", trade_off: "Компромис." },
      { stance: "assertive", replacement_text: "Неустойката е 1% на ден", trade_off: "Компромис." },
    ],
  } as Correction;
  const unicodeBinding = { ...binding, char_count: cps.length };
  const decisions = validateSelectionDecisions([target], [
    { correction_id: "u1", decision: "accept", strategy: "balanced" },
  ]);
  const first = await buildProductPatch(
    {
      sourceText: source,
      sourceBinding: unicodeBinding,
      resultBinding: unicodeBinding,
      corrections: [target],
      decisions,
    },
    sha256,
  );
  const second = await buildProductPatch(
    {
      sourceText: source,
      sourceBinding: unicodeBinding,
      resultBinding: unicodeBinding,
      corrections: [target],
      decisions,
    },
    sha256,
  );
  assertEquals(first.output_hash, second.output_hash);
  assertEquals(first.corrected_text.startsWith("Договорът 🧾 е валиден."), true);
  assertEquals(first.corrected_text.includes("но не повече от 10%"), true);
  assertEquals(first.corrected_text.endsWith(" 🔒."), true);
});
