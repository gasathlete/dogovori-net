/**
 * Evidence-aware основа за пакетно регенериране на ВСИЧКИ каталожни документи.
 *
 * Заменя старите генератори „по заглавие“: всеки prompt се изгражда от точния
 * оригинален текст (+ SHA-256), откритите находки, комплектите и само реално
 * прочетените източници. Изходът винаги е кандидат за преглед — никога
 * презапис на src/data/templateDrafts или src/data/templateContent и никога
 * автоматично активиране в index.
 */
import { LEGAL_SOURCES, type LegalSource } from "./sources";
import type { Finding } from "./types";

export type GenerationKind = "draft" | "content";

export interface EvidencePacket {
  kind: GenerationKind;
  catalogName: string;
  slug: string;
  sourceSha256: string;
  originalText: string;
  findings: readonly Finding[];
  kits: readonly string[];
  sources: readonly LegalSource[];
}

export const CANDIDATE_OUTPUT_ROOT = "reports/template-regen/generated";
const FORBIDDEN_OUTPUT = [/(^|\/)src\/data\/templateDrafts(\/|$)/, /(^|\/)src\/data\/templateContent(\/|$)/, /(^|\/)src\/data\/templateDrafts\/index\.ts$/];

/** Хвърля, ако пътят сочи към производствен каталог или излиза от кандидатската папка. */
export function assertCandidateOutputPath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  if (FORBIDDEN_OUTPUT.some((re) => re.test(norm))) throw new Error(`refused_production_path: ${p}`);
  if (norm.includes("..") || !norm.includes(`${CANDIDATE_OUTPUT_ROOT}/`)) throw new Error(`refused_outside_candidates: ${p}`);
  return norm;
}

export function candidateOutputPath(kind: GenerationKind, slug: string, sourceSha256: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`invalid_slug: ${slug}`);
  return assertCandidateOutputPath(`${CANDIDATE_OUTPUT_ROOT}/${kind}/${slug}.${sourceSha256.slice(0, 12)}.json`);
}

export function buildEvidencePacket(args: Omit<EvidencePacket, "sources"> & { sources?: readonly LegalSource[] }): EvidencePacket {
  if (!args.originalText.trim()) throw new Error("missing_original_text");
  if (!/^[0-9a-f]{64}$/.test(args.sourceSha256)) throw new Error("missing_source_hash");
  return { ...args, sources: (args.sources ?? LEGAL_SOURCES).filter((s) => s.status === "user_reported_read") };
}

const RULES = `Правила:
- Работиш върху посочения ОРИГИНАЛЕН текст; запазваш правилните части и поправяш само обоснованото.
- Позоваваш се на член само ако е изброен в „Прочетени източници“. Всяко друго позоваване се маркира като [НЕПРОВЕРЕНО ОСНОВАНИЕ: …] или се премахва.
- Не измисляш дни, суми, проценти, права, съгласия или факти. Липсващото остава като поле в квадратни скоби.
- „Не знам“ не е „не“. Не пишеш автоматични признания за плащане или общи откази от претенции.
- Разделяш различните правни основания/сценарии вместо един универсален текст. Ролите на страните са последователни.
- Не твърдиш универсална валидност на форма или КЕП. Бъдещи редакции на закон не се третират като действащи.
- Дължината следва нуждата на документа — няма целева дължина.
- Отговор: JSON; полето "payload" съдържа JSON текст {"scenarios":[{"id","label","text","decisiveFields":[]}],"unverifiedLegalBases":[],"unresolvedFacts":[],"changes":[{"finding","change"}]}.`;

const CONTENT_RULES = `Правила:
- Поясненията (intro, usageCases, requirements, mistakes, faq) трябва да съответстват на кандидат-документа и на прочетените източници.
- Не цитираш членове извън „Прочетени източници“; иначе пишеш без номер или маркираш [НЕПРОВЕРЕНО].
- Без абсолютни обещания за валидност, без измислени срокове/суми.
- Отговор: JSON; полето "payload" съдържа JSON текст със същата структура като оригинала.`;

/** Prompt без персона и без измислен „опит“ — доказателствата са входът. */
export function buildGenerationPrompt(p: EvidencePacket): { system: string; user: string } {
  const system = `Подготвяш кандидат-редакция на български правен ${p.kind === "draft" ? "образец" : "пояснителен текст"} за преглед от юрист. Резултатът не е одобрен и не се публикува автоматично.\n\n${p.kind === "draft" ? RULES : CONTENT_RULES}`;
  const sources = p.sources.length
    ? p.sources.map((s) => `- ${s.title} (${s.url}), прочетен ${s.readOn}: ${s.articles.join(", ")}. Уговорки: ${s.caveats.join(" ")}`).join("\n")
    : "- няма";
  const findings = p.findings.length ? p.findings.map((f) => `- [${f.ruleId}] ${f.message} | извадка: „${f.excerpt}“`).join("\n") : "- няма автоматични находки (това не означава липса на дефекти)";
  const user = `Документ: ${p.catalogName}\nSlug: ${p.slug}\nSHA-256 на оригинала: ${p.sourceSha256}\nКомплекти: ${p.kits.join(", ") || "няма"}\n\nПрочетени източници:\n${sources}\n\nНаходки:\n${findings}\n\nОРИГИНАЛ:\n<<<\n${p.originalText}\n>>>`;
  return { system, user };
}
