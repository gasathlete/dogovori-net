// Q2a — доказателствена цялост на риск-анализа (чиста логика, без мрежа и без база).
//
// Принцип: една констатация е „обоснована с текст" САМО ако цитатът съвпада с
// ЕДИН НЕПРЕКЪСНАТ пасаж от точно онзи ОРИГИНАЛЕН текст, който наистина е бил
// изпратен на модела (без добавения маркер за съкращаване).
// Липсата на доказателство НЕ е доказателство за безопасност — тя прави анализа
// НЕПЪЛЕН (`incomplete`), а не „чист".
//
// Нормализацията е умишлено тясна и документирана:
//   - Unicode NFC (канонична композиция). НЕ се използва NFKC, защото той е
//     СЪВМЕСТИМОСТНО преобразуване и променя числа и символи (напр. „1²" → „12",
//     „½" → „1⁄2", „№" → „No"), което би позволило фалшиво съвпадение на суми.
//   - премахване на нулевоширинни знаци (U+200B..U+200D, U+FEFF);
//   - обединяване на ФОРМИ на кавички („ " " « » ‚ ' ' ` ´ ' → ");
//   - обединяване на всякакво празно място (вкл. NBSP, таб, нов ред) в един интервал;
//   - привеждане към малки букви.
// НЕ се прави: премахване на пунктуация, стеминг, размяна на думи, приблизително
// сходство, нормализация на числа, десетични разделители, валути или отрицания.
// Затова „не дължи 1 000 лв." и „дължи 1000 EUR" НЕ съвпадат.

export const ANALYSIS_VERIFICATION_VERSION = 1 as const;

/** Границите за цитат идват от промпта на analyze-contract (20–280 знака). */
export const QUOTE_MIN_CHARS = 20;
export const QUOTE_MAX_CHARS = 280;

/** Граници за останалите текстови полета — защита срещу празни и абсурдни стойности. */
export const TITLE_MAX_CHARS = 300;
export const EXPLANATION_MAX_CHARS = 4000;
export const NAME_MAX_CHARS = 200;
export const WHY_MAX_CHARS = 2000;

export const KNOWN_SEVERITIES = ["low", "medium", "high"] as const;

export type AnalysisVerificationStatus = "evidence_checked" | "incomplete";

export const ANALYSIS_REASON_CODES = [
  "root_shape_invalid",
  "issues_not_array",
  "missing_not_array",
  "issue_malformed",
  "quote_unverified",
  "missing_clause_malformed",
  "missing_clause_filtered",
  "input_truncated",
  "score_invalid",
] as const;

export type AnalysisReasonCode = typeof ANALYSIS_REASON_CODES[number];

export interface AnalysisVerificationCounts {
  issues_raw: number;
  issues_kept: number;
  issues_rejected: number;
  missing_raw: number;
  missing_kept: number;
  missing_rejected: number;
}

export interface AnalysisVerificationMetadata {
  version: typeof ANALYSIS_VERIFICATION_VERSION;
  status: AnalysisVerificationStatus;
  /** Само кодове — никога заглавия, цитати, идентификатори или суров текст. */
  reason_codes: AnalysisReasonCode[];
  counts: AnalysisVerificationCounts;
  score_trusted: boolean;
}

/**
 * Неутрално резюме, притежавано от системата. Използва се ВМЕСТО резюмето на
 * модела, когато проверката не е пълна — за да няма самоуверен текст,
 * последван от предупреждение, което му противоречи.
 */
export const NEUTRAL_INCOMPLETE_SUMMARY =
  "Проверката на този анализ не е пълна: част от върнатите данни не бяха потвърдени срещу текста на договора, затова обобщението на модела не се показва. По-долу са само находките с дословно текстово покритие. Това не е оценка за безопасност и не е правна гаранция.";

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;
const QUOTE_SHAPES = /[\u201E\u201C\u201D\u00AB\u00BB\u201A\u2018\u2019\u0060\u00B4']/g;

/** Тясна нормализация: само канонична Unicode-форма, празно място, кавички и регистър. */
export function normalizeEvidenceText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFC")
    .replace(ZERO_WIDTH, "")
    .replace(QUOTE_SHAPES, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export interface QuoteVerdict {
  verified: boolean;
  reason?: "not_a_string" | "too_short" | "too_long" | "not_found";
}

/**
 * Проверява дали цитатът е НЕПРЕКЪСНАТ пасаж от `normalizedSentText` — точно
 * оригиналният текст, подаден на модела (без непратения остатък от дълъг
 * документ и без служебния маркер за съкращаване).
 */
export function verifyQuoteAgainstSource(
  quote: unknown,
  normalizedSentText: string,
): QuoteVerdict {
  if (typeof quote !== "string") return { verified: false, reason: "not_a_string" };
  const raw = quote.trim();
  if (raw.length < QUOTE_MIN_CHARS) return { verified: false, reason: "too_short" };
  if (raw.length > QUOTE_MAX_CHARS) return { verified: false, reason: "too_long" };
  const norm = normalizeEvidenceText(raw);
  if (norm.length < QUOTE_MIN_CHARS) return { verified: false, reason: "too_short" };
  if (!normalizedSentText) return { verified: false, reason: "not_found" };
  return normalizedSentText.includes(norm)
    ? { verified: true }
    : { verified: false, reason: "not_found" };
}

/** Модел-оценката се приема само като ЦЯЛО число 1..10 (без закръгляне). */
export function isValidModelScore(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

/**
 * Неутрална стойност за записа, когато колоната е NOT NULL, но валидна оценка няма.
 * Тя НЕ е рейтинг — метаданните я маркират като недоверена и UI не я показва.
 */
export const NEUTRAL_STORED_SCORE = 5;

// ---------------------------------------------------------------------------
// Схемна валидация на елементите (не се чете нищо от елемент, преди да е обект)
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function boundedNonEmptyString(v: unknown, max: number): boolean {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}

function optionalBoundedString(v: unknown, max: number): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.length <= max);
}

/** Валидна находка (без цитатната проверка — тя е отделна стъпка). */
export function isIssueSchemaValid(item: unknown): boolean {
  if (!isPlainObject(item)) return false;
  if (!KNOWN_SEVERITIES.includes(item.severity as typeof KNOWN_SEVERITIES[number])) return false;
  if (!boundedNonEmptyString(item.title, TITLE_MAX_CHARS)) return false;
  if (!boundedNonEmptyString(item.explanation, EXPLANATION_MAX_CHARS)) return false;
  if (!optionalBoundedString(item.suggestion, EXPLANATION_MAX_CHARS)) return false;
  return typeof item.clause === "string";
}

/**
 * Валидна липсваща клауза: смислено име И непразно обяснение защо липсата има
 * значение. Предложение без „защо" не е препоръка, която ползвателят може да
 * прецени, затова се отчита като `missing_clause_malformed`.
 */
export function isMissingClauseSchemaValid(item: unknown): boolean {
  if (!isPlainObject(item)) return false;
  if (!boundedNonEmptyString(item.name, NAME_MAX_CHARS)) return false;
  return boundedNonEmptyString(item.why, WHY_MAX_CHARS);
}

// ---------------------------------------------------------------------------
// Строга схемна валидация на самите метаданни (една обща истина за двете страни)
// ---------------------------------------------------------------------------

function safeCount(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v) && v >= 0 &&
    v <= Number.MAX_SAFE_INTEGER;
}

/**
 * Приема САМО напълно консистентни метаданни. Всичко останало (липсващи полета,
 * непознати кодове, дробни/NaN/Infinity стойности, невъзможни сборове,
 * противоречие между статус и кодове) се отхвърля — валидаторът НЕ „пада отворен".
 */
export function validateAnalysisVerification(value: unknown): AnalysisVerificationMetadata | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== ANALYSIS_VERIFICATION_VERSION) return null;
  const status = value.status;
  if (status !== "evidence_checked" && status !== "incomplete") return null;

  if (!Array.isArray(value.reason_codes)) return null;
  const codes: AnalysisReasonCode[] = [];
  for (const c of value.reason_codes) {
    if (typeof c !== "string") return null;
    if (!(ANALYSIS_REASON_CODES as readonly string[]).includes(c)) return null;
    if (codes.includes(c as AnalysisReasonCode)) return null; // без дублирани кодове
    codes.push(c as AnalysisReasonCode);
  }

  const c = value.counts;
  if (!isPlainObject(c)) return null;
  const keys = [
    "issues_raw",
    "issues_kept",
    "issues_rejected",
    "missing_raw",
    "missing_kept",
    "missing_rejected",
  ] as const;
  for (const k of keys) {
    if (!safeCount(c[k])) return null;
  }
  const counts: AnalysisVerificationCounts = {
    issues_raw: c.issues_raw as number,
    issues_kept: c.issues_kept as number,
    issues_rejected: c.issues_rejected as number,
    missing_raw: c.missing_raw as number,
    missing_kept: c.missing_kept as number,
    missing_rejected: c.missing_rejected as number,
  };
  if (counts.issues_raw !== counts.issues_kept + counts.issues_rejected) return null;
  if (counts.missing_raw !== counts.missing_kept + counts.missing_rejected) return null;

  if (typeof value.score_trusted !== "boolean") return null;

  if (status === "evidence_checked") {
    if (codes.length !== 0) return null;
    if (counts.issues_rejected !== 0 || counts.missing_rejected !== 0) return null;
    if (value.score_trusted !== true) return null;
  } else {
    if (codes.length === 0) return null;
    if (value.score_trusted !== false) return null;
  }

  return {
    version: ANALYSIS_VERIFICATION_VERSION,
    status,
    reason_codes: codes,
    counts,
    score_trusted: value.score_trusted,
  };
}

/**
 * Кеш-защита: запис без СТРИКТНО валидни метаданни НЕ е доверен кеш-хит и трябва
 * да се преизчисли, вместо да се върне като нов резултат.
 */
export function isTrustedCachedVerification(value: unknown): boolean {
  return validateAnalysisVerification(value) !== null;
}

// ---------------------------------------------------------------------------
// Целият конвейер: от суровия отговор на модела до записваемия резултат
// ---------------------------------------------------------------------------

export interface EvidencePipelineInput {
  /** Суровият (разпарснат) отговор на модела — третира се като недоверен вход. */
  parsed: unknown;
  /**
   * ТОЧНО оригиналният текст, изпратен на модела, БЕЗ служебния маркер за
   * съкращаване (маркерът не е част от документа и не е доказателство).
   */
  sentText: string;
  /** Нормализиран пълен източник — само за проверка на „липсваща клауза". */
  normalizedSource: string;
  /** Дали входът е бил съкратен (тогава анализът е непълен по дефиниция). */
  inputTruncated: boolean;
  isClauseActuallyMissing: (name: string, normalizedSource: string) => boolean;
}

export interface EvidencePipelineResult {
  issues: Record<string, unknown>[];
  missingClauses: Record<string, unknown>[];
  /** Стойност за NOT NULL колоната; рейтинг е само ако `verification.score_trusted`. */
  score: number;
  /** Резюме: неутрално и системно при `incomplete`, иначе резюмето на модела. */
  summary: string;
  contractType: string;
  verification: AnalysisVerificationMetadata;
}

export function runAnalysisEvidencePipeline(
  input: EvidencePipelineInput,
): EvidencePipelineResult {
  const parsed = input.parsed;
  const root = isPlainObject(parsed) ? parsed : null;
  const issuesIsArray = !!root && Array.isArray(root.issues);
  const missingIsArray = !!root && Array.isArray(root.missing_clauses);
  const summaryValid = !!root && boundedNonEmptyString(root.summary, 6000);
  const rootShapeValid = !!root && issuesIsArray && missingIsArray && summaryValid;

  const rawIssues: unknown[] = issuesIsArray ? (root!.issues as unknown[]) : [];
  const rawMissing: unknown[] = missingIsArray ? (root!.missing_clauses as unknown[]) : [];

  const normalizedSentText = normalizeEvidenceText(input.sentText);

  const issues: Record<string, unknown>[] = [];
  let malformedIssues = 0;
  let quoteRejected = 0;
  for (const item of rawIssues) {
    // Пази се ПРЕДИ каквото и да е четене на полета — null/число/масив не хвърля.
    if (!isIssueSchemaValid(item)) {
      malformedIssues++;
      continue;
    }
    const obj = item as Record<string, unknown>;
    if (verifyQuoteAgainstSource(obj.clause, normalizedSentText).verified) {
      issues.push(obj);
    } else {
      quoteRejected++;
    }
  }

  const missingClauses: Record<string, unknown>[] = [];
  let missingMalformed = 0;
  let missingFiltered = 0;
  for (const item of rawMissing) {
    if (!isMissingClauseSchemaValid(item)) {
      missingMalformed++;
      continue;
    }
    const obj = item as Record<string, unknown>;
    if (input.isClauseActuallyMissing(String(obj.name), input.normalizedSource)) {
      missingClauses.push(obj);
    } else {
      missingFiltered++;
    }
  }

  // Оценката НЕ се повишава заради отпаднали находки — липсата на доказателство
  // не е доказателство за безопасност. Запазват се само таваните по тежест.
  const scoreValid = !!root && isValidModelScore(root.score);
  let score = scoreValid ? (root!.score as number) : NEUTRAL_STORED_SCORE;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const medCount = issues.filter((i) => i.severity === "medium").length;
  if (highCount >= 3) score = Math.min(score, 3);
  else if (highCount === 2) score = Math.min(score, 5);
  else if (highCount === 1) score = Math.min(score, 6);
  else if (medCount >= 4) score = Math.min(score, 6);
  else if (medCount >= 2) score = Math.min(score, 7);

  const codes = new Set<AnalysisReasonCode>();
  if (!rootShapeValid) codes.add("root_shape_invalid");
  if (!issuesIsArray) codes.add("issues_not_array");
  if (!missingIsArray) codes.add("missing_not_array");
  if (malformedIssues > 0) codes.add("issue_malformed");
  if (quoteRejected > 0) codes.add("quote_unverified");
  if (missingMalformed > 0) codes.add("missing_clause_malformed");
  if (missingFiltered > 0) codes.add("missing_clause_filtered");
  if (input.inputTruncated) codes.add("input_truncated");
  if (!scoreValid) codes.add("score_invalid");

  const reason_codes = [...codes];
  const incomplete = reason_codes.length > 0;
  const verification: AnalysisVerificationMetadata = {
    version: ANALYSIS_VERIFICATION_VERSION,
    status: incomplete ? "incomplete" : "evidence_checked",
    reason_codes,
    counts: {
      issues_raw: rawIssues.length,
      issues_kept: issues.length,
      issues_rejected: malformedIssues + quoteRejected,
      missing_raw: rawMissing.length,
      missing_kept: missingClauses.length,
      missing_rejected: missingMalformed + missingFiltered,
    },
    score_trusted: !incomplete && scoreValid,
  };

  const modelSummary = summaryValid ? String(root!.summary).slice(0, 4000) : "";
  const contractTypeRaw = root && typeof root.contract_type === "string" ? root.contract_type : "";

  return {
    issues,
    missingClauses,
    score,
    summary: incomplete ? NEUTRAL_INCOMPLETE_SUMMARY : modelSummary,
    contractType: contractTypeRaw.slice(0, 200),
    verification,
  };
}
