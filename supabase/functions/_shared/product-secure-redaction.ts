import { classifyDocumentBeforeAI, type Classification } from "./classify.ts";

export interface ProductRedactionMap {
  readonly entries: Readonly<Record<string, string>>;
  readonly orderedTokens: readonly string[];
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
  let text = source;
  const entries: Record<string, string> = {};
  const byValue = new Map<string, string>();
  let sequence = 0;
  for (const candidate of CANDIDATES) {
    candidate.pattern.lastIndex = 0;
    text = text.replace(candidate.pattern, (value) => {
      const known = byValue.get(value);
      if (known) return known;
      sequence += 1;
      const next = token(candidate.kind, sequence);
      byValue.set(value, next);
      entries[next] = value;
      return next;
    });
  }
  const classification = classifyDocumentBeforeAI(text);
  if (classification.contains_special_category_data || classification.risk_level === "blocked") {
    throw new ProductRedactionError("post_redaction_not_allowed");
  }
  if (classification.redaction_required) throw new ProductRedactionError("pii_remains");
  return {
    text,
    map: Object.freeze({ entries: Object.freeze(entries), orderedTokens: Object.freeze(Object.keys(entries)) }),
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
  for (const item of expectedTokens) {
    const count = counts.get(item) ?? 0;
    if (count === 0) throw new ProductRedactionError("missing_placeholder");
    if (count > 1) throw new ProductRedactionError("duplicated_placeholder");
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