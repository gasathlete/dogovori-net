/**
 * Подбор на правни доказателства за един документ.
 *
 * - Доказателство = точният текст на член от реално изтеглен консолидиран
 *   източник (legal-excerpts.json) + SHA-256 на откъса. URL/номер без текст
 *   не е доказателство.
 * - Документ е „supported“ само ако предметната му област е картографирана
 *   към закон с налични откъси. Иначе — evidence_required (backlog).
 * - Позовавания към закони без откъси НЕ се премахват; влизат като
 *   uncoveredCitations и остават непроменени за предметна проверка.
 */
import { createHash } from "node:crypto";

export interface ExcerptLaw { title: string; url: string; pageSha256: string; articles: Record<string, string>; caveats: string[] }
export interface ExcerptStore { fetchedOn: string; fetchedBy: "agent"; laws: Record<string, ExcerptLaw> }

export interface Citation { raw: string; law: string; article: string }
export interface EvidenceExcerpt { law: string; article: string; url: string; fetchedOn: string; fetchedBy: "agent"; text: string; sha256: string }

export interface DomainRule { id: string; label: string; match: RegExp; law: string; articles: readonly string[]; extraLaws?: readonly string[] }

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

/** Предметни области → закон и основни членове. Непокритите закони са в EVIDENCE_GAPS. */
export const DOMAIN_RULES: readonly DomainRule[] = [
  { id: "lease", label: "Наем", match: /(^|-)(naem|naemat|naemod|parkomyasto|garazh)/, law: "ЗЗД", articles: [...range(228, 239), "87", "20а"] },
  { id: "sale", label: "Покупко-продажба (движими)", match: /(^|-)(prodazhba|kupuvach|prodavach)/, law: "ЗЗД", articles: [...range(183, 205), "87", "20а"] },
  { id: "loan", label: "Заем", match: /(^|-)(zaem|razsrochvane)/, law: "ЗЗД", articles: [...range(240, 243), "86", "87", "20а"] },
  { id: "mandate", label: "Поръчка / пълномощно", match: /(^|-)(porachka|palnomoshtno|upalnomoshtav)/, law: "ЗЗД", articles: [...range(36, 43), ...range(280, 292)] },
  { id: "works", label: "Изработка / услуги", match: /(^|-)(izrabotka|uslugi|uslugа|razrabotka|konsultant|freelance|frilans|grazhdanski-dogovor)/, law: "ЗЗД", articles: [...range(258, 269), "87", "20а"] },
  { id: "debt", label: "Вземания / покани", match: /(^|-)(pokana|zadalzhenie|vzemane|tsesiya|prihvashtane|dalg)/, law: "ЗЗД", articles: [...range(63, 99), "110", "111", "114", "116"] },
  { id: "labor", label: "Трудови отношения", match: /(^|-)(trudov|sluzhitel|rabotnik|rabotodatel|otpusk|uvolnenie|kt-|chl-\d+-kt|naznachavane|dlazhnostna)/, law: "КТ", articles: [...range(61, 74), ...range(107, 122), ...range(155, 176), ...range(325, 331)] },
  { id: "company", label: "Търговски дружества", match: /(^|-)(eood|ood|ad-|druzhestvo|sadruzhnik|upravitel|uchreditel|tdd|targovsk|kapital)/, law: "ТЗ", articles: [...range(113, 158)] },
  { id: "consumer", label: "Защита на потребителите", match: /(^|-)(potrebitel|reklamats|garantsiya|vrashtane-na-stoka)/, law: "ЗЗП", articles: [...range(47, 57), ...range(105, 128)] },
  { id: "data", label: "Лични данни (национален закон)", match: /(^|-)(lichni-danni|gdpr|orzd|kzld|poveritelnost|cookie|biskvitki)/, law: "ЗЗЛД", articles: [...range(25, 25), "25а", "25б", "25в", "25ж", "25з", "25и", "25к", "25л", "25м", "25н"] },
  { id: "civil_procedure", label: "Гражданско производство", match: /(^|-)(iskova|molba-do-sad|zapoved|izpalnitelen|ispalnitel|gpk)/, law: "ГПК", articles: [...range(127, 131), ...range(410, 418)] },
];

/** Области без изтеглени откъси — винаги evidence_required. */
export const EVIDENCE_GAPS: readonly { id: string; label: string; match: RegExp; needs: string }[] = [
  { id: "property", label: "Вещни права / нотариални актове", match: /(^|-)(imot|notarial|sobstvenost|vazmezdno|darenie|zamyana|vladenie|ipoteka)/, needs: "Закон за собствеността, ГПК чл. 569–590, Закон за кадастъра и имотния регистър" },
  { id: "family", label: "Семейство / наследство", match: /(^|-)(razvod|brak|semeyn|nasledni|nasledstvo|zavesht|izdrazhka|dete|roditel)/, needs: "Семеен кодекс, Закон за наследството" },
  { id: "construction", label: "Строителство / официални образци", match: /(^|-)(akt-obrazets|stroitel|stroezh|zut|protokol-obrazets)/, needs: "ЗУТ и Наредба № 3/2003 (официални образци — не се генерират свободно)" },
  { id: "tax", label: "Данъци и осигуряване", match: /(^|-)(zddfl|dds|nap|osiguryav|deklaratsiya-po-chl|danach)/, needs: "ЗДДФЛ, ЗДДС, КСО, ДОПК" },
  { id: "ip_it", label: "Авторско право / софтуер", match: /(^|-)(avtorsk|litsenz|saas|softuer|software|marka|domeyn)/, needs: "ЗАПСП, ЗМГО" },
  { id: "esign", label: "Електронен подпис / документи", match: /(^|-)(e-podpis|kep|elektronen-podpis)/, needs: "ЗЕДЕУУ, Регламент (ЕС) № 910/2014" },
  { id: "eu_data", label: "ОРЗД (регламент)", match: /(^|-)(orzd|gdpr|dpa)/, needs: "Регламент (ЕС) 2016/679 — текст на регламента" },
];

const LAW_ABBR = "ЗЗД|ТЗ|КТ|ГПК|ЗЗЛД|ЗЗП|ЗС|СК|ЗН|ЗУТ|ЗДДФЛ|ЗДДС|КСО|ДОПК|ЗАПСП|ЗЕДЕУУ|ЗКИР|ЗТРРЮЛНЦ|ЗМВР|ЗЗБУТ|ОРЗД|НК|АПК|ЗКПО|ЗЕС|ЗМГО";

export function parseCitations(text: string): Citation[] {
  const out: Citation[] = [];
  const re = new RegExp(`чл\\.\\s*(\\d+[а-я]?)((?:\\s*,\\s*(?:ал|т|б)\\.\\s*\\d+[а-я]?)*)\\s*(?:от\\s+)?(${LAW_ABBR})(?![А-Яа-я])`, "giu");
  for (const m of text.matchAll(re)) out.push({ raw: m[0], article: m[1], law: m[3].toUpperCase() });
  const seen = new Set<string>();
  return out.filter((c) => { const k = `${c.law}:${c.article}:${c.raw}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

export interface EvidenceSelection {
  domains: string[];
  gapDomains: { id: string; label: string; needs: string }[];
  supported: boolean;
  reason: "supported" | "domain_unmapped" | "evidence_gap_domain" | "excerpts_missing";
  excerpts: EvidenceExcerpt[];
  coveredCitations: Citation[];
  uncoveredCitations: Citation[];
}

const MAX_EXCERPTS = 40;

export function selectEvidence(slug: string, text: string, store: ExcerptStore): EvidenceSelection {
  const domains = DOMAIN_RULES.filter((d) => d.match.test(slug));
  const gaps = EVIDENCE_GAPS.filter((g) => g.match.test(slug)).map(({ id, label, needs }) => ({ id, label, needs }));
  const cites = parseCitations(text);
  const covered = cites.filter((c) => store.laws[c.law]?.articles[c.article]);
  const uncovered = cites.filter((c) => !store.laws[c.law]?.articles[c.article]);
  const wanted: { law: string; article: string }[] = [];
  for (const c of covered) wanted.push({ law: c.law, article: c.article });
  for (const d of domains) for (const a of d.articles) wanted.push({ law: d.law, article: a });
  const seen = new Set<string>();
  const excerpts: EvidenceExcerpt[] = [];
  for (const w of wanted) {
    const k = `${w.law}:${w.article}`;
    const law = store.laws[w.law];
    const body = law?.articles[w.article];
    if (!body || seen.has(k) || excerpts.length >= MAX_EXCERPTS) continue;
    seen.add(k);
    excerpts.push({ law: w.law, article: w.article, url: law.url, fetchedOn: store.fetchedOn, fetchedBy: "agent", text: body, sha256: sha(body) });
  }
  let reason: EvidenceSelection["reason"] = "supported";
  if (gaps.length) reason = "evidence_gap_domain";
  else if (!domains.length) reason = "domain_unmapped";
  else if (!excerpts.length || domains.some((d) => !store.laws[d.law])) reason = "excerpts_missing";
  return { domains: domains.map((d) => d.id), gapDomains: gaps, supported: reason === "supported", reason, excerpts, coveredCitations: covered, uncoveredCitations: uncovered };
}
