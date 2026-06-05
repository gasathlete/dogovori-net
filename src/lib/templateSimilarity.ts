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

export interface SimilarOptions {
  /** When provided, restricts matches to templates of the same document type. */
  documentType?: string;
  /** When provided, gives a small score boost to templates in the same category. */
  categorySectorId?: string;
}

/**
 * Returns catalog templates whose name resembles `title` with a combined
 * similarity score >= `threshold` (0..1). Ordered by score desc.
 *
 * Document type is the strongest signal for the title — when supplied it acts
 * as a hard filter (a "Декларация" should never suggest a "Пълномощно").
 * Category is complementary — it only nudges the score upward.
 */
export function findSimilarTemplates(
  title: string,
  threshold = 0.6,
  max = 5,
  options: SimilarOptions = {},
): SimilarTemplate[] {
  const q = title.trim();
  if (q.length < 4) return [];
  const { documentType, categorySectorId } = options;
  const matches: SimilarTemplate[] = [];
  for (const entry of allTemplates()) {
    if (documentType && entry.doc.documentType && entry.doc.documentType !== documentType) continue;
    const name = entry.doc.name;
    const d = dice(q, name);
    const j = jaccardTokens(q, name);
    let score = d * 0.65 + j * 0.35;
    if (categorySectorId && entry.category.id === categorySectorId) {
      score = Math.min(1, score + 0.08);
    }
    if (score >= threshold) matches.push({ entry, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, max);
}
