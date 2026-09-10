/**
 * КАНОНИЧНИЯТ договор за резултата от еднократните продукти — схема v2.
 *
 * Едно място определя какво е валиден платен резултат. Модулът е чист:
 * без Deno API, без база, без мрежа — работи и в Edge, и в браузър, и в тест.
 *
 * Правила, които схемата налага, а не описва:
 *  - всяко твърдение, извлечено от документа, носи ТОЧНО място в източника
 *    (начало/край в Unicode кодови точки + буквална извадка);
 *  - правното основание е по избор и само структурирано — цитат от качения
 *    документ НЕ е правно основание;
 *  - няма изкуствени минимални бройки: изправен документ може да има 0 находки;
 *  - „готов“ резултат съществува само след ПЪЛНА runtime валидация.
 */

import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_MIN_SOURCE_CHARS,
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
} from "./product-source.ts";

/** Версия на схемата. v1 не се приема — няма стари готови резултати. */
export const PRODUCT_RESULT_SCHEMA_VERSION = 2 as const;

export const PRODUCT_RESULT_IDS = [
  "contract_check",
  "contract_improve",
  "negotiation_package",
] as const;
export type ProductResultId = (typeof PRODUCT_RESULT_IDS)[number];

export const RESULT_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type ResultSeverity = (typeof RESULT_SEVERITIES)[number];

export const RESULT_PARTIES = ["you", "counterparty", "both", "third_party", "unclear"] as const;
export type ResultParty = (typeof RESULT_PARTIES)[number];

export const CORRECTION_STRATEGIES = ["conservative", "balanced", "assertive"] as const;
export type CorrectionStrategy = (typeof CORRECTION_STRATEGIES)[number];

export const CORRECTION_MODES = ["replace", "insert_before", "insert_after"] as const;
export type CorrectionMode = (typeof CORRECTION_MODES)[number];

export const ECONOMIC_TERM_KINDS = [
  "amount",
  "date",
  "renewal",
  "notice",
  "penalty",
  "interest",
] as const;
export type EconomicTermKind = (typeof ECONOMIC_TERM_KINDS)[number];

export const MESSAGE_TONES = ["neutral", "firm"] as const;
export type MessageTone = (typeof MESSAGE_TONES)[number];

export const SOURCE_KINDS = ["pdf", "docx"] as const;

/** Единственото покритие, за което твърдим нещо: целият приет източник. */
export const ABSENCE_COVERAGE = "whole_document" as const;

/** Горни граници — резултатът е ограничен, за да е винаги четим и предвидим. */
export const RESULT_LIMITS = Object.freeze({
  excerpt: 1200,
  shortText: 200,
  text: 2000,
  longText: 6000,
  findings: 80,
  obligations: 120,
  economicTerms: 120,
  contradictions: 40,
  absenceChecks: 60,
  missingProtections: 40,
  questions: 40,
  corrections: 120,
  spansPerItem: 12,
  legalBases: 6,
  parties: 12,
  priorities: 12,
  listItems: 24,
  actions: 40,
  searchedTerms: 24,
});

export const MAX_REFINEMENTS = 1 as const;

// ---------------------------------------------------------------- Обвързване

/**
 * Неизменното обвързване с ТОЧНО един източник. Резултат без пълно съвпадение
 * с реда на документа не е валиден за показване.
 */
export interface ProductSourceBinding {
  readonly document_id: string;
  readonly source_hash: string;
  readonly source_kind: "pdf" | "docx";
  readonly char_count: number;
  readonly char_unit: typeof PRODUCT_SOURCE_CHAR_UNIT;
  /** Точната ревизия на реда — `uploaded_contracts.updated_at`. */
  readonly source_updated_at: string;
  /** Измерен брой страници или null. Никога не се предполага. */
  readonly page_count: number | null;
}

/** Място в източника: сървърно изчислени отмествания в кодови точки. */
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly excerpt: string;
  readonly page?: number | null;
  readonly section?: string | null;
  readonly paragraph?: number | null;
}

/**
 * Правно основание — само проверен запис от базата знания. Без канонична
 * връзка и версия основанието се изпуска, а не се измисля.
 */
export interface LegalBasis {
  readonly provision_id: string;
  readonly version_id: string;
  readonly source_id: string;
  readonly canonical_url: string;
  readonly label: string;
}

// ------------------------------------------------------------------ Прегледът

export interface DocumentPassportParty {
  readonly role: string;
  /**
   * Името може наистина да липсва или да е заличено в документа. Тогава е null —
   * никога не се измисля. Ролята и точното място в източника остават задължителни.
   */
  readonly name: string | null;
  readonly span: SourceSpan;
}

export interface DocumentPassport {
  readonly title: string;
  readonly document_type: string;
  readonly parties: readonly DocumentPassportParty[];
  readonly governing_law: string | null;
  readonly signature_state: string | null;
}

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly severity: ResultSeverity;
  /** Какво пише в документа и защо е важно. */
  readonly explanation: string;
  /** Какво може да се случи на практика — отделно поле, не общо обяснение. */
  readonly consequence: string;
  /** Конкретната следваща стъпка за човека. */
  readonly next_step: string;
  readonly affected_party: ResultParty;
  readonly span: SourceSpan;
  readonly legal_basis?: readonly LegalBasis[];
}

export interface PrioritySummaryItem {
  readonly finding_id: string;
  readonly rank: number;
  readonly reason: string;
}

export interface Obligation {
  readonly id: string;
  readonly party: ResultParty;
  readonly summary: string;
  readonly deadline: string | null;
  readonly span: SourceSpan;
}

export interface EconomicTerm {
  readonly id: string;
  readonly kind: EconomicTermKind;
  readonly label: string;
  readonly value_text: string;
  readonly span: SourceSpan;
}

export interface ClauseSummary {
  readonly summary: string;
  readonly spans: readonly SourceSpan[];
}

export interface Contradiction {
  readonly id: string;
  readonly summary: string;
  /** Противоречието е между поне две места в документа. */
  readonly spans: readonly SourceSpan[];
}

/**
 * Проверка за отсъствие: записва КАКВО е търсено и че е търсено в целия
 * източник. Сама по себе си НЕ твърди, че защитата е задължителна.
 */
export interface AbsenceCheck {
  readonly id: string;
  readonly concept: string;
  readonly searched_terms: readonly string[];
  readonly coverage: typeof ABSENCE_COVERAGE;
  readonly found: boolean;
  readonly spans: readonly SourceSpan[];
  readonly note: string | null;
}

/**
 * Липсваща защита — ЕДИНСТВЕНОТО допустимо твърдение „това го няма в документа“.
 *
 * Твърдението е позволено само когато се опира на механична проверка за
 * отсъствие върху целия източник (`absence_check_id` → проверка с
 * `found: false`). Няма място в източника, защото такъв текст няма: измисленo
 * `SourceSpan` за несъществуващ текст е забранено.
 */
export interface MissingProtection {
  readonly id: string;
  readonly title: string;
  readonly concept: string;
  readonly why_it_matters: string;
  readonly consequence: string;
  readonly next_step: string;
  readonly affected_party: ResultParty;
  /** Сочи към проверка за отсъствие върху целия документ с `found: false`. */
  readonly absence_check_id: string;
  readonly legal_basis?: readonly LegalBasis[];
}

export interface ClarifyingQuestion {
  readonly id: string;
  readonly question: string;
  readonly why: string;
}

export interface ReviewPayload {
  readonly passport: DocumentPassport;
  readonly executive_summary: string;
  readonly priority_summary: readonly PrioritySummaryItem[];
  readonly findings: readonly Finding[];
  readonly obligations: readonly Obligation[];
  readonly economic_terms: readonly EconomicTerm[];
  readonly termination: ClauseSummary;
  readonly disputes: ClauseSummary;
  readonly contradictions: readonly Contradiction[];
  /** Механичните проверки: какво е търсено в целия източник. */
  readonly absence_checks: readonly AbsenceCheck[];
  /** Човешките твърдения за липсваща защита, опрени на проверките по-горе. */
  readonly missing_protections: readonly MissingProtection[];
  readonly questions: readonly ClarifyingQuestion[];
}

// ---------------------------------------------------------------- Поправките

export interface CorrectionOption {
  readonly stance: CorrectionStrategy;
  readonly replacement_text: string;
  readonly trade_off: string;
}

export interface Correction {
  /** Стабилен детерминистичен идентификатор (виж product-corrections.ts). */
  readonly id: string;
  readonly title: string;
  readonly mode: CorrectionMode;
  readonly span: SourceSpan;
  readonly original_text: string;
  readonly rationale: string;
  /** Точно три наистина различни варианта. */
  readonly options: readonly [CorrectionOption, CorrectionOption, CorrectionOption];
  readonly legal_basis?: readonly LegalBasis[];
}

export interface CorrectionPayload extends ReviewPayload {
  readonly corrections: readonly Correction[];
}

// ---------------------------------------------------------------- Преговорите

export interface NegotiationAction {
  readonly id: string;
  readonly action: string;
  readonly owner: string;
  readonly due: string | null;
  readonly priority: ResultSeverity;
}

export interface NegotiationMessage {
  readonly tone: MessageTone;
  readonly subject: string;
  readonly body: string;
}

export interface RefinementMeta {
  readonly included: 0 | 1;
  readonly used: 0 | 1;
}

export interface NegotiationPayload extends CorrectionPayload {
  readonly objectives: readonly string[];
  readonly red_lines: readonly string[];
  readonly acceptable_concessions: readonly string[];
  readonly fallbacks: readonly string[];
  readonly negotiation_questions: readonly string[];
  readonly actions: readonly NegotiationAction[];
  /** Точно две писма: неутрално и твърдо. */
  readonly messages: readonly [NegotiationMessage, NegotiationMessage];
  readonly refinement: RefinementMeta;
}

// ------------------------------------------------------------------ Обвивката

interface BaseEnvelope {
  readonly schema_version: typeof PRODUCT_RESULT_SCHEMA_VERSION;
  readonly source: ProductSourceBinding;
  readonly generated_at: string;
}

export interface ContractCheckResult extends BaseEnvelope {
  readonly product_id: "contract_check";
  readonly payload: ReviewPayload;
}

export interface ContractImproveResult extends BaseEnvelope {
  readonly product_id: "contract_improve";
  readonly payload: CorrectionPayload;
}

export interface NegotiationPackageResult extends BaseEnvelope {
  readonly product_id: "negotiation_package";
  readonly payload: NegotiationPayload;
}

export type ProductResult =
  | ContractCheckResult
  | ContractImproveResult
  | NegotiationPackageResult;

/**
 * Резултат, който е ПРЕМИНАЛ пълната валидация. Само такъв може да се запише
 * или покаже като готов — типът не може да се получи без валидатора.
 *
 * Марката е САМО типова (`unique symbol`, деклариран без изпълнение). В
 * изпълнение обектът остава ТОЧНО оригиналният плик v2: няма допълнителен
 * ключ, който да се сериализира в базата или да провали повторна проверка.
 */
declare const PRODUCT_RESULT_READY: unique symbol;
export type ReadyProductResult = ProductResult & {
  readonly [PRODUCT_RESULT_READY]: true;
};


// ------------------------------------------------------------------ Валидация

export type ValidationResult =
  | { readonly ok: true; readonly result: ReadyProductResult }
  | { readonly ok: false; readonly errors: readonly string[] };

class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }

  /**
   * Точни ключове: непознато поле е ОТКАЗ, не тихо игнориране. Записан готов
   * резултат не може да носи полета, които никой не е проверил.
   */
  exact(path: string, o: Record<string, unknown>, allowed: readonly string[]) {
    for (const key of Object.keys(o)) {
      if (!allowed.includes(key)) this.fail(`${path}.${key}`, "непознато поле");
    }
  }

  obj(path: string, value: unknown): Record<string, unknown> | null {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      this.fail(path, "очаква се обект");
      return null;
    }
    return value as Record<string, unknown>;
  }

  str(path: string, value: unknown, max: number, min = 1): string | null {
    if (typeof value !== "string") {
      this.fail(path, "очаква се текст");
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length < min) {
      this.fail(path, "текстът е празен");
      return null;
    }
    if (countProductSourceChars(value) > max) {
      this.fail(path, `текстът надхвърля ${max} знака`);
      return null;
    }
    return value;
  }

  nullableStr(path: string, value: unknown, max: number): boolean {
    if (value === null) return true;
    return this.str(path, value, max) !== null;
  }

  int(path: string, value: unknown, min: number, max: number): number | null {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      this.fail(path, `очаква се цяло число между ${min} и ${max}`);
      return null;
    }
    return value;
  }

  bool(path: string, value: unknown): boolean {
    if (typeof value !== "boolean") {
      this.fail(path, "очаква се да/не");
      return false;
    }
    return true;
  }

  oneOf<T extends string>(path: string, value: unknown, allowed: readonly T[]): T | null {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      this.fail(path, `допустими стойности: ${allowed.join(", ")}`);
      return null;
    }
    return value as T;
  }

  arr(path: string, value: unknown, max: number): unknown[] | null {
    if (!Array.isArray(value)) {
      this.fail(path, "очаква се списък");
      return null;
    }
    if (value.length > max) {
      this.fail(path, `списъкът надхвърля ${max} елемента`);
      return null;
    }
    return value;
  }

  iso(path: string, value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) {
      this.fail(path, "очаква се дата/час в ISO 8601");
      return null;
    }
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) {
      this.fail(path, "невалидна дата/час");
      return null;
    }
    return value;
  }

  /** Кратък текстов идентификатор, стабилен и без изненади. */
  id(path: string, value: unknown): string | null {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) {
      this.fail(path, "невалиден идентификатор");
      return null;
    }
    return value;
  }
}

/** ЕДИН израз за UUID — ползва се и от frontend схемата, за да няма разлика. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/;
const HTTPS_RE = /^https:\/\/[^\s]+$/;

export const BINDING_KEYS = [
  "document_id",
  "source_hash",
  "source_kind",
  "char_count",
  "char_unit",
  "source_updated_at",
  "page_count",
] as const;

function checkBinding(c: Checker, path: string, raw: unknown): ProductSourceBinding | null {
  const o = c.obj(path, raw);
  if (!o) return null;
  c.exact(path, o, BINDING_KEYS);
  if (typeof o.document_id !== "string" || !UUID_RE.test(o.document_id)) {
    c.fail(`${path}.document_id`, "очаква се UUID на качения документ");
  }
  if (typeof o.source_hash !== "string" || !HEX64_RE.test(o.source_hash)) {
    c.fail(`${path}.source_hash`, "очаква се SHA-256 в 64 шестнайсетични знака");
  }
  c.oneOf(`${path}.source_kind`, o.source_kind, SOURCE_KINDS);
  c.int(`${path}.char_count`, o.char_count, PRODUCT_MIN_SOURCE_CHARS, PRODUCT_MAX_SOURCE_CHARS);
  if (o.char_unit !== PRODUCT_SOURCE_CHAR_UNIT) {
    c.fail(`${path}.char_unit`, `единствената мерна единица е ${PRODUCT_SOURCE_CHAR_UNIT}`);
  }
  c.iso(`${path}.source_updated_at`, o.source_updated_at);
  if (o.page_count === undefined) {
    c.fail(`${path}.page_count`, "очаква се измерен брой страници или null");
  } else if (o.page_count !== null) {
    c.int(`${path}.page_count`, o.page_count, 1, 10000);
  }
  return o as unknown as ProductSourceBinding;
}

export const SPAN_KEYS = ["start", "end", "excerpt", "page", "section", "paragraph"] as const;

/**
 * Място в източника. Проверява се и срещу обвързването: край след дължината на
 * приетия източник или страница над измерените страници е ОТКАЗ.
 */
function checkSpan(
  c: Checker,
  path: string,
  raw: unknown,
  binding: ProductSourceBinding | null,
): void {
  const o = c.obj(path, raw);
  if (!o) return;
  c.exact(path, o, SPAN_KEYS);
  const start = c.int(`${path}.start`, o.start, 0, PRODUCT_MAX_SOURCE_CHARS);
  const end = c.int(`${path}.end`, o.end, 0, PRODUCT_MAX_SOURCE_CHARS);
  const excerpt = c.str(`${path}.excerpt`, o.excerpt, RESULT_LIMITS.excerpt);
  if (start !== null && end !== null && end <= start) {
    c.fail(`${path}.end`, "краят трябва да е след началото");
  }
  if (start !== null && end !== null && binding && end > binding.char_count) {
    c.fail(`${path}.end`, "мястото излиза извън приетия източник");
  }
  if (start !== null && end !== null && excerpt !== null) {
    // Дължината на извадката в кодови точки трябва да съвпада с мястото.
    if (countProductSourceChars(excerpt) !== end - start) {
      c.fail(`${path}.excerpt`, "извадката не съвпада по дължина с мястото в източника");
    }
  }
  if (o.page !== undefined && o.page !== null) {
    const page = c.int(`${path}.page`, o.page, 1, 10000);
    if (page !== null) {
      if (binding && binding.page_count === null) {
        c.fail(`${path}.page`, "страниците не са измерени, страница не може да се твърди");
      } else if (binding && page > binding.page_count!) {
        c.fail(`${path}.page`, "страницата надхвърля измерените страници");
      }
    }
  }
  if (o.paragraph !== undefined && o.paragraph !== null) {
    c.int(`${path}.paragraph`, o.paragraph, 0, 100000);
  }
  if (o.section !== undefined && o.section !== null) {
    c.str(`${path}.section`, o.section, RESULT_LIMITS.shortText);
  }
}

function checkSpans(
  c: Checker,
  path: string,
  raw: unknown,
  binding: ProductSourceBinding | null,
  min: number,
): void {
  const list = c.arr(path, raw, RESULT_LIMITS.spansPerItem);
  if (!list) return;
  if (list.length < min) c.fail(path, `очакват се поне ${min} места в източника`);
  list.forEach((span, i) => checkSpan(c, `${path}[${i}]`, span, binding));
}

export const LEGAL_BASIS_KEYS = [
  "provision_id",
  "version_id",
  "source_id",
  "canonical_url",
  "label",
] as const;

function checkLegalBasis(c: Checker, path: string, raw: unknown): void {
  if (raw === undefined) return;
  const list = c.arr(path, raw, RESULT_LIMITS.legalBases);
  if (!list) return;
  list.forEach((item, i) => {
    const p = `${path}[${i}]`;
    const o = c.obj(p, item);
    if (!o) return;
    c.exact(p, o, LEGAL_BASIS_KEYS);
    c.id(`${p}.provision_id`, o.provision_id);
    c.id(`${p}.version_id`, o.version_id);
    c.id(`${p}.source_id`, o.source_id);
    c.str(`${p}.label`, o.label, RESULT_LIMITS.shortText);
    if (typeof o.canonical_url !== "string" || !HTTPS_RE.test(o.canonical_url)) {
      c.fail(`${p}.canonical_url`, "очаква се канонична https връзка към източника");
    }
  });
}

/**
 * Стабилните идентификатори са наистина стабилни: в една сбирка не може да има
 * два еднакви. Празна сбирка е валидна. Проверката е обща, за да важи еднакво
 * за всички сбирки с идентификатори.
 */
function checkUniqueIds(c: Checker, path: string, raw: unknown): void {
  if (!Array.isArray(raw)) return;
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return;
    if (seen.has(id)) c.fail(`${path}[${i}].id`, "повтарящ се идентификатор");
    seen.add(id);
  });
}



function checkReview(
  c: Checker,
  path: string,
  o: Record<string, unknown>,
  binding: ProductSourceBinding | null,
): void {
  // Всяка сбирка със стабилни идентификатори — без повторения.
  for (const key of [
    "findings",
    "obligations",
    "economic_terms",
    "contradictions",
    "absence_checks",
    "missing_protections",
    "questions",
  ] as const) {
    checkUniqueIds(c, `${path}.${key}`, o[key]);
  }

  // Паспорт на документа

  const passport = c.obj(`${path}.passport`, o.passport);
  if (passport) {
    c.exact(`${path}.passport`, passport, [
      "title",
      "document_type",
      "parties",
      "governing_law",
      "signature_state",
    ]);
    c.str(`${path}.passport.title`, passport.title, RESULT_LIMITS.shortText);
    c.str(`${path}.passport.document_type`, passport.document_type, RESULT_LIMITS.shortText);
    c.nullableStr(`${path}.passport.governing_law`, passport.governing_law, RESULT_LIMITS.shortText);
    c.nullableStr(
      `${path}.passport.signature_state`,
      passport.signature_state,
      RESULT_LIMITS.shortText,
    );
    const parties = c.arr(`${path}.passport.parties`, passport.parties, RESULT_LIMITS.parties);
    parties?.forEach((party, i) => {
      const p = `${path}.passport.parties[${i}]`;
      const po = c.obj(p, party);
      if (!po) return;
      c.exact(p, po, ["role", "name", "span"]);
      c.str(`${p}.role`, po.role, RESULT_LIMITS.shortText);
      // Името може да е заличено или да липсва — тогава е null, не измислено.
      if (po.name === undefined) c.fail(`${p}.name`, "очаква се име или null");
      else c.nullableStr(`${p}.name`, po.name, RESULT_LIMITS.shortText);
      checkSpan(c, `${p}.span`, po.span, binding);
    });
  }

  c.str(`${path}.executive_summary`, o.executive_summary, RESULT_LIMITS.longText);

  // Находки — нула е допустима стойност.
  const findingIds = new Set<string>();
  const findings = c.arr(`${path}.findings`, o.findings, RESULT_LIMITS.findings);
  findings?.forEach((item, i) => {
    const p = `${path}.findings[${i}]`;
    const fo = c.obj(p, item);
    if (!fo) return;
    const id = c.id(`${p}.id`, fo.id);
    if (id) {
      if (findingIds.has(id)) c.fail(`${p}.id`, "повтарящ се идентификатор");
      findingIds.add(id);
    }
    c.exact(p, fo, [
      "id",
      "title",
      "severity",
      "affected_party",
      "explanation",
      "consequence",
      "next_step",
      "span",
      "legal_basis",
    ]);
    c.str(`${p}.title`, fo.title, RESULT_LIMITS.shortText);
    c.oneOf(`${p}.severity`, fo.severity, RESULT_SEVERITIES);
    c.oneOf(`${p}.affected_party`, fo.affected_party, RESULT_PARTIES);
    c.str(`${p}.explanation`, fo.explanation, RESULT_LIMITS.text);
    // Последствието и следващата стъпка са отделни полета, не общо обяснение.
    c.str(`${p}.consequence`, fo.consequence, RESULT_LIMITS.text);
    c.str(`${p}.next_step`, fo.next_step, RESULT_LIMITS.text);
    checkSpan(c, `${p}.span`, fo.span, binding);
    checkLegalBasis(c, `${p}.legal_basis`, fo.legal_basis);
  });

  // Приоритетите сочат САМО към съществуващи находки.
  const priorities = c.arr(`${path}.priority_summary`, o.priority_summary, RESULT_LIMITS.priorities);
  const seenRanks = new Set<number>();
  priorities?.forEach((item, i) => {
    const p = `${path}.priority_summary[${i}]`;
    const po = c.obj(p, item);
    if (!po) return;
    c.exact(p, po, ["finding_id", "rank", "reason"]);
    const ref = c.id(`${p}.finding_id`, po.finding_id);
    if (ref && !findingIds.has(ref)) c.fail(`${p}.finding_id`, "сочи към несъществуваща находка");
    const rank = c.int(`${p}.rank`, po.rank, 1, RESULT_LIMITS.priorities);
    if (rank !== null) {
      if (seenRanks.has(rank)) c.fail(`${p}.rank`, "повтарящ се приоритет");
      seenRanks.add(rank);
    }
    c.str(`${p}.reason`, po.reason, RESULT_LIMITS.text);
  });

  const obligations = c.arr(`${path}.obligations`, o.obligations, RESULT_LIMITS.obligations);
  obligations?.forEach((item, i) => {
    const p = `${path}.obligations[${i}]`;
    const oo = c.obj(p, item);
    if (!oo) return;
    c.exact(p, oo, ["id", "party", "summary", "deadline", "span"]);
    c.id(`${p}.id`, oo.id);
    c.oneOf(`${p}.party`, oo.party, RESULT_PARTIES);
    c.str(`${p}.summary`, oo.summary, RESULT_LIMITS.text);
    c.nullableStr(`${p}.deadline`, oo.deadline, RESULT_LIMITS.shortText);
    checkSpan(c, `${p}.span`, oo.span, binding);
  });

  const terms = c.arr(`${path}.economic_terms`, o.economic_terms, RESULT_LIMITS.economicTerms);
  terms?.forEach((item, i) => {
    const p = `${path}.economic_terms[${i}]`;
    const to = c.obj(p, item);
    if (!to) return;
    c.exact(p, to, ["id", "kind", "label", "value_text", "span"]);
    c.id(`${p}.id`, to.id);
    c.oneOf(`${p}.kind`, to.kind, ECONOMIC_TERM_KINDS);
    c.str(`${p}.label`, to.label, RESULT_LIMITS.shortText);
    c.str(`${p}.value_text`, to.value_text, RESULT_LIMITS.shortText);
    checkSpan(c, `${p}.span`, to.span, binding);
  });

  for (const key of ["termination", "disputes"] as const) {
    const co = c.obj(`${path}.${key}`, o[key]);
    if (!co) continue;
    c.exact(`${path}.${key}`, co, ["summary", "spans"]);
    c.str(`${path}.${key}.summary`, co.summary, RESULT_LIMITS.text);
    checkSpans(c, `${path}.${key}.spans`, co.spans, binding, 0);
  }

  const contradictions = c.arr(
    `${path}.contradictions`,
    o.contradictions,
    RESULT_LIMITS.contradictions,
  );
  contradictions?.forEach((item, i) => {
    const p = `${path}.contradictions[${i}]`;
    const co = c.obj(p, item);
    if (!co) return;
    c.exact(p, co, ["id", "summary", "spans"]);
    c.id(`${p}.id`, co.id);
    c.str(`${p}.summary`, co.summary, RESULT_LIMITS.text);
    // Противоречие има смисъл само между поне две места.
    checkSpans(c, `${p}.spans`, co.spans, binding, 2);
  });

  // Механичните проверки: кои понятия са търсени в целия източник.
  const notFoundChecks = new Set<string>();
  const absenceIds = new Set<string>();
  const absence = c.arr(`${path}.absence_checks`, o.absence_checks, RESULT_LIMITS.absenceChecks);
  absence?.forEach((item, i) => {
    const p = `${path}.absence_checks[${i}]`;
    const ao = c.obj(p, item);
    if (!ao) return;
    c.exact(p, ao, ["id", "concept", "searched_terms", "coverage", "found", "spans", "note"]);
    const aid = c.id(`${p}.id`, ao.id);
    if (aid) {
      if (absenceIds.has(aid)) c.fail(`${p}.id`, "повтарящ се идентификатор на проверка");
      absenceIds.add(aid);
    }
    c.str(`${p}.concept`, ao.concept, RESULT_LIMITS.shortText);
    const searched = c.arr(`${p}.searched_terms`, ao.searched_terms, RESULT_LIMITS.searchedTerms);
    if (searched && searched.length === 0) {
      c.fail(`${p}.searched_terms`, "проверката за отсъствие изисква търсени изрази");
    }
    searched?.forEach((t, j) => c.str(`${p}.searched_terms[${j}]`, t, RESULT_LIMITS.shortText));
    if (ao.coverage !== ABSENCE_COVERAGE) {
      c.fail(`${p}.coverage`, `покритието трябва да е ${ABSENCE_COVERAGE}`);
    }
    const found = c.bool(`${p}.found`, ao.found) ? (ao.found as boolean) : null;
    checkSpans(c, `${p}.spans`, ao.spans, binding, found === true ? 1 : 0);
    if (found === false && Array.isArray(ao.spans) && ao.spans.length > 0) {
      c.fail(`${p}.spans`, "ненамерен израз не може да сочи място в източника");
    }
    if (found === false && aid) notFoundChecks.add(aid);
    c.nullableStr(`${p}.note`, ao.note, RESULT_LIMITS.text);
  });

  /*
   * Липсващи защити — човешкото твърдение „това го няма“. Допустимо е САМО
   * когато сочи проверка върху целия документ с `found: false`. Затова тук няма
   * SourceSpan: текст, който не съществува, не може да има място в източника.
   */
  const missingIds = new Set<string>();
  const missing = c.arr(
    `${path}.missing_protections`,
    o.missing_protections,
    RESULT_LIMITS.missingProtections,
  );
  missing?.forEach((item, i) => {
    const p = `${path}.missing_protections[${i}]`;
    const mo = c.obj(p, item);
    if (!mo) return;
    c.exact(p, mo, [
      "id",
      "title",
      "concept",
      "why_it_matters",
      "consequence",
      "next_step",
      "affected_party",
      "absence_check_id",
      "legal_basis",
    ]);
    const id = c.id(`${p}.id`, mo.id);
    if (id) {
      if (missingIds.has(id)) c.fail(`${p}.id`, "повтарящ се идентификатор");
      missingIds.add(id);
    }
    c.str(`${p}.title`, mo.title, RESULT_LIMITS.shortText);
    c.str(`${p}.concept`, mo.concept, RESULT_LIMITS.shortText);
    c.str(`${p}.why_it_matters`, mo.why_it_matters, RESULT_LIMITS.text);
    c.str(`${p}.consequence`, mo.consequence, RESULT_LIMITS.text);
    c.str(`${p}.next_step`, mo.next_step, RESULT_LIMITS.text);
    c.oneOf(`${p}.affected_party`, mo.affected_party, RESULT_PARTIES);
    const ref = c.id(`${p}.absence_check_id`, mo.absence_check_id);
    if (ref && !notFoundChecks.has(ref)) {
      c.fail(
        `${p}.absence_check_id`,
        "твърдението за липса трябва да сочи проверка върху целия документ с found: false",
      );
    }
    checkLegalBasis(c, `${p}.legal_basis`, mo.legal_basis);
  });

  const questions = c.arr(`${path}.questions`, o.questions, RESULT_LIMITS.questions);
  questions?.forEach((item, i) => {
    const p = `${path}.questions[${i}]`;
    const qo = c.obj(p, item);
    if (!qo) return;
    c.exact(p, qo, ["id", "question", "why"]);
    c.id(`${p}.id`, qo.id);
    c.str(`${p}.question`, qo.question, RESULT_LIMITS.text);
    c.str(`${p}.why`, qo.why, RESULT_LIMITS.text);
  });
}

function checkCorrections(
  c: Checker,
  path: string,
  o: Record<string, unknown>,
  binding: ProductSourceBinding | null,
): void {
  const list = c.arr(`${path}.corrections`, o.corrections, RESULT_LIMITS.corrections);
  if (!list) return;
  const ids = new Set<string>();
  const ranges: Array<{ start: number; end: number; path: string }> = [];
  list.forEach((item, i) => {
    const p = `${path}.corrections[${i}]`;
    const co = c.obj(p, item);
    if (!co) return;
    const id = c.id(`${p}.id`, co.id);
    if (id) {
      if (ids.has(id)) c.fail(`${p}.id`, "повтарящ се идентификатор на поправка");
      ids.add(id);
    }
    c.str(`${p}.title`, co.title, RESULT_LIMITS.shortText);
    c.oneOf(`${p}.mode`, co.mode, CORRECTION_MODES);
    checkSpan(c, `${p}.span`, co.span, binding);
    const span = co.span as { start?: unknown; end?: unknown; excerpt?: unknown } | null;
    if (
      span && typeof span.start === "number" && typeof span.end === "number"
    ) {
      ranges.push({ start: span.start, end: span.end, path: p });
    }
    const original = c.str(`${p}.original_text`, co.original_text, RESULT_LIMITS.excerpt);
    if (
      original !== null && span && typeof span.excerpt === "string" &&
      original !== span.excerpt
    ) {
      c.fail(`${p}.original_text`, "оригиналният текст трябва да е точно извадката от мястото");
    }
    c.exact(p, co, [
      "id",
      "title",
      "mode",
      "span",
      "original_text",
      "rationale",
      "options",
      "legal_basis",
    ]);
    c.str(`${p}.rationale`, co.rationale, RESULT_LIMITS.text);
    const options = c.arr(`${p}.options`, co.options, 3);
    if (options && options.length !== 3) {
      c.fail(`${p}.options`, "очакват се точно три варианта");
    }
    const stances: string[] = [];
    const texts: string[] = [];
    options?.forEach((opt, j) => {
      const op = `${p}.options[${j}]`;
      const oo = c.obj(op, opt);
      if (!oo) return;
      c.exact(op, oo, ["stance", "replacement_text", "trade_off"]);
      const stance = c.oneOf(`${op}.stance`, oo.stance, CORRECTION_STRATEGIES);
      if (stance) stances.push(stance);
      const text = c.str(`${op}.replacement_text`, oo.replacement_text, RESULT_LIMITS.text);
      if (text) texts.push(text.trim());
      c.str(`${op}.trade_off`, oo.trade_off, RESULT_LIMITS.text);
    });
    if (options && options.length === 3) {
      for (const stance of CORRECTION_STRATEGIES) {
        if (!stances.includes(stance)) c.fail(`${p}.options`, `липсва вариант ${stance}`);
      }
      // Три пъти един и същ текст не е избор.
      if (new Set(texts).size !== texts.length) {
        c.fail(`${p}.options`, "вариантите трябва да са наистина различни");
      }
    }
    checkLegalBasis(c, `${p}.legal_basis`, co.legal_basis);
  });

  // Поправките не се застъпват — иначе поправен документ не може да се сглоби.
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      c.fail(`${sorted[i].path}.span`, "мястото се застъпва с друга поправка");
    }
  }
}

function checkNegotiation(c: Checker, path: string, o: Record<string, unknown>): void {
  const lists = [
    "objectives",
    "red_lines",
    "acceptable_concessions",
    "fallbacks",
    "negotiation_questions",
  ] as const;
  for (const key of lists) {
    const list = c.arr(`${path}.${key}`, o[key], RESULT_LIMITS.listItems);
    list?.forEach((item, i) => c.str(`${path}.${key}[${i}]`, item, RESULT_LIMITS.text));
  }

  const actions = c.arr(`${path}.actions`, o.actions, RESULT_LIMITS.actions);
  actions?.forEach((item, i) => {
    const p = `${path}.actions[${i}]`;
    const ao = c.obj(p, item);
    if (!ao) return;
    c.exact(p, ao, ["id", "action", "owner", "due", "priority"]);
    c.id(`${p}.id`, ao.id);
    c.str(`${p}.action`, ao.action, RESULT_LIMITS.text);
    c.str(`${p}.owner`, ao.owner, RESULT_LIMITS.shortText);
    c.nullableStr(`${p}.due`, ao.due, RESULT_LIMITS.shortText);
    c.oneOf(`${p}.priority`, ao.priority, RESULT_SEVERITIES);
  });

  const messages = c.arr(`${path}.messages`, o.messages, 2);
  if (messages && messages.length !== 2) {
    c.fail(`${path}.messages`, "очакват се точно две писма");
  }
  const tones: string[] = [];
  messages?.forEach((item, i) => {
    const p = `${path}.messages[${i}]`;
    const mo = c.obj(p, item);
    if (!mo) return;
    c.exact(p, mo, ["tone", "subject", "body"]);
    const tone = c.oneOf(`${p}.tone`, mo.tone, MESSAGE_TONES);
    if (tone) tones.push(tone);
    c.str(`${p}.subject`, mo.subject, RESULT_LIMITS.shortText);
    c.str(`${p}.body`, mo.body, RESULT_LIMITS.longText);
  });
  if (messages && messages.length === 2) {
    for (const tone of MESSAGE_TONES) {
      if (!tones.includes(tone)) c.fail(`${path}.messages`, `липсва писмо с тон ${tone}`);
    }
  }

  const refinement = c.obj(`${path}.refinement`, o.refinement);
  if (refinement) {
    c.exact(`${path}.refinement`, refinement, ["included", "used"]);
    const included = c.int(`${path}.refinement.included`, refinement.included, 0, MAX_REFINEMENTS);
    const used = c.int(`${path}.refinement.used`, refinement.used, 0, MAX_REFINEMENTS);
    if (included !== null && included !== 1) {
      c.fail(`${path}.refinement.included`, "пълният пакет включва точно едно уточнение");
    }
    if (included !== null && used !== null && used > included) {
      c.fail(`${path}.refinement.used`, "използваните уточнения надхвърлят включените");
    }
  }
}

/**
 * Точните ключове на записания резултат. Политиката е ЕДНА и е строга: непознато
 * поле е отказ, а не тихо игнориране — иначе непроверено съдържание би стигнало
 * до платен резултат. Frontend схемата ползва същите списъци.
 */
export const ENVELOPE_KEYS = [
  "schema_version",
  "product_id",
  "source",
  "generated_at",
  "payload",
] as const;

export const REVIEW_PAYLOAD_KEYS = [
  "passport",
  "executive_summary",
  "priority_summary",
  "findings",
  "obligations",
  "economic_terms",
  "termination",
  "disputes",
  "contradictions",
  "absence_checks",
  "missing_protections",
  "questions",
] as const;

export const CORRECTION_PAYLOAD_KEYS = [...REVIEW_PAYLOAD_KEYS, "corrections"] as const;

export const NEGOTIATION_PAYLOAD_KEYS = [
  ...CORRECTION_PAYLOAD_KEYS,
  "objectives",
  "red_lines",
  "acceptable_concessions",
  "fallbacks",
  "negotiation_questions",
  "actions",
  "messages",
  "refinement",
] as const;

export const PAYLOAD_KEYS: Record<ProductResultId, readonly string[]> = {
  contract_check: REVIEW_PAYLOAD_KEYS,
  contract_improve: CORRECTION_PAYLOAD_KEYS,
  negotiation_package: NEGOTIATION_PAYLOAD_KEYS,
};

/**
 * ПЪЛНАТА runtime валидация. Единственият път до „готов“ резултат.
 * Не хвърля: връща всички намерени проблеми, за да са проследими.
 */
export function validateProductResult(raw: unknown): ValidationResult {
  const c = new Checker();
  const o = c.obj("result", raw);
  if (!o) return { ok: false, errors: c.errors };

  c.exact("result", o, ENVELOPE_KEYS);
  if (o.schema_version !== PRODUCT_RESULT_SCHEMA_VERSION) {
    c.fail("result.schema_version", `очаква се версия ${PRODUCT_RESULT_SCHEMA_VERSION}`);
  }
  const productId = c.oneOf("result.product_id", o.product_id, PRODUCT_RESULT_IDS);
  const binding = checkBinding(c, "result.source", o.source);
  c.iso("result.generated_at", o.generated_at);

  const payload = c.obj("result.payload", o.payload);
  if (payload && productId) {
    c.exact("result.payload", payload, PAYLOAD_KEYS[productId]);
    checkReview(c, "result.payload", payload, binding);
    if (productId === "contract_improve" || productId === "negotiation_package") {
      checkCorrections(c, "result.payload", payload, binding);
    } else if ("corrections" in payload) {
      c.fail("result.payload.corrections", "проверката преди подпис не носи поправки");
    }
    if (productId === "negotiation_package") {
      checkNegotiation(c, "result.payload", payload);
    } else if ("messages" in payload) {
      c.fail("result.payload.messages", "писма има само пълният пакет за преговори");
    }
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  // Без допълнителен ключ: готовият резултат е точно проверения плик.
  return { ok: true, result: o as unknown as ReadyProductResult };

}

/**
 * Резултатът е обвързан с ТОЧНО този източник. Различен документ, хеш, вид,
 * дължина или ревизия е различен резултат.
 */
export function matchesSourceBinding(
  result: ProductResult,
  expected: ProductSourceBinding,
): boolean {
  const a = result.source;
  return (
    a.document_id === expected.document_id &&
    a.source_hash.toLowerCase() === expected.source_hash.toLowerCase() &&
    a.source_kind === expected.source_kind &&
    a.char_count === expected.char_count &&
    a.char_unit === expected.char_unit &&
    a.source_updated_at === expected.source_updated_at &&
    a.page_count === expected.page_count
  );
}

/** Готов резултат за показване = валиден + обвързан с точния източник. */
export function readyProductResult(
  raw: unknown,
  expected: ProductSourceBinding,
  expectedProductId: ProductResultId,
): ValidationResult {
  const validated = validateProductResult(raw);
  if (!validated.ok) return validated;
  if (validated.result.product_id !== expectedProductId) {
    return { ok: false, errors: ["result.product_id: не е закупеният продукт"] };
  }
  if (!matchesSourceBinding(validated.result, expected)) {
    return { ok: false, errors: ["result.source: резултатът е за друга версия на документа"] };
  }
  return validated;
}
