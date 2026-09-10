/**
 * Каноничният договор за резултата от еднократните продукти — без зависимости,
 * за да е използваем и от Edge функции (Deno), и от фронтенда.
 *
 * Правила, които договорът налага:
 *  - технически ключове на английски, човешки етикети остават в UI слоя;
 *  - всяка находка/поправка носи източник (страница/раздел/абзац + извадка) —
 *    доказателство без source span е невалидно;
 *  - никакви непроверими цитати, измислени клаузи или измислени закони:
 *    `legal_reference` е позволен само когато има извадка от документа;
 *  - резултатът е обвързан с точната версия на изходния файл
 *    (`source_document_id` + `source_hash` + `source_revision`).
 */

export const PRODUCT_RESULT_SCHEMA_VERSION = 1 as const;

export const PRODUCT_RESULT_IDS = [
  "contract_check",
  "contract_improve",
  "negotiation_package",
] as const;

export type ProductResultId = (typeof PRODUCT_RESULT_IDS)[number];

export const RESULT_SEVERITIES = ["high", "medium", "low"] as const;
export type ResultSeverity = (typeof RESULT_SEVERITIES)[number];

export const CORRECTION_STRATEGIES = [
  "conservative",
  "balanced",
  "assertive",
] as const;
export type CorrectionStrategy = (typeof CORRECTION_STRATEGIES)[number];

export const RESULT_STATUSES = ["ready", "partial", "failed"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** Точното място в изходния документ — задължително за всяко твърдение. */
export interface SourceSpan {
  /** Страница, когато е измерима. */
  page?: number;
  /** Номер/заглавие на раздел или клауза, както е в документа. */
  section?: string;
  paragraph?: number;
  /** Буквална извадка от документа — не се преформулира. */
  excerpt: string;
}

export interface DocumentPassport {
  document_type: string;
  purpose: string;
  language: string;
  parties: { role: string; name?: string }[];
  section_count?: number;
  page_count?: number;
}

export interface ReviewFinding {
  id: string;
  title: string;
  severity: ResultSeverity;
  /** Какво следва за потребителя, ако остане така. */
  consequence: string;
  /** Една конкретна следваща стъпка. */
  next_step: string;
  source: SourceSpan;
  /** Позволено само когато има извадка от документа. */
  legal_reference?: string;
}

export interface ObligationRow {
  party: string;
  obligation: string;
  deadline?: string;
  source: SourceSpan;
}

export interface MoneyTermRow {
  label: string;
  amount?: string;
  date?: string;
  source: SourceSpan;
}

export interface ReviewPayload {
  passport: DocumentPassport;
  executive_summary: string;
  /** Подредено резюме на най-важното — без изкуствен минимален брой. */
  priority_summary: string[];
  findings: ReviewFinding[];
  obligations: ObligationRow[];
  money_and_dates: MoneyTermRow[];
  termination_and_disputes: { text: string; source: SourceSpan }[];
  contradictions: { text: string; sources: SourceSpan[] }[];
  missing_protections: { text: string; why: string }[];
  questions_to_clarify: string[];
  printable: boolean;
}

export interface CorrectionOption {
  strategy: CorrectionStrategy;
  replacement_text: string;
  /** Какво се печели и какво се отстъпва при този вариант. */
  trade_off: string;
}

export interface CorrectionItem {
  id: string;
  clause_label: string;
  problem: string;
  rationale: string;
  original_text: string;
  source: SourceSpan;
  options: CorrectionOption[];
}

export interface CorrectionPayload {
  review: ReviewPayload;
  default_strategy: CorrectionStrategy;
  corrections: CorrectionItem[];
  outputs: { docx: boolean; pdf: boolean; change_report: boolean };
}

export interface NegotiationBrief {
  objectives: string[];
  red_lines: string[];
  acceptable_concessions: string[];
  fallback_positions: string[];
  questions: string[];
}

export interface ActionRow {
  action: string;
  owner: string;
  due?: string;
  source?: SourceSpan;
}

export interface CounterpartyMessage {
  tone: "neutral" | "firm";
  body: string;
}

export interface NegotiationPayload {
  correction: CorrectionPayload;
  brief: NegotiationBrief;
  action_table: ActionRow[];
  messages: CounterpartyMessage[];
  outputs: { docx: boolean; pdf: boolean; change_report: boolean };
  /** Едно ясно ограничено допълнително прецизиране. */
  included_refinements: 1;
  refinements_used: number;
}

export interface ProductResultBase {
  schema_version: typeof PRODUCT_RESULT_SCHEMA_VERSION;
  source_document_id: string;
  source_hash: string;
  source_revision: number;
  generated_at: string;
  status: ResultStatus;
}

export type ProductResult =
  | (ProductResultBase & {
      product_id: "contract_check";
      payload: ReviewPayload;
    })
  | (ProductResultBase & {
      product_id: "contract_improve";
      payload: CorrectionPayload;
    })
  | (ProductResultBase & {
      product_id: "negotiation_package";
      payload: NegotiationPayload;
    });

/* --------------------------- Леки проверки --------------------------- */

const isStr = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export function isValidSourceSpan(v: unknown): v is SourceSpan {
  return !!v && typeof v === "object" && isStr((v as SourceSpan).excerpt);
}

/** Структурна проверка на обвивката — пълната валидация е със схемата. */
export function isValidResultEnvelope(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as ProductResult;
  return (
    r.schema_version === PRODUCT_RESULT_SCHEMA_VERSION &&
    (PRODUCT_RESULT_IDS as readonly string[]).includes(r.product_id) &&
    isStr(r.source_document_id) &&
    isStr(r.source_hash) &&
    typeof r.source_revision === "number" &&
    isStr(r.generated_at) &&
    (RESULT_STATUSES as readonly string[]).includes(r.status) &&
    !!r.payload
  );
}
