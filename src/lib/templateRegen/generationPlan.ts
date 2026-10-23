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
- decisiveFields съдържат точните имена на полета (без скобите), които присъстват в text.
- Отговор: само JSON по зададената схема (scenarios, unverifiedLegalBases, unresolvedFacts, changes).`;

const CONTENT_RULES = `Правила:
- Поясненията (intro, usageCases, requirements, mistakes, faq) трябва да съответстват на документа и на прочетените откъси.
- Не цитираш членове извън „Прочетени откъси“; иначе пишеш без номер или маркираш [НЕПРОВЕРЕНО ОСНОВАНИЕ: …] и го добавяш в unverifiedLegalBases. faq.law е null, ако няма прочетен член.
- Без абсолютни обещания за валидност, без измислени срокове/суми.
- Отговор: само JSON по зададената схема.`;

export interface PromptExtras {
  excerpts?: readonly { law: string; article: string; text: string }[];
  checklist?: { docType: string; checks: readonly string[] };
  evidenceReason?: string;
}

const EXCERPT_CHARS = 700;

/** Prompt без персона и без измислен „опит“ — доказателствата са входът. */
export function buildGenerationPrompt(p: EvidencePacket, extras: PromptExtras = {}): { system: string; user: string } {
  const checks = extras.checklist ? `\n\nЧеклист за тип „${extras.checklist.docType}“:\n${extras.checklist.checks.map((c) => `- ${c}`).join("\n")}` : "";
  const system = `Подготвяш кандидат-редакция на български правен ${p.kind === "draft" ? "образец" : "пояснителен текст"} за преглед от юрист. Резултатът не е одобрен и не се публикува автоматично.\n\n${p.kind === "draft" ? RULES : CONTENT_RULES}${checks}`;
  const excerpts = extras.excerpts?.length
    ? extras.excerpts.map((e) => `- ${e.law} чл. ${e.article}: ${e.text.slice(0, EXCERPT_CHARS)}`).join("\n")
    : `- няма (${extras.evidenceReason ?? "няма откъси"}) — всички позовавания остават непроверени`;
  const sources = p.sources.length ? p.sources.map((s) => `- ${s.title} (${s.url}), прочетен ${s.readOn}: ${s.articles.join(", ")}`).join("\n") : "- няма";
  const findings = p.findings.length ? p.findings.map((f) => `- [${f.ruleId}] ${f.message} | извадка: „${f.excerpt}“`).join("\n") : "- няма автоматични находки (това не означава липса на дефекти)";
  const user = `Документ: ${p.catalogName}\nSlug: ${p.slug}\nSHA-256 на оригинала: ${p.sourceSha256}\nКомплекти: ${p.kits.join(", ") || "няма"}\n\nПрочетени източници:\n${sources}\n\nПрочетени откъси (изтеглени, неофициален консолидиран текст):\n${excerpts}\n\nНаходки:\n${findings}\n\nОРИГИНАЛ:\n<<<\n${p.originalText}\n>>>`;
  return { system, user };
}
