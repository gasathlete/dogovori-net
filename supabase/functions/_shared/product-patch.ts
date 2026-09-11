/**
 * Детерминистична поправка на документа по приетите решения.
 *
 * Чист модул: една и съща входна двойка (източник + решения) дава един и същ
 * изход и един и същ хеш. Няма модел, няма мрежа, няма частично прилагане:
 * при най-малкото несъответствие цялата поправка се отказва.
 *
 * ВСИЧКИ отмествания са в Unicode кодови точки — точно както са изчислени при
 * генерацията. `String.slice`/`indexOf` НЕ се ползват за тези отмествания.
 */
import {
  countProductSourceChars,
  normalizeProductSourceText,
} from "./product-source.ts";
import type {
  Correction,
  CorrectionMode,
  CorrectionStrategy,
  ProductSourceBinding,
} from "./product-result-contract.ts";
import type { CorrectionDecision } from "./product-selections.ts";

export const PRODUCT_PATCH_SCHEMA_VERSION = 1 as const;

export type PatchProblem =
  | "source_binding_mismatch"
  | "source_length_mismatch"
  | "unknown_correction"
  | "duplicate_correction"
  | "duplicate_result_correction"
  | "missing_option"
  | "span_out_of_bounds"
  | "original_text_mismatch"
  | "overlapping_corrections"
  | "empty_replacement"
  | "replacement_not_normalized"
  | "output_not_normalized";

export class ProductPatchError extends Error {
  readonly reason: PatchProblem;
  constructor(reason: PatchProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductPatchError";
  }
}

const MESSAGES: Readonly<Record<PatchProblem, string>> = Object.freeze({
  source_binding_mismatch:
    "Документът е променен след плащането. Поправката работи само върху точния платен документ.",
  source_length_mismatch:
    "Документът е променен след плащането. Поправката работи само върху точния платен документ.",
  unknown_correction: "Една от поправките не е част от този резултат.",
  duplicate_correction: "Една поправка е избрана два пъти.",
  duplicate_result_correction:
    "Резултатът съдържа две поправки с един и същ номер. Поправката не може да се приложи.",
  missing_option: "Избраният вариант липсва в поправката.",
  span_out_of_bounds: "Поправката не съвпада с текста на документа.",
  original_text_mismatch: "Поправката не съвпада с текста на документа.",
  overlapping_corrections:
    "Две от избраните поправки засягат един и същ текст. Оставете само една от тях.",
  empty_replacement: "Избраният вариант е празен.",
  replacement_not_normalized: "Избраният вариант не може да се приложи в този документ.",
  output_not_normalized: "Поправката не може да се приложи в този документ.",
});

export function patchMessage(reason: PatchProblem): string {
  return MESSAGES[reason];
}

export interface AppliedCorrection {
  readonly correction_id: string;
  readonly mode: CorrectionMode;
  readonly strategy: CorrectionStrategy;
  readonly original_start: number;
  readonly original_end: number;
  readonly original_text: string;
  readonly replacement_text: string;
}

export interface ProductPatchManifest {
  readonly schema_version: typeof PRODUCT_PATCH_SCHEMA_VERSION;
  readonly source: ProductSourceBinding;
  readonly applied: readonly AppliedCorrection[];
  readonly rejected: readonly string[];
  readonly applied_count: number;
  readonly rejected_count: number;
  readonly corrected_text: string;
  readonly output_char_count: number;
  readonly output_hash: string;
}

export interface ProductPatchInput {
  /** Пълният нормализиран текст на точния платен документ. */
  readonly sourceText: string;
  /** Измереното обвързване на реда в базата. */
  readonly sourceBinding: ProductSourceBinding;
  /** Обвързването, записано в платения резултат. Двете трябва да са равни. */
  readonly resultBinding: ProductSourceBinding;
  readonly corrections: readonly Correction[];
  readonly decisions: readonly CorrectionDecision[];
}

function sameBinding(a: ProductSourceBinding, b: ProductSourceBinding): boolean {
  return (
    a.document_id === b.document_id &&
    a.source_hash.toLowerCase() === b.source_hash.toLowerCase() &&
    a.source_kind === b.source_kind &&
    a.char_count === b.char_count &&
    a.char_unit === b.char_unit &&
    String(a.source_updated_at) === String(b.source_updated_at) &&
    (a.page_count ?? null) === (b.page_count ?? null)
  );
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly insertAt: number;
  readonly text: string;
  readonly applied: AppliedCorrection;
}

/**
 * Прилага приетите поправки и връща манифест с точния изход и неговия хеш.
 * `digest` се подава отвън, за да остане модулът чист и тестируем.
 */
export async function buildProductPatch(
  input: ProductPatchInput,
  digest: (value: string) => Promise<string>,
): Promise<ProductPatchManifest> {
  if (!sameBinding(input.sourceBinding, input.resultBinding)) {
    throw new ProductPatchError("source_binding_mismatch");
  }
  const cps = Array.from(input.sourceText);
  if (cps.length !== input.sourceBinding.char_count) {
    throw new ProductPatchError("source_length_mismatch");
  }

  // Двусмислен набор поправки НЕ се пренаписва тихо: два еднакви номера са отказ.
  const byId = new Map<string, Correction>();
  for (const correction of input.corrections) {
    if (byId.has(correction.id)) throw new ProductPatchError("duplicate_result_correction");
    byId.set(correction.id, correction);
  }


  const seen = new Set<string>();
  const rejected: string[] = [];
  const edits: Edit[] = [];

  for (const decision of input.decisions) {
    const correction = byId.get(decision.correction_id);
    if (!correction) throw new ProductPatchError("unknown_correction");
    if (seen.has(decision.correction_id)) throw new ProductPatchError("duplicate_correction");
    seen.add(decision.correction_id);
    if (decision.decision === "reject") {
      rejected.push(decision.correction_id);
      continue;
    }
    const option = correction.options.find((o) => o.stance === decision.strategy);
    if (!option) throw new ProductPatchError("missing_option");

    const { start, end } = correction.span;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > cps.length
    ) {
      throw new ProductPatchError("span_out_of_bounds");
    }
    // Мястото трябва да съдържа ТОЧНО оригиналния текст на поправката.
    if (cps.slice(start, end).join("") !== correction.original_text) {
      throw new ProductPatchError("original_text_mismatch");
    }

    const replacement = option.replacement_text;
    if (replacement.length === 0) throw new ProductPatchError("empty_replacement");
    if (normalizeProductSourceText(replacement) !== replacement) {
      throw new ProductPatchError("replacement_not_normalized");
    }

    const applied: AppliedCorrection = Object.freeze({
      correction_id: correction.id,
      mode: correction.mode,
      strategy: decision.strategy as CorrectionStrategy,
      original_start: start,
      original_end: end,
      original_text: correction.original_text,
      replacement_text: replacement,
    });

    if (correction.mode === "replace") {
      edits.push({ start, end, insertAt: start, text: replacement, applied });
    } else if (correction.mode === "insert_before") {
      edits.push({ start, end: start, insertAt: start, text: replacement, applied });
    } else {
      edits.push({ start: end, end, insertAt: end, text: replacement, applied });
    }
  }

  // Каноничен ред: по място, после по идентификатор. Изходът не зависи от реда
  // на клиента.
  edits.sort((a, b) =>
    a.start !== b.start
      ? a.start - b.start
      : a.applied.correction_id < b.applied.correction_id
        ? -1
        : 1
  );
  // Всяко двусмислено споделено място е отказ на ЦЯЛАТА поправка: вмъкване в или
  // по границата на заменен обхват, две вмъквания на едно място и замени, които
  // делят текст. Съседни, незастъпващи се промени остават позволени.
  const replacements = edits.filter((edit) => edit.end > edit.start);
  const anchors = new Set<number>();
  for (const edit of edits) {
    if (edit.end > edit.start) continue;
    if (anchors.has(edit.insertAt)) throw new ProductPatchError("overlapping_corrections");
    anchors.add(edit.insertAt);
    for (const span of replacements) {
      if (edit.insertAt >= span.start && edit.insertAt <= span.end) {
        throw new ProductPatchError("overlapping_corrections");
      }
    }
  }
  for (let i = 1; i < replacements.length; i++) {
    const prev = replacements[i - 1];
    const current = replacements[i];
    if (prev.end > current.start || prev.start === current.start) {
      throw new ProductPatchError("overlapping_corrections");
    }
  }

  // Прилага се отзад напред, за да останат отместванията валидни.
  const out = cps.slice();
  for (let i = edits.length - 1; i >= 0; i--) {
    const edit = edits[i];
    out.splice(edit.start, edit.end - edit.start, ...Array.from(edit.text));
  }
  const correctedText = out.join("");
  if (normalizeProductSourceText(correctedText) !== correctedText) {
    throw new ProductPatchError("output_not_normalized");
  }

  const applied = edits.map((e) => e.applied);
  rejected.sort();
  return Object.freeze({
    schema_version: PRODUCT_PATCH_SCHEMA_VERSION,
    source: input.resultBinding,
    applied: Object.freeze(applied),
    rejected: Object.freeze(rejected),
    applied_count: applied.length,
    rejected_count: rejected.length,
    corrected_text: correctedText,
    output_char_count: countProductSourceChars(correctedText),
    output_hash: await digest(correctedText),
  });
}
