/**
 * Чиста проверка за отсъствие върху ЦЕЛИЯ приет източник.
 *
 * Модулът записва само измеримото: какви изрази са търсени, че са търсени в
 * целия текст, и къде има съвпадения. Той НЕ твърди, че дадена защита е
 * задължителна или че липсата ѝ е риск — това е отделно, човешко твърдение
 * (`missing_protections` в договора за резултата).
 */
import { ABSENCE_COVERAGE, type AbsenceCheck, type SourceSpan } from "./product-result-contract.ts";
import { sliceByCodePoints } from "./product-source-map.ts";
import { findAllCodePoints, foldText } from "./product-text-fold.ts";

export interface ConceptQuery {
  readonly id: string;
  readonly concept: string;
  /** Изрази и синоними — точно те се записват като „търсено“. */
  readonly terms: readonly string[];
  readonly note?: string | null;
}

/** Максимум места, които записваме за едно понятие — резултатът е ограничен. */
export const ABSENCE_MAX_SPANS = 8;

/**
 * Търси всеки израз в целия източник и връща запис за покритието.
 * `found: false` НЕ значи „липсва защита“ — значи „изразите не се срещат“.
 *
 * Търсенето е без значение за регистъра, но извадката остава точна: всички
 * отмествания се пресмятат върху кодови точки (виж `product-text-fold.ts`).
 */
export function runAbsenceCheck(sourceText: string, query: ConceptQuery): AbsenceCheck {
  const cps = Array.from(sourceText);
  const index = foldText(cps, { lowercase: true });
  const spans: SourceSpan[] = [];

  for (const term of query.terms) {
    const wanted = foldText(Array.from(term), { lowercase: true }).folded;
    if (wanted.length === 0) continue;
    for (const at of findAllCodePoints(index.folded, wanted, ABSENCE_MAX_SPANS * 4)) {
      if (spans.length >= ABSENCE_MAX_SPANS) break;
      const start = index.toOriginal[at];
      const end = index.toOriginal[at + wanted.length - 1] + 1;
      if (!spans.some((s) => s.start === start && s.end === end)) {
        spans.push({ start, end, excerpt: sliceByCodePoints(sourceText, start, end) });
      }
    }
  }

  spans.sort((a, b) => a.start - b.start);
  return {
    id: query.id,
    concept: query.concept,
    searched_terms: [...query.terms],
    coverage: ABSENCE_COVERAGE,
    found: spans.length > 0,
    spans,
    note: query.note ?? null,
  };
}
