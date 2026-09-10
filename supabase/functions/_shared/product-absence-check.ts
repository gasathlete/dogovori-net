/**
 * Чиста проверка за отсъствие върху ЦЕЛИЯ приет източник.
 *
 * Модулът записва само измеримото: какви изрази са търсени, че са търсени в
 * целия текст, и къде има съвпадения. Той НЕ твърди, че дадена защита е
 * задължителна или че липсата ѝ е риск — това е отделно, човешко твърдение.
 */
import { ABSENCE_COVERAGE, type AbsenceCheck, type SourceSpan } from "./product-result-contract.ts";
import { sliceByCodePoints } from "./product-source-map.ts";

export interface ConceptQuery {
  readonly id: string;
  readonly concept: string;
  /** Изрази и синоними — точно те се записват като „търсено“. */
  readonly terms: readonly string[];
  readonly note?: string | null;
}

const WS_RE = /\s/u;

function foldForSearch(cps: readonly string[]): { folded: string; toOriginal: number[] } {
  const out: string[] = [];
  const toOriginal: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < cps.length; i += 1) {
    const ch = cps[i];
    if (WS_RE.test(ch)) {
      if (out.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out.push(" ");
      toOriginal.push(i);
      pendingSpace = false;
    }
    // Търсенето на понятия е без значение за регистъра; извадката остава точна.
    out.push(ch.toLocaleLowerCase("bg-BG"));
    toOriginal.push(i);
  }
  return { folded: out.join(""), toOriginal };
}

/** Максимум места, които записваме за едно понятие — резултатът е ограничен. */
export const ABSENCE_MAX_SPANS = 8;

/**
 * Търси всеки израз в целия източник и връща запис за покритието.
 * `found: false` НЕ значи „липсва защита“ — значи „изразите не се срещат“.
 */
export function runAbsenceCheck(sourceText: string, query: ConceptQuery): AbsenceCheck {
  const cps = Array.from(sourceText);
  const { folded, toOriginal } = foldForSearch(cps);
  const spans: SourceSpan[] = [];

  for (const term of query.terms) {
    const wanted = foldForSearch(Array.from(term)).folded;
    if (!wanted) continue;
    let from = 0;
    while (spans.length < ABSENCE_MAX_SPANS) {
      const at = folded.indexOf(wanted, from);
      if (at === -1) break;
      const start = toOriginal[at];
      const end = toOriginal[at + wanted.length - 1] + 1;
      if (!spans.some((s) => s.start === start && s.end === end)) {
        spans.push({ start, end, excerpt: sliceByCodePoints(sourceText, start, end) });
      }
      from = at + wanted.length;
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
