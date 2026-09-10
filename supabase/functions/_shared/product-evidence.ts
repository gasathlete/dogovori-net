/**
 * Чиста проверка на „доказателството“ срещу ТОЧНИЯ източник.
 *
 * Всичко, което идва от модел (извадка, място), е НЕДОВЕРЕНО. Тук се проверява
 * дали извадката наистина съществува в приетия текст и къде точно. Ако не
 * съществува или е двусмислена, доказателството се отхвърля — не се поправя.
 *
 * Единствените разрешени безопасни разлики при съпоставянето:
 *  1. водещи и завършващи празни знаци;
 *  2. поредица от празни знаци (включително нов ред) се смята за един интервал.
 * Нищо друго: без промяна на регистър, без изтриване на пунктуация, без
 * „приблизително“ съвпадение.
 */
import { sliceByCodePoints } from "./product-source-map.ts";
import type { SourceSpan } from "./product-result-contract.ts";

export const EVIDENCE_MIN_EXCERPT_CHARS = 12;
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

interface NormalizedIndex {
  readonly normalized: string;
  /** За всяка позиция в `normalized` — позицията в кодовите точки на източника. */
  readonly toOriginal: readonly number[];
}

const WS_RE = /\s/u;

function normalizeForMatch(cps: readonly string[]): NormalizedIndex {
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
    out.push(ch);
    toOriginal.push(i);
  }
  return { normalized: out.join(""), toOriginal };
}

function normalizeExcerpt(value: string): string {
  return normalizeForMatch(Array.from(value)).normalized;
}

export interface EvidenceInput {
  readonly excerpt: unknown;
  /** Твърдение на модела за мястото — проверява се, не се приема. */
  readonly start?: unknown;
  readonly end?: unknown;
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
  const wanted = normalizeExcerpt(input.excerpt);
  if (wanted.length < EVIDENCE_MIN_EXCERPT_CHARS) {
    return { ok: false, reason: "excerpt_too_short" };
  }
  if (wanted.length > EVIDENCE_MAX_EXCERPT_CHARS) {
    return { ok: false, reason: "excerpt_too_long" };
  }

  const index = normalizeForMatch(cps);
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const at = index.normalized.indexOf(wanted, from);
    if (at === -1) break;
    positions.push(at);
    from = at + 1;
    if (positions.length > 64) break;
  }
  if (positions.length === 0) return { ok: false, reason: "excerpt_not_found" };

  const hasAnchor = typeof input.start === "number" && typeof input.end === "number";
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
    if (normalizeExcerpt(anchored) !== wanted) {
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
  const normStart = positions[0];
  const normEnd = normStart + wanted.length - 1;
  const start = index.toOriginal[normStart];
  const end = index.toOriginal[normEnd] + 1;
  return {
    ok: true,
    span: { start, end, excerpt: sliceByCodePoints(sourceText, start, end) },
    occurrences: 1,
  };
}
