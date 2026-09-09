// Q4a — ЕДИНЕН договор за качеството на СОБСТВЕНО генерираните документи.
//
// Цел (бизнес): документ, създаден от Договори.нет, не трябва веднага да критикува
// СВОИТЕ СОБСТВЕНИ умишлени решения при съставянето (плейсхолдъри за лични данни,
// локално попълване, опционални приложения, избран набор клаузи според режима).
// В същото време реалните правни дефекти НИКОГА не се крият само защото
// документът е генериран от нас.
//
// Този модул е ЧИСТ: без мрежа, без база, без AI, без PII.
//   - манифест за качество (версиониран, БЕЗ суров текст и без идентификатори);
//   - детерминиран отпечатък на съдържанието (SHA-256);
//   - детерминирана „консистентна проверка" на risk анализа (gate).
//
// Отпечатъкът НЕ е доказателство за правна правилност. Той доказва единствено
// „това е точно този генериран документ" — нищо повече.

import { sha256Hex } from "./normalize.ts";

export const GENERATED_QUALITY_SCHEMA_VERSION = 1 as const;
export const GENERATED_QUALITY_POLICY_VERSION = "q4a-generated-quality-1" as const;

const HEX64 = /^[0-9a-f]{64}$/;

export type QualityOrigin =
  | "generate-contract"
  | "build-custom-contract"
  | "apply-corrections"
  | "refine-contract";

const ORIGINS: readonly QualityOrigin[] = [
  "generate-contract",
  "build-custom-contract",
  "apply-corrections",
  "refine-contract",
];

/**
 * ЗАТВОРЕН списък от умишлени решения при съставянето. Само идентификатори —
 * никакъв свободен текст от потребителя, за да не изтича PII в манифеста.
 */
export const INTENTIONAL_DECISION_IDS = [
  /** Личните данни са плейсхолдъри — попълват се локално след сваляне. */
  "placeholders_for_personal_data",
  /** Локално попълване на идентичност/контакт е част от дизайна. */
  "local_completion_of_personal_data",
  /** Приложенията/детайлите са опционални за този вид документ. */
  "optional_annex_details",
  /** Стандартен набор клаузи за вида документ. */
  "standard_clause_set",
  /** Съзнателно кратък набор клаузи (бърз режим). */
  "brief_clause_set",
  /** Съзнателно изчерпателен набор клаузи (стриктен режим). */
  "exhaustive_clause_set",
  /** Двуезичен паралелен текст. */
  "bilingual_parallel_text",
] as const;

export type IntentionalDecisionId = typeof INTENTIONAL_DECISION_IDS[number];

export interface QualityManifest {
  version: typeof GENERATED_QUALITY_SCHEMA_VERSION;
  policy_version: typeof GENERATED_QUALITY_POLICY_VERSION;
  origin: QualityOrigin;
  /** Вид документ (техническо име/slug), ако е известен. Никога име на страна. */
  document_type: string | null;
  /** Режим на съставяне ("fast"|"working"|"strict"), ако е приложим. */
  build_mode: string | null;
  /** Отпечатък на НЕ-PII контекста (само ключове/флагове, никакви отговори). */
  context_fingerprint: string | null;
  /** SHA-256 на нормализираното съдържание на документа. */
  content_fingerprint: string;
  /** Умишлени решения при съставянето — само от затворения списък. */
  decisions: IntentionalDecisionId[];
}

// ---------------------------------------------------------------------------
// Нормализация и отпечатък на съдържанието
// ---------------------------------------------------------------------------

interface ClauseLike {
  number?: unknown;
  title?: unknown;
  body?: unknown;
}

export interface GeneratedContractLike {
  title?: unknown;
  preamble?: unknown;
  clauses?: unknown;
  closing?: unknown;
}

const asText = (v: unknown): string => (typeof v === "string" ? v : "");

/** Детерминирано „изравняване" на генерирания договор до чист текст. */
export function flattenGeneratedContract(contract: unknown): string {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return "";
  const c = contract as GeneratedContractLike;
  const parts: string[] = [asText(c.title), asText(c.preamble)];
  if (Array.isArray(c.clauses)) {
    for (const raw of c.clauses) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const cl = raw as ClauseLike;
      parts.push(asText(cl.number), asText(cl.title), asText(cl.body));
    }
  }
  parts.push(asText(c.closing));
  return parts.filter((p) => p.trim().length > 0).join("\n");
}

/** Нормализация за отпечатък/сравнение: без разлики в празно място и регистър. */
export function normalizeForFingerprint(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .toLowerCase();
}

export async function computeContentFingerprint(contract: unknown): Promise<string> {
  const text = typeof contract === "string" ? contract : flattenGeneratedContract(contract);
  return await sha256Hex(
    [GENERATED_QUALITY_POLICY_VERSION, normalizeForFingerprint(text)].join("|"),
  );
}

/**
 * Отпечатък на контекста БЕЗ PII: приема САМО безопасни части (ключове на
 * отговори, флагове, вид/режим). Никакви стойности от потребителски отговори.
 */
export async function computeContextFingerprint(parts: readonly string[]): Promise<string> {
  const safe = parts.map((p) => (typeof p === "string" ? p.trim().toLowerCase() : "")).sort();
  return await sha256Hex([GENERATED_QUALITY_POLICY_VERSION, ...safe].join("|"));
}

// ---------------------------------------------------------------------------
// Манифест
// ---------------------------------------------------------------------------

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const dedupeDecisions = (v: unknown): IntentionalDecisionId[] => {
  if (!Array.isArray(v)) return [];
  const out: IntentionalDecisionId[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const id = raw as IntentionalDecisionId;
    if (!INTENTIONAL_DECISION_IDS.includes(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
};

export async function buildQualityManifest(input: {
  origin: QualityOrigin;
  contract: unknown;
  documentType?: unknown;
  buildMode?: unknown;
  contextFingerprint?: string | null;
  decisions?: readonly string[];
}): Promise<QualityManifest> {
  return {
    version: GENERATED_QUALITY_SCHEMA_VERSION,
    policy_version: GENERATED_QUALITY_POLICY_VERSION,
    origin: input.origin,
    document_type: clip(input.documentType, 200),
    build_mode: clip(input.buildMode, 40),
    context_fingerprint:
      typeof input.contextFingerprint === "string" && HEX64.test(input.contextFingerprint)
        ? input.contextFingerprint
        : null,
    content_fingerprint: await computeContentFingerprint(input.contract),
    decisions: dedupeDecisions(input.decisions ?? []),
  };
}

/** Строга валидация — при непознат/повреден манифест връща `null` (fail closed). */
export function validateQualityManifest(value: unknown): QualityManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== GENERATED_QUALITY_SCHEMA_VERSION) return null;
  if (v.policy_version !== GENERATED_QUALITY_POLICY_VERSION) return null;
  if (typeof v.origin !== "string" || !ORIGINS.includes(v.origin as QualityOrigin)) return null;
  if (typeof v.content_fingerprint !== "string" || !HEX64.test(v.content_fingerprint)) return null;
  const ctx = v.context_fingerprint;
  if (ctx !== null && (typeof ctx !== "string" || !HEX64.test(ctx))) return null;
  const dt = v.document_type;
  if (dt !== null && typeof dt !== "string") return null;
  const bm = v.build_mode;
  if (bm !== null && typeof bm !== "string") return null;
  if (!Array.isArray(v.decisions)) return null;
  if (v.decisions.some((d) => typeof d !== "string" || !INTENTIONAL_DECISION_IDS.includes(d as IntentionalDecisionId))) {
    return null;
  }
  return {
    version: GENERATED_QUALITY_SCHEMA_VERSION,
    policy_version: GENERATED_QUALITY_POLICY_VERSION,
    origin: v.origin as QualityOrigin,
    document_type: typeof dt === "string" ? dt : null,
    build_mode: typeof bm === "string" ? bm : null,
    context_fingerprint: typeof ctx === "string" ? ctx : null,
    content_fingerprint: v.content_fingerprint,
    decisions: dedupeDecisions(v.decisions),
  };
}

export type ManifestTrust =
  | { trusted: true; manifest: QualityManifest }
  | { trusted: false; manifest: null; reason: "absent" | "invalid" | "content_mismatch" };

/**
 * Доверие САМО при валиден манифест, чийто отпечатък на съдържанието СЪВПАДА с
 * реално анализираното съдържание. Иначе документът се третира като външен и
 * НИЩО не се потиска.
 */
export async function verifyQualityManifest(input: {
  manifest: unknown;
  content: unknown;
}): Promise<ManifestTrust> {
  if (input.manifest === undefined || input.manifest === null) {
    return { trusted: false, manifest: null, reason: "absent" };
  }
  const manifest = validateQualityManifest(input.manifest);
  if (!manifest) return { trusted: false, manifest: null, reason: "invalid" };
  const actual = await computeContentFingerprint(input.content);
  if (actual !== manifest.content_fingerprint) {
    return { trusted: false, manifest: null, reason: "content_mismatch" };
  }
  return { trusted: true, manifest };
}

// ---------------------------------------------------------------------------
// Детерминиран gate за консистентност на risk анализа
// ---------------------------------------------------------------------------

export interface RiskIssueLike {
  severity?: unknown;
  title?: unknown;
  detail?: unknown;
  clause?: unknown;
  quote?: unknown;
}

export interface GatedRiskIssue {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface GatedRisk {
  level: "low" | "medium" | "high";
  score: number;
  summary: string;
  issues: GatedRiskIssue[];
  recommendations: string[];
  strengths: string[];
}

export interface QualityGateReport {
  version: typeof GENERATED_QUALITY_SCHEMA_VERSION;
  policy_version: typeof GENERATED_QUALITY_POLICY_VERSION;
  origin: QualityOrigin;
  trusted_manifest: boolean;
  content_fingerprint: string | null;
  context_fingerprint: string | null;
  kept_issues: number;
  removed_issues: number;
  downgraded_issues: number;
  kept_strengths: number;
  removed_strengths: number;
  reason_codes: string[];
}

/** Реални правни дефекти — НИКОГА не се махат, независимо от произхода. */
const PROTECTED_PATTERNS: RegExp[] = [
  /противоречи|противоречие|разминаване между клауз/i,
  /нищожн|недействителн/i,
  /незаконн|противозаконн|заобикаля(не)? на закон|императивн/i,
  /прекомерн|непропорционалн|неограничен[аи]?\s+(неустойк|отговорност)/i,
  /задължителн[аи]?\s+(писмена\s+)?форма|нотариалн|вписване в\s+(търговск|имотн)/i,
  /отказ от\s+(законов|съдебн)/i,
  /липсва\s+(предмет|цена|страни|съществен)/i,
  /не съответства на\s+(избран|заявен|посочен)|противоречи на заявеното|различн[аи]\s+(срок|сум|валут)/i,
  /едностранн[оа]\s+(изменение|прекратяване)\s+без/i,
];

/** Умишлени решения при съставянето — НЕ са дефект. */
const NON_DEFECT_PATTERNS: RegExp[] = [
  /плейсхолдър|placeholder|квадратни скоби|\[\s*име\s*\]|попълн(ете|и|яне) (на )?(личн|данни|полет)/i,
  /липсват\s+(конкретни\s+)?(лични\s+)?данни (за|на) страните|имена?, ег[нч]|егн\/еик|iban|банкова сметка не е попълнен/i,
  /(опционалн|незадължителн)|(липсва|няма)\s+приложени[ея]|детайлизаци|може да бъде (разширен|допълнен)|препоръчително е да се добави приложение/i,
  /стил(ът|а)?\s+(на\s+)?(текста|документа)/i,
  /(езикът|формулировките)\s+(е|са)\s+(твърде\s+)?(официал|сух|тежк)/i,
  /(шрифт|форматиране|оформление|типограф)/i,
  /(твърде|прекалено)\s+(дълг|кратк)\s+(изречени|абзац)/i,
  /(липсват|няма)\s+дефиниции/i,
];

/** Решение → допълнителни модели, които при доверен манифест не са дефект. */
const DECISION_PATTERNS: Partial<Record<IntentionalDecisionId, RegExp[]>> = {
  placeholders_for_personal_data: [/непопълнен|незапълнен|празн[оои]\s+(полет|стойност)/i],
  local_completion_of_personal_data: [/непопълнен|незапълнен|празн[оои]\s+(полет|стойност)/i],
  optional_annex_details: [/приложение|анекс|спецификаци/i],
  brief_clause_set: [/кратък набор|малко клаузи|липсват (допълнителни|разширени) клаузи/i],
  bilingual_parallel_text: [/двуезич|английск(ия|и) текст/i],
};

const sevOf = (v: unknown): "low" | "medium" | "high" | null =>
  v === "low" || v === "medium" || v === "high" ? v : null;

const SIGNIFICANT_TOKEN = /[\p{L}]{6,}/gu;

function significantTokens(text: string): string[] {
  return (normalizeForFingerprint(text).match(SIGNIFICANT_TOKEN) ?? []).slice(0, 24);
}

/** Доказателственост: дословен цитат в текста или ≥2 значими думи от заглавието. */
function isEvidenceBacked(issue: RiskIssueLike, normalizedDoc: string): boolean {
  const quote = asText(issue.clause) || asText(issue.quote);
  const nq = normalizeForFingerprint(quote);
  if (nq.length >= 20 && normalizedDoc.includes(nq)) return true;
  const tokens = significantTokens(`${asText(issue.title)} ${asText(issue.detail)}`);
  let hits = 0;
  const seen = new Set<string>();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (normalizedDoc.includes(t)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

const matchesAny = (text: string, patterns: RegExp[]) => patterns.some((rx) => rx.test(text));

function decisionPatterns(manifest: QualityManifest | null): RegExp[] {
  if (!manifest) return [];
  const out: RegExp[] = [];
  for (const d of manifest.decisions) {
    for (const rx of DECISION_PATTERNS[d] ?? []) out.push(rx);
  }
  return out;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

/**
 * Детерминиран gate: маха само НЕДОКАЗАНИ или умишлени решения, ЗАПАЗВА реалните
 * дефекти и преизчислява консервативно ниво/оценка след филтрирането.
 */
export function applyRiskConsistencyGate(input: {
  risk: unknown;
  documentText: string;
  origin: QualityOrigin;
  manifest?: QualityManifest | null;
  trustedManifest?: boolean;
}): { risk: GatedRisk; quality: QualityGateReport } {
  const trusted = input.trustedManifest === true && !!input.manifest;
  const manifest = trusted ? input.manifest ?? null : null;
  const raw = (input.risk && typeof input.risk === "object" && !Array.isArray(input.risk)
    ? input.risk
    : {}) as Record<string, unknown>;

  const normalizedDoc = normalizeForFingerprint(input.documentText ?? "");
  const intentional = [...NON_DEFECT_PATTERNS, ...decisionPatterns(manifest)];

  const originalIssues: RiskIssueLike[] = Array.isArray(raw.issues)
    ? (raw.issues.filter((i) => !!i && typeof i === "object" && !Array.isArray(i)) as RiskIssueLike[])
    : [];

  const kept: GatedRiskIssue[] = [];
  const downgraded: string[] = [];
  const reasons = new Set<string>();
  let removed = 0;

  for (const issue of originalIssues) {
    const severity = sevOf(issue.severity);
    const title = asText(issue.title).trim();
    const detail = asText(issue.detail).trim();
    const text = `${title} ${detail}`.trim();
    if (!severity || !title || !text) {
      removed++;
      reasons.add("issue_incomplete");
      continue;
    }

    const protectedIssue = matchesAny(text, PROTECTED_PATTERNS);
    if (protectedIssue) {
      kept.push({ severity, title, detail });
      continue;
    }
    if (matchesAny(text, intentional)) {
      removed++;
      reasons.add("intentional_drafting_decision");
      continue;
    }
    if (!isEvidenceBacked(issue, normalizedDoc)) {
      // Полезните бележки стават ОПЦИОНАЛНИ препоръки, останалите се махат.
      if (detail.length >= 30) {
        downgraded.push(`Опционално: ${title} — ${detail}`);
        reasons.add("issue_downgraded_to_recommendation");
      } else {
        removed++;
        reasons.add("issue_unsupported_removed");
      }
      continue;
    }
    kept.push({ severity, title, detail });
  }

  // Силните страни също изискват доказателственост срещу реалния текст.
  const rawStrengths = asStringArray(raw.strengths);
  const keptStrengths: string[] = [];
  for (const s of rawStrengths) {
    const tokens = significantTokens(s);
    const hit = tokens.some((t) => normalizedDoc.includes(t));
    if (hit && !keptStrengths.some((k) => k.toLowerCase() === s.toLowerCase())) keptStrengths.push(s);
  }
  const removedStrengths = rawStrengths.length - keptStrengths.length;
  if (removedStrengths > 0) reasons.add("strength_unsupported_removed");

  const recommendations = [...asStringArray(raw.recommendations), ...downgraded];

  // Консервативно ниво/оценка от РЕАЛНО оставените бележки.
  const hasHigh = kept.some((i) => i.severity === "high");
  const hasMedium = kept.some((i) => i.severity === "medium");
  const level: GatedRisk["level"] = hasHigh ? "high" : hasMedium ? "medium" : "low";
  const weight = (s: string) => (s === "high" ? 30 : s === "medium" ? 15 : 5);
  const computed = kept.reduce((sum, i) => sum + weight(i.severity), 0);
  const given = typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : computed;
  const cap = hasHigh ? 100 : hasMedium ? 60 : kept.length > 0 ? 25 : 0;
  const score = Math.max(0, Math.min(cap, Math.round(Math.max(given, computed))));

  return {
    risk: {
      level,
      score,
      summary: asText(raw.summary),
      issues: kept,
      recommendations,
      strengths: keptStrengths,
    },
    quality: {
      version: GENERATED_QUALITY_SCHEMA_VERSION,
      policy_version: GENERATED_QUALITY_POLICY_VERSION,
      origin: input.origin,
      trusted_manifest: trusted,
      content_fingerprint: manifest?.content_fingerprint ?? null,
      context_fingerprint: manifest?.context_fingerprint ?? null,
      kept_issues: kept.length,
      removed_issues: removed,
      downgraded_issues: downgraded.length,
      kept_strengths: keptStrengths.length,
      removed_strengths: Math.max(0, removedStrengths),
      reason_codes: [...reasons].sort(),
    },
  };
}
