// Fuzzy match a free-text document title against catalog template names.
// Uses Dice coefficient over character bigrams of normalized strings —
// language-agnostic, forgiving of word-order changes and minor variations.

import { allTemplates, type TemplateEntry } from "@/lib/templateIndex";

const STOPWORDS = new Set([
  "за", "на", "и", "към", "от", "по", "с", "при", "до", "или",
  "образец", "шаблон", "договор", "документ", "проект",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}

function bigrams(s: string): Set<string> {
  const n = normalize(s).replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
}

function dice(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function jaccardTokens(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface SimilarTemplate {
  entry: TemplateEntry;
  score: number;
}

/**
 * Returns catalog templates whose name resembles `title` with a combined
 * similarity score >= `threshold` (0..1). Ordered by score desc.
 */
export function findSimilarTemplates(title: string, threshold = 0.8, max = 3): SimilarTemplate[] {
  const q = title.trim();
  if (q.length < 4) return [];
  const matches: SimilarTemplate[] = [];
  for (const entry of allTemplates()) {
    const name = entry.doc.name;
    const d = dice(q, name);
    const j = jaccardTokens(q, name);
    // Weighted blend — favors character similarity but rewards token overlap.
    const score = d * 0.65 + j * 0.35;
    if (score >= threshold) matches.push({ entry, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, max);
}
