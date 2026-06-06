/**
 * Detect references to appendices / annexes inside contract text so we can
 * suggest the user to create them as separate documents.
 *
 * Matches Bulgarian phrasing like:
 *   "Приложение №1"   "Приложение № 2"   "Приложение 3"
 *   "Анекс №1"        "Анекс №2 към..."
 *   "съгласно Приложение №1"
 */

export type AppendixKind = "appendix" | "annex";

export interface AppendixReference {
  /** "appendix" → Приложение, "annex" → Анекс */
  kind: AppendixKind;
  /** Raw number as captured (e.g. "1", "2") */
  number: string;
  /** Display label e.g. "Приложение №1" */
  label: string;
  /** Optional short context snippet around the match (for UI hint). */
  context?: string;
}

const PATTERN =
  /(Приложение|Анекс)\s*№?\s*(\d{1,3})/gi;

export function detectAppendixReferences(
  text: string | null | undefined,
): AppendixReference[] {
  if (!text) return [];
  const seen = new Map<string, AppendixReference>();
  PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(text)) !== null) {
    const word = m[1];
    const num = m[2];
    const kind: AppendixKind = /анекс/i.test(word) ? "annex" : "appendix";
    const baseWord = kind === "annex" ? "Анекс" : "Приложение";
    const label = `${baseWord} №${num}`;
    const key = `${kind}:${num}`;
    if (seen.has(key)) continue;

    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 80);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();

    seen.set(key, { kind, number: num, label, context });
  }
  // Sort by numeric number for predictable UI ordering.
  return Array.from(seen.values()).sort(
    (a, b) => Number(a.number) - Number(b.number),
  );
}

/** Stringify the full contract body so the detector can scan all sections. */
export function contractToPlainText(contract: {
  title?: string;
  preamble?: string;
  clauses?: Array<{ number?: string; title?: string; body?: string }>;
  closing?: string;
}): string {
  const parts: string[] = [];
  if (contract.title) parts.push(contract.title);
  if (contract.preamble) parts.push(contract.preamble);
  for (const c of contract.clauses ?? []) {
    if (c.title) parts.push(c.title);
    if (c.body) parts.push(c.body);
  }
  if (contract.closing) parts.push(contract.closing);
  return parts.join("\n\n");
}
