/**
 * Чиста проверка на „доказателството“ срещу ТОЧНИЯ източник.
 *
 * Всичко, което идва от модел (извадка, място), е НЕДОВЕРЕНО. Тук се проверява
 * дали извадката наистина съществува в приетия текст и къде точно. Ако не
 * съществува или е двусмислена, доказателството се отхвърля — не се поправя.
 *
 * Разрешените безопасни разлики при съпоставянето са описани в
 * `product-text-fold.ts`. Всички отмествания са в Unicode кодови точки.
 */
import { sliceByCodePoints } from "./product-source-map.ts";
import { findAllCodePoints, foldText } from "./product-text-fold.ts";
import type { SourceSpan } from "./product-result-contract.ts";

/**
 * Долна граница за дължина на извадка. Кратки стойности като „900 евро“ са
 * напълно проверими: приемат се само когато обявеното място съвпада дословно
 * или когато извадката се среща точно един път в документа. Двусмислените
 * къси извадки продължават да падат по-долу като `excerpt_ambiguous`.
 */
export const EVIDENCE_MIN_EXCERPT_CHARS = 4;
/**
 * Без подадено място минимумът е по-висок: къса дума без anchor не е
 * доказателство, дори когато се среща само веднъж.
 */
export const EVIDENCE_MIN_UNANCHORED_EXCERPT_CHARS = 5;
export const EVIDENCE_MAX_EXCERPT_CHARS = 1200;



export type EvidenceRejection =
  | "excerpt_missing"
  | "excerpt_too_short"
  | "excerpt_too_long"
  | "excerpt_not_found"
  | "excerpt_ambiguous"
  | "anchor_out_of_range"
  | "anchor_mismatch";

export type EvidenceResolution =
  | { readonly ok: true; readonly span: SourceSpan; readonly occurrences: number }
  | { readonly ok: false; readonly reason: EvidenceRejection };

export interface EvidenceInput {
  readonly excerpt: unknown;
  /** Твърдение на модела за мястото — проверява се, не се приема. */
  readonly start?: unknown;
  readonly end?: unknown;
}

/** Свита извадка като масив от кодови точки. */
function foldExcerpt(value: string): readonly string[] {
  return foldText(Array.from(value)).folded;
}

function sameFold(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Съпоставя недоверена извадка с източника и връща точно място или отказ.
 * Когато е подадено място (anchor), то е задължително да съвпада.
 */
export function resolveEvidence(sourceText: string, input: EvidenceInput): EvidenceResolution {
  if (typeof input.excerpt !== "string" || !input.excerpt.trim()) {
    return { ok: false, reason: "excerpt_missing" };
  }
  const cps = Array.from(sourceText);
  const wanted = foldExcerpt(input.excerpt);
  const hasAnchor = typeof input.start === "number" && typeof input.end === "number";
  if (wanted.length < EVIDENCE_MIN_EXCERPT_CHARS) {
    return { ok: false, reason: "excerpt_too_short" };
  }

  if (wanted.length > EVIDENCE_MAX_EXCERPT_CHARS) {
    return { ok: false, reason: "excerpt_too_long" };
  }

  const index = foldText(cps);
  const positions = findAllCodePoints(index.folded, wanted);
  if (positions.length === 0) return { ok: false, reason: "excerpt_not_found" };


  if (hasAnchor) {
    const start = input.start as number;
    const end = input.end as number;
    if (
      !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start ||
      end > cps.length
    ) {
      return { ok: false, reason: "anchor_out_of_range" };
    }
    const anchored = sliceByCodePoints(sourceText, start, end);
    if (!sameFold(foldExcerpt(anchored), wanted)) {
      return { ok: false, reason: "anchor_mismatch" };
    }
    return {
      ok: true,
      span: { start, end, excerpt: anchored },
      occurrences: positions.length,
    };
  }

  // Без подадено място едно единствено съвпадение е достатъчно доказателство.
  if (positions.length !== 1) return { ok: false, reason: "excerpt_ambiguous" };
  const foldStart = positions[0];
  const foldEnd = foldStart + wanted.length - 1;
  const start = index.toOriginal[foldStart];
  const end = index.toOriginal[foldEnd] + 1;
  return {
    ok: true,
    span: { start, end, excerpt: sliceByCodePoints(sourceText, start, end) },
    occurrences: 1,
  };
}
