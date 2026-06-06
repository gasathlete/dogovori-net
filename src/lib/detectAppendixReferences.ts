/**
 * Detect references to appendices / annexes inside contract text so we can
 * suggest the user to create them as separate documents.
 *
 * Matches Bulgarian phrasing like:
 *   "Приложение №1"   "Приложение № 2"   "Приложение 3"
 *   "Приложения №1 и №2"  "Приложение към настоящия договор"
 *   "Анекс №1"        "Анекс №2 към..."
 *   "съгласно Приложение №1"  "в Приложение А"
 */

export type AppendixKind = "appendix" | "annex";

export interface AppendixReference {
  /** "appendix" → Приложение, "annex" → Анекс */
  kind: AppendixKind;
  /** Raw number / identifier as captured (e.g. "1", "2", "А", or "" when unnumbered) */
  number: string;
  /** Display label e.g. "Приложение №1" or "Приложение" */
  label: string;
  /** Optional short context snippet around the match (for UI hint). */
  context?: string;
}

// JS \b doesn't recognize Cyrillic letters as word characters, so we use
// explicit lookarounds covering the Cyrillic range.
const LB = "(?<![A-Za-zА-Яа-я])";
const LA = "(?![A-Za-zА-Яа-я])";

// Matches "Приложение", "Приложения" (plural), "Приложението" (definite),
// and "Анекс", "Анекса", "Анекси", optionally followed by a number or letter id.
const PATTERN = new RegExp(
  `${LB}(Приложени[ея]?т?[оаеи]?|Анекс[аоуи]?)` +
    `(?:\\s*(?:№|N|номер|No\\.?)?\\s*(\\d{1,3}|[A-ZА-Я])${LA})?`,
  "gu",
);

const NEGATIVE_CONTEXT = /приложим[аиое]?|приложение на|приложими/i;

export function detectAppendixReferences(
  text: string | null | undefined,
): AppendixReference[] {
  if (!text) return [];
  const seen = new Map<string, AppendixReference>();
  PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATTERN.exec(text)) !== null) {
    const word = m[1];
    const num = (m[2] ?? "").trim();
    const kind: AppendixKind = /^анекс/i.test(word) ? "annex" : "appendix";

    const start = Math.max(0, m.index - 60);
    const end = Math.min(text.length, m.index + m[0].length + 80);
    const context = text.slice(start, end).replace(/\s+/g, " ").trim();

    // Skip false positives like "приложимо законодателство".
    if (NEGATIVE_CONTEXT.test(word)) continue;

    const baseWord = kind === "annex" ? "Анекс" : "Приложение";
    const label = num ? `${baseWord} №${num}` : baseWord;
    const key = `${kind}:${num || "_"}`;
    if (seen.has(key)) continue;

    seen.set(key, { kind, number: num, label, context });
  }

  // Sort: numbered first (numeric ascending), then unnumbered.
  return Array.from(seen.values()).sort((a, b) => {
    const an = Number(a.number);
    const bn = Number(b.number);
    const aIsNum = Number.isFinite(an);
    const bIsNum = Number.isFinite(bn);
    if (aIsNum && bIsNum) return an - bn;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.number.localeCompare(b.number);
  });
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
