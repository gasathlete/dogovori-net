// Q2a — доказателствена цялост на риск-анализа (чиста логика, без мрежа и без база).
//
// Принцип: една констатация е „обоснована с текст" САМО ако цитатът съвпада с
// ЕДИН НЕПРЕКЪСНАТ пасаж от точно онзи текст, който наистина е изпратен на модела.
// Липсата на доказателство НЕ е доказателство за безопасност — тя прави анализа
// НЕПЪЛЕН (`incomplete`), а не „чист".
//
// Нормализацията е умишлено тясна и документирана:
//   - Unicode NFKC (за да съвпаднат съвместими форми на едни и същи знаци);
//   - премахване на нулевоширинни знаци (U+200B..U+200D, U+FEFF);
//   - обединяване на ФОРМИ на кавички („ " " « » ‚ ' ' ` → ");
//   - обединяване на всякакво празно място (вкл. NBSP, таб, нов ред) в един интервал;
//   - привеждане към малки букви.
// НЕ се прави: премахване на пунктуация, стеминг, размяна на думи, приблизително
// сходство, нормализация на числа, десетични разделители, валути или отрицания.
// Затова „не дължи 1 000 лв." и „дължи 1000 EUR" НЕ съвпадат.

export const ANALYSIS_VERIFICATION_VERSION = 1 as const;

/** Границите за цитат идват от промпта на analyze-contract (20–280 знака). */
export const QUOTE_MIN_CHARS = 20;
export const QUOTE_MAX_CHARS = 280;

export type AnalysisVerificationStatus = "evidence_checked" | "incomplete";

export type AnalysisReasonCode =
  | "root_shape_invalid"
  | "issues_not_array"
  | "missing_not_array"
  | "issue_malformed"
  | "quote_unverified"
  | "missing_clause_filtered"
  | "input_truncated"
  | "score_invalid";

export interface AnalysisVerificationMetadata {
  version: typeof ANALYSIS_VERIFICATION_VERSION;
  status: AnalysisVerificationStatus;
  /** Само кодове — никога заглавия, цитати, идентификатори или суров текст. */
  reason_codes: AnalysisReasonCode[];
  counts: {
    issues_raw: number;
    issues_kept: number;
    issues_rejected: number;
    missing_raw: number;
    missing_kept: number;
    missing_rejected: number;
  };
  /** Хеш на изпратения към модела текст, ако е налична съществуваща хеш-протоколна стойност. */
  source_text_hash?: string;
  score_trusted: boolean;
}

const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;
const QUOTE_SHAPES = /[\u201E\u201C\u201D\u00AB\u00BB\u201A\u2018\u2019\u0060\u00B4']/g;

/** Тясна нормализация: само Unicode-форма, празно място, форма на кавичките и регистър. */
export function normalizeEvidenceText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKC")
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
 * Проверява дали цитатът е НЕПРЕКЪСНАТ пасаж от `sentText` — точно текста,
 * който е бил подаден на модела (без непратения остатък от дълъг документ).
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

export interface VerificationInput {
  rootShapeValid: boolean;
  issuesIsArray: boolean;
  missingIsArray: boolean;
  issuesRaw: number;
  issuesKept: number;
  malformedIssues: number;
  quoteRejected: number;
  missingRaw: number;
  missingKept: number;
  missingRejected: number;
  inputTruncated: boolean;
  scoreValid: boolean;
  sourceTextHash?: string;
}

/** Сглобява метаданните. Всяко отпадане/непълнота дава `incomplete`. */
export function buildAnalysisVerification(input: VerificationInput): AnalysisVerificationMetadata {
  const codes = new Set<AnalysisReasonCode>();
  if (!input.rootShapeValid) codes.add("root_shape_invalid");
  if (!input.issuesIsArray) codes.add("issues_not_array");
  if (!input.missingIsArray) codes.add("missing_not_array");
  if (input.malformedIssues > 0) codes.add("issue_malformed");
  if (input.quoteRejected > 0) codes.add("quote_unverified");
  if (input.missingRejected > 0) codes.add("missing_clause_filtered");
  if (input.inputTruncated) codes.add("input_truncated");
  if (!input.scoreValid) codes.add("score_invalid");

  const reason_codes = [...codes];
  const meta: AnalysisVerificationMetadata = {
    version: ANALYSIS_VERIFICATION_VERSION,
    status: reason_codes.length === 0 ? "evidence_checked" : "incomplete",
    reason_codes,
    counts: {
      issues_raw: input.issuesRaw,
      issues_kept: input.issuesKept,
      issues_rejected: input.malformedIssues + input.quoteRejected,
      missing_raw: input.missingRaw,
      missing_kept: input.missingKept,
      missing_rejected: input.missingRejected,
    },
    score_trusted: input.scoreValid && reason_codes.length === 0,
  };
  if (typeof input.sourceTextHash === "string" && input.sourceTextHash.length > 0) {
    meta.source_text_hash = input.sourceTextHash;
  }
  return meta;
}

/**
 * Кеш-защита: запис без съвместими метаданни НЕ е доверен кеш-хит и трябва да
 * се преизчисли, вместо да се върне като нов резултат.
 */
export function isTrustedCachedVerification(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== ANALYSIS_VERIFICATION_VERSION) return false;
  if (v.status !== "evidence_checked" && v.status !== "incomplete") return false;
  if (!Array.isArray(v.reason_codes)) return false;
  if (!v.counts || typeof v.counts !== "object" || Array.isArray(v.counts)) return false;
  return typeof v.score_trusted === "boolean";
}

/** Модел-оценката се приема само като цяло число 1..10. */
export function isValidModelScore(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10;
}

/**
 * Неутрална стойност за записа, когато колоната е NOT NULL, но валидна оценка няма.
 * Тя НЕ е рейтинг — метаданните я маркират като недоверена и UI не я показва.
 */
export const NEUTRAL_STORED_SCORE = 5;
