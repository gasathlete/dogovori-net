import {
  classifyDocumentBeforeAI,
  PERSON_NAME_RE,
  PERSON_NAME_STOPWORDS,
  type Classification,
} from "./classify.ts";

export interface ProductRedactionMap {
  readonly entries: Readonly<Record<string, string>>;
  readonly orderedTokens: readonly string[];
  /** Original-source code-point ranges; persisted artifacts never contain this map. */
  readonly spans: Readonly<Record<string, { readonly start: number; readonly end: number }>>;
}

export interface ProductRedactionResult {
  readonly text: string;
  readonly map: ProductRedactionMap;
  readonly classification: Classification;
}

export type PlaceholderProblem =
  | "unknown_placeholder"
  | "altered_placeholder"
  | "duplicated_placeholder"
  | "missing_placeholder"
  | "pii_remains"
  | "post_redaction_not_allowed";

export class ProductRedactionError extends Error {
  constructor(readonly reason: PlaceholderProblem) {
    super(reason);
    this.name = "ProductRedactionError";
  }
}

const TOKEN_RE = /⟦PD_([A-Z_]+)_([0-9]{4})⟧/gu;
const CANDIDATES: readonly { readonly kind: string; readonly pattern: RegExp }[] = [
  { kind: "EMAIL", pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/giu },
  { kind: "IBAN", pattern: /\bBG\d{2}[A-Z]{4}\d{14,20}\b/giu },
  { kind: "ID_CARD", pattern: /(?<![A-Za-zА-Яа-я])(?:лична\s*карта|л\.?к\.?|ид\.?\s*№)\s*[:№]?\s*\d{6,12}(?![A-Za-zА-Яа-я])/giu },
  { kind: "EGN", pattern: /\b\d{10}\b/gu },
  { kind: "PHONE", pattern: /(?:\+?359|0)\s*[\d\s\-()]{7,15}/gu },
  { kind: "ADDRESS", pattern: /(?<![A-Za-zА-Яа-я])(?:гр\.|град|с\.|село|ул\.|улица|бул\.|булевард|ж\.к\.|кв\.)\s+[А-ЯA-Z][^\n,.;]{2,80}/gu },
];

function token(kind: string, index: number): string {
  return `⟦PD_${kind}_${String(index).padStart(4, "0")}⟧`;
}

/** Deterministic and reversible. The returned map must remain inside the owner-bound job. */
export function redactProductSource(source: string): ProductRedactionResult {
  const sourcePoints = Array.from(source);
  const entries: Record<string, string> = {};
  const spans: Record<string, { start: number; end: number }> = {};
  const matches: Array<{ start: number; end: number; value: string; kind: string }> = [];
  const utf16ToCodePoint = (offset: number) => Array.from(source.slice(0, offset)).length;
  for (const candidate of CANDIDATES) {
    candidate.pattern.lastIndex = 0;
    for (const match of source.matchAll(candidate.pattern)) {
      if (match.index === undefined) continue;
      const start = utf16ToCodePoint(match.index);
      const end = start + Array.from(match[0]).length;
      matches.push({ start, end, value: match[0], kind: candidate.kind });
    }
  }
  // Имената на лица се откриват със същото определение, което ползва
  // класификацията, и със същите изключения — иначе след анонимизирането
  // остават лични данни и обработката спира.
  PERSON_NAME_RE.lastIndex = 0;
  for (const match of source.matchAll(PERSON_NAME_RE)) {
    if (match.index === undefined) continue;
    const parts = [match[1], match[2], match[3]].filter((part): part is string => typeof part === "string");
    if (parts.some((part) => PERSON_NAME_STOPWORDS.has(part))) continue;
    const start = utf16ToCodePoint(match.index);
    matches.push({
      start,
      end: start + Array.from(match[0]).length,
      value: match[0],
      kind: "NAME",
    });
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end || a.kind.localeCompare(b.kind));
  const accepted = matches.filter((match, index, all) =>
    !all.slice(0, index).some((prior) => prior.start < match.end && match.start < prior.end)
  );
  let text = "";
  let cursor = 0;
  let sequence = 0;
  for (const match of accepted) {
    text += sourcePoints.slice(cursor, match.start).join("");
    sequence += 1;
    const next = token(match.kind, sequence);
    entries[next] = match.value;
    spans[next] = { start: match.start, end: match.end };
    text += next;
    cursor = match.end;
  }
  text += sourcePoints.slice(cursor).join("");
  const classification = classifyDocumentBeforeAI(text);
  if (classification.contains_special_category_data || classification.risk_level === "blocked") {
    throw new ProductRedactionError("post_redaction_not_allowed");
  }
  if (classification.redaction_required) throw new ProductRedactionError("pii_remains");
  return {
    text,
    map: Object.freeze({
      entries: Object.freeze(entries),
      orderedTokens: Object.freeze(Object.keys(entries)),
      spans: Object.freeze(spans),
    }),
    classification,
  };
}

function tokensIn(value: string): string[] {
  TOKEN_RE.lastIndex = 0;
  return [...value.matchAll(TOKEN_RE)].map((match) => match[0]);
}

/** Rejects invented, malformed, repeated or unexpectedly omitted placeholders before rehydration. */
export function rehydrateProductOutput(
  value: string,
  map: ProductRedactionMap,
  expectedTokens: readonly string[],
): string {
  const observed = tokensIn(value);
  if (value.includes("⟦PD_") && observed.length === 0) {
    throw new ProductRedactionError("altered_placeholder");
  }
  const counts = new Map<string, number>();
  for (const item of observed) {
    if (!(item in map.entries)) throw new ProductRedactionError("unknown_placeholder");
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  // Един и същ маркер законно се среща и в данните, и в закотвящия цитат за
  // същото място. Повторението НЕ разкрива нищо ново — стойността вече е
  // видяна от модела — затова се допуска, но с таван, за да не се раздува
  // изходът с безкрайни повторения на един идентификатор.
  if ([...counts.values()].some((count) => count > MAX_PLACEHOLDER_OCCURRENCES)) {
    throw new ProductRedactionError("duplicated_placeholder");
  }
  for (const item of expectedTokens) {
    const count = counts.get(item) ?? 0;
    if (count === 0) throw new ProductRedactionError("missing_placeholder");
  }
  let hydrated = value;
  for (const item of [...map.orderedTokens].sort((a, b) => b.length - a.length)) {
    const original = map.entries[item];
    if (typeof original === "string") hydrated = hydrated.split(item).join(original);
  }
  return hydrated;
}

export function placeholdersIn(value: string, map: ProductRedactionMap): readonly string[] {
  return Object.freeze(tokensIn(value).filter((item) => item in map.entries));
}

/** Required placeholders for a declared original-source anchor. */
/**
 * Превръща отместване в ЗАЛИЧЕНИЯ текст в отместване в оригинала.
 *
 * Моделът вижда само заличения текст, затова неговите числа са в негови
 * координати. Доказателството обаче се проверява срещу оригинала, така че
 * координатите трябва да се преведат детерминирано по същата карта, с която е
 * извършено заличаването. Отместване вътре в маркер се приравнява на началото
 * (`edge: "start"`) или на края (`edge: "end"`) на заличената стойност — така
 * никога не се сочи към част от личен идентификатор.
 */
export function originalOffsetFromRedacted(
  map: ProductRedactionMap,
  index: number,
  edge: "start" | "end",
): number {
  if (!Number.isInteger(index) || index < 0) return -1;
  const ordered = map.orderedTokens
    .map((item) => ({ item, span: map.spans[item] }))
    .filter((entry): entry is { item: string; span: { start: number; end: number } } => Boolean(entry.span))
    .sort((a, b) => a.span.start - b.span.start);
  let original = 0;
  let redacted = 0;
  for (const entry of ordered) {
    const gap = entry.span.start - original;
    if (index < redacted + gap) return original + (index - redacted);
    const tokenLength = Array.from(entry.item).length;
    if (index < redacted + gap + tokenLength) return edge === "start" ? entry.span.start : entry.span.end;
    original = entry.span.end;
    redacted += gap + tokenLength;
  }
  return original + (index - redacted);
}

export function placeholdersForAnchor(
  map: ProductRedactionMap,
  start: number,
  end: number,
): readonly string[] {
  return Object.freeze(map.orderedTokens.filter((item) => {
    const span = map.spans[item];
    return Boolean(span && span.start < end && start < span.end);
  }));
}

/**
 * Returns a source interval without exposing partial identifiers at chunk
 * boundaries. Any redaction span touching the interval is represented by its
 * server-owned placeholder, even when the raw interval cuts through it.
 */
export function redactedSourceRange(
  source: string,
  map: ProductRedactionMap,
  start: number,
  end: number,
): string {
  const points = Array.from(source);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > points.length) {
    throw new ProductRedactionError("post_redaction_not_allowed");
  }
  const touching = map.orderedTokens
    .map((item) => ({ item, span: map.spans[item] }))
    .filter((entry): entry is { item: string; span: { start: number; end: number } } =>
      Boolean(entry.span && entry.span.start < end && start < entry.span.end)
    )
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end);
  let cursor = start;
  let safe = "";
  for (const entry of touching) {
    safe += points.slice(cursor, Math.max(cursor, Math.min(end, entry.span.start))).join("");
    safe += entry.item;
    cursor = Math.min(end, Math.max(cursor, entry.span.end));
  }
  safe += points.slice(cursor, end).join("");
  return safe;
}

/** Redacts source and immutable product context with one deterministic inventory. */
export function redactProductBundle(
  source: string,
  context: Readonly<Record<string, unknown>>,
): ProductRedactionResult & { readonly context: Readonly<Record<string, unknown>> } {
  const marker = "\n⟦PRODUCT_CONTEXT_BOUNDARY⟧\n";
  const serialized = JSON.stringify(context);
  const combined = redactProductSource(`${source}${marker}${serialized}`);
  const boundary = combined.text.indexOf(marker);
  if (boundary < 0) throw new ProductRedactionError("post_redaction_not_allowed");
  const contextText = combined.text.slice(boundary + marker.length);
  let redactedContext: unknown;
  try { redactedContext = JSON.parse(contextText); } catch { throw new ProductRedactionError("post_redaction_not_allowed"); }
  if (!redactedContext || typeof redactedContext !== "object" || Array.isArray(redactedContext)) {
    throw new ProductRedactionError("post_redaction_not_allowed");
  }
  return { ...combined, text: combined.text.slice(0, boundary), context: redactedContext as Readonly<Record<string, unknown>> };
}