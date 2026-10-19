/**
 * Типове за възпроизводимото регенериране на каталожните документи.
 *
 * Принцип: оригиналът е неизменим, кандидатът е отделна версия, вързана към
 * SHA-256 на точния оригинален текст. Никой статус тук не означава правно
 * одобрение — такова се записва само от човек юрист извън автоматиката.
 */

export type FindingSeverity = "legal_error" | "material_risk" | "conditional_risk" | "editorial";

export type FindingCategory =
  | "wrong_citation"
  | "citation_needs_source"
  | "role_swap"
  | "automatic_payment_admission"
  | "blanket_waiver"
  | "vague_deadline"
  | "malformed_field"
  | "ambiguous_declaration"
  | "unilateral_copies"
  | "naming_inconsistency"
  | "representation_mixing"
  | "absolute_legal_claim"
  | "kit_contradiction";

export interface Finding {
  ruleId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  /** Точна извадка от източника около находката. */
  excerpt: string;
  offset: number;
}

/** Статуси, които автоматиката може да присвои. „approved“ умишлено липсва. */
export type RegistryStatus =
  | "rewritten_candidate_pending_legal_review"
  | "scanned_findings_open"
  | "scanned_no_rule_findings"
  | "candidate_stale_source_changed"
  /** Записът ползва чужд (generic) файл чрез резервно съвпадение — не е преработен. */
  | "scope_mismatch_fallback_template"
  | "no_full_text";

export type RegenScope = "rewritten" | "scanned_only" | "fallback_other_template" | "not_available";

/** Тристепенен отговор: „Не знам“ НЕ е „не“. */
export type TriStateAnswer =
  | { state: "value"; value: string }
  | { state: "no" }
  | { state: "unknown" }
  /** Изрично потвърждение на положителна предпоставка или включване на условен блок. */
  | { state: "confirmed" };

export type AssemblyMode = "blank" | "personalized_final";

export interface CandidateScenario {
  id: string;
  label: string;
  text: string;
  /** Полета, без които персонализиран окончателен документ се блокира. */
  decisiveFields: readonly string[];
  /** Решаващи факти, които не са поле в текста (напр. „наемът е безсрочен“). Също блокират окончателния документ. */
  preconditions?: readonly string[];
  /** Само тези полета допускат отговор „не“ (→ „НЕ СЕ ПРИЛАГА“). */
  nullableFields?: readonly string[];
}

export interface LegalBasisReference {
  cite: string;
  /** Нито един цитат не е проверен от системата срещу прочетен актуален текст. */
  status: "report_cited_unverified" | "existing_text_unverified" | "user_read_source";
  /** Задължително при user_read_source — id от src/lib/templateRegen/sources.ts. */
  sourceId?: string;
  note?: string;
}

export interface TemplateCandidate {
  slug: string;
  version: string;
  /** SHA-256 на точния текст в src/data/templateDrafts/<slug>.ts, от който е изведен кандидатът. */
  baseSourceSha256: string;
  reportRef: string;
  /** Контролна сума на DOCX оригинала, посочена в доклада (не е файл в repo). */
  reportedOriginalSha256: string;
  status: "candidate_draft";
  legalApproval: null;
  inheritsHistoricalAcceptance: false;
  /** Кои точки от доклада са отразени в текста. */
  addressedReportItems: readonly string[];
  scenarios: readonly CandidateScenario[];
  legalBases: readonly LegalBasisReference[];
  unresolvedFacts: readonly string[];
  reviewNotes: readonly string[];
}
