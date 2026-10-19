/**
 * Read-only съпоставка на каталожни записи без текст, недостижими файлове и
 * възможни дубликати. Само предлага; не променя mapping и не изтрива.
 *
 * - identical_hash: еднакъв SHA-256 → безопасен кандидат за alias/обединяване.
 * - safe_alias_proposal: еднозначно силно съвпадение по име към недостижим файл.
 * - official_form_no_ai: официален формуляр / строителен образец — не се
 *   обявява за готов от свободен текст; изисква официален източник.
 * - ambiguous_needs_subject_review / no_candidate: за предметна проверка.
 */
export type MappingClass =
  | "identical_hash"
  | "safe_alias_proposal"
  | "official_form_no_ai"
  | "ambiguous_needs_subject_review"
  | "no_candidate";

const OFFICIAL = /(обр\.|образец\s*№|\bА4\b|\bА5\b|формуляр|строител|акт\s+обр|заповедна\s+книга|протокол\s+обр|по\s+наредба)/i;
const STOP = new Set(["za", "na", "po", "ot", "pri", "kam", "ili", "dogovor", "i", "s", "v"]);

const tokens = (slug: string) => new Set(slug.split("-").filter((t) => t.length >= 3 && !STOP.has(t)));
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export function isOfficialForm(name: string): boolean { return OFFICIAL.test(name); }

export interface MissingAnalysis { catalogName: string; wantedSlug: string; class: MappingClass; candidates: { slug: string; score: number }[] }

export function classifyMissing(name: string, wantedSlug: string, orphanSlugs: readonly string[]): MissingAnalysis {
  const ranked = orphanSlugs.map((slug) => ({ slug, score: +similarity(wantedSlug, slug).toFixed(3) }))
    .filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  let cls: MappingClass;
  if (isOfficialForm(name)) cls = "official_form_no_ai";
  else if (!ranked.length || ranked[0].score < 0.34) cls = "no_candidate";
  else if (ranked[0].score >= 0.75 && (ranked[1]?.score ?? 0) <= ranked[0].score - 0.25) cls = "safe_alias_proposal";
  else cls = "ambiguous_needs_subject_review";
  return { catalogName: name, wantedSlug, class: cls, candidates: ranked };
}

export interface DuplicateAnalysis { slugs: string[]; class: "identical_hash" | "ambiguous_needs_subject_review"; hashes: Record<string, string> }

export function classifyDuplicateGroup(slugs: readonly string[], hashOf: (s: string) => string): DuplicateAnalysis {
  const hashes = Object.fromEntries(slugs.map((s) => [s, hashOf(s)]));
  const same = new Set(Object.values(hashes)).size === 1;
  return { slugs: [...slugs], class: same ? "identical_hash" : "ambiguous_needs_subject_review", hashes };
}
