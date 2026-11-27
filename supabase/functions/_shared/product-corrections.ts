/**
 * Чисти правила за поправките: стабилен идентификатор и еднозначно решаване на
 * застъпвания. Поправен документ може да се сглоби само от НЕзастъпващи се
 * места, затова застъпването е решение по изрично правило, не по случайност.
 */
import type { CorrectionMode } from "./product-result-contract.ts";

export interface CorrectionAnchor {
  readonly start: number;
  readonly end: number;
  readonly mode: CorrectionMode;
  readonly original_text: string;
}

/** FNV-1a — детерминистичен, чист и еднакъв в браузър, Edge и тест. */
function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (const ch of value) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Един и същ вход дава един и същ идентификатор — и след повторно генериране.
 * Влизат само неизменни факти: мястото, режимът и точният оригинален текст.
 */
export function correctionId(anchor: CorrectionAnchor): string {
  const key = `${anchor.start}:${anchor.end}:${anchor.mode}:${anchor.original_text}`;
  return `fix_${anchor.start}_${fnv1a32(key)}`;
}

export interface OverlapPair<T> {
  readonly kept: T;
  readonly dropped: T;
}

export interface OverlapResolution<T> {
  readonly kept: readonly T[];
  readonly dropped: readonly T[];
  readonly conflicts: readonly OverlapPair<T>[];
}

function overlaps(a: CorrectionAnchor, b: CorrectionAnchor): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Всички застъпващи се двойки — без решение, само констатация. */
export function detectAnchorOverlaps<T extends CorrectionAnchor>(
  items: readonly T[],
): readonly (readonly [T, T])[] {
  const pairs: Array<readonly [T, T]> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (overlaps(items[i], items[j])) pairs.push([items[i], items[j]] as const);
    }
  }
  return pairs;
}

/**
 * Изрично правило за приоритет при застъпване:
 *  1. по-конкретното място (по-къс интервал) печели;
 *  2. при равна дължина — по-ранното начало;
 *  3. при пълно равенство — по-малкият идентификатор (детерминизъм).
 */
export function resolveAnchorOverlaps<T extends CorrectionAnchor & { id: string }>(
  items: readonly T[],
): OverlapResolution<T> {
  const ordered = [...items].sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) return lenA - lenB;
    if (a.start !== b.start) return a.start - b.start;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const kept: T[] = [];
  const dropped: T[] = [];
  const conflicts: OverlapPair<T>[] = [];
  for (const item of ordered) {
    const clash = kept.find((k) => overlaps(k, item));
    if (clash) {
      dropped.push(item);
      conflicts.push({ kept: clash, dropped: item });
      continue;
    }
    kept.push(item);
  }
  kept.sort((a, b) => a.start - b.start);
  return { kept, dropped, conflicts };
}
