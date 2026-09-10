/**
 * Строгата схема на резултата от еднократните продукти — frontend слой (v2).
 *
 * Типовете и границите идват от каноничния Edge-safe договор
 * `supabase/functions/_shared/product-result-contract.ts`; тук описваме същите
 * правила с `zod`, за да имаме един и същ отговор в браузъра и на сървъра.
 * Има parity тест: за един и същ вход двете проверки дават един и същ извод.
 */
import { z } from "zod";
import {
  ABSENCE_COVERAGE,
  CORRECTION_MODES,
  CORRECTION_STRATEGIES,
  ECONOMIC_TERM_KINDS,
  MAX_REFINEMENTS,
  MESSAGE_TONES,
  PRODUCT_RESULT_IDS,
  PRODUCT_RESULT_SCHEMA_VERSION,
  RESULT_LIMITS,
  RESULT_PARTIES,
  RESULT_SEVERITIES,
  SOURCE_KINDS,
  UUID_RE,
  matchesSourceBinding,
  readyProductResult,
  validateProductResult,
  type Correction,
  type CorrectionStrategy,
  type ProductResult,
  type ProductResultId,
  type ProductSourceBinding,
  type ReadyProductResult,
  type ResultSeverity,
  type SourceSpan,
} from "../../supabase/functions/_shared/product-result-contract";
import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_MIN_SOURCE_CHARS,
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
} from "@/lib/productSource";

export {
  ABSENCE_COVERAGE,
  CORRECTION_MODES,
  CORRECTION_STRATEGIES,
  ECONOMIC_TERM_KINDS,
  MAX_REFINEMENTS,
  MESSAGE_TONES,
  PRODUCT_RESULT_IDS,
  PRODUCT_RESULT_SCHEMA_VERSION,
  RESULT_LIMITS,
  RESULT_PARTIES,
  RESULT_SEVERITIES,
  matchesSourceBinding,
  readyProductResult,
  validateProductResult,
};
export type {
  Correction,
  CorrectionStrategy,
  ProductResult,
  ProductResultId,
  ProductSourceBinding,
  ReadyProductResult,
  ResultSeverity,
  SourceSpan,
};

/** Текст с горна граница в каноничната единица (Unicode кодови точки). */
const text = (max: number) =>
  z.string().refine((v) => v.trim().length > 0, "текстът е празен").refine(
    (v) => countProductSourceChars(v) <= max,
    `текстът надхвърля ${max} знака`,
  );

const nullableText = (max: number) => text(max).nullable();

const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/, "невалиден идентификатор");

const isoSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "невалидна дата/час");

export const sourceBindingSchema = z.object({
  // Един и същ израз за UUID като в Edge договора — иначе двете проверки биха
  // приемали различни записи.
  document_id: z.string().regex(UUID_RE, "очаква се UUID на качения документ"),
  source_hash: z.string().regex(/^[0-9a-f]{64}$/),
  source_kind: z.enum(SOURCE_KINDS),
  char_count: z.number().int().min(PRODUCT_MIN_SOURCE_CHARS).max(PRODUCT_MAX_SOURCE_CHARS),
  char_unit: z.literal(PRODUCT_SOURCE_CHAR_UNIT),
  source_updated_at: isoSchema,
  page_count: z.number().int().positive().max(10000).nullable(),
}).strict();

export const sourceSpanSchema = z
  .object({
    start: z.number().int().min(0).max(PRODUCT_MAX_SOURCE_CHARS),
    end: z.number().int().min(0).max(PRODUCT_MAX_SOURCE_CHARS),
    excerpt: text(RESULT_LIMITS.excerpt),
    page: z.number().int().positive().max(10000).nullish(),
    section: text(RESULT_LIMITS.shortText).nullish(),
    paragraph: z.number().int().min(0).max(100000).nullish(),
  })
  .strict()
  .refine((s) => s.end > s.start, "краят трябва да е след началото")
  .refine(
    (s) => countProductSourceChars(s.excerpt) === s.end - s.start,
    "извадката не съвпада по дължина с мястото в източника",
  );

export const legalBasisSchema = z.object({
  provision_id: idSchema,
  version_id: idSchema,
  source_id: idSchema,
  canonical_url: z.string().regex(/^https:\/\/[^\s]+$/),
  label: text(RESULT_LIMITS.shortText),
}).strict();

const legalBasisList = z.array(legalBasisSchema).max(RESULT_LIMITS.legalBases).optional();

const findingSchema = z.object({
  id: idSchema,
  title: text(RESULT_LIMITS.shortText),
  severity: z.enum(RESULT_SEVERITIES),
  affected_party: z.enum(RESULT_PARTIES),
  explanation: text(RESULT_LIMITS.text),
  // Последствие и следваща стъпка са отделни, за да са наистина полезни.
  consequence: text(RESULT_LIMITS.text),
  next_step: text(RESULT_LIMITS.text),
  span: sourceSpanSchema,
  legal_basis: legalBasisList,
}).strict();

/**
 * Липсваща защита: твърдение „това го няма“, което ЗАДЪЛЖИТЕЛНО сочи механична
 * проверка върху целия документ с `found: false`. Няма и не може да има място в
 * източника — текстът не съществува.
 */
const missingProtectionSchema = z.object({
  id: idSchema,
  title: text(RESULT_LIMITS.shortText),
  concept: text(RESULT_LIMITS.shortText),
  why_it_matters: text(RESULT_LIMITS.text),
  consequence: text(RESULT_LIMITS.text),
  next_step: text(RESULT_LIMITS.text),
  affected_party: z.enum(RESULT_PARTIES),
  absence_check_id: idSchema,
  legal_basis: legalBasisList,
}).strict();

const reviewShape = {
  passport: z.object({
    title: text(RESULT_LIMITS.shortText),
    document_type: text(RESULT_LIMITS.shortText),
    parties: z
      .array(
        z.object({
          role: text(RESULT_LIMITS.shortText),
          // Името може да липсва или да е заличено — тогава е null.
          name: nullableText(RESULT_LIMITS.shortText),
          span: sourceSpanSchema,
        }).strict(),
      )
      .max(RESULT_LIMITS.parties),
    governing_law: nullableText(RESULT_LIMITS.shortText),
    signature_state: nullableText(RESULT_LIMITS.shortText),
  }).strict(),
  executive_summary: text(RESULT_LIMITS.longText),
  priority_summary: z
    .array(
      z.object({
        finding_id: idSchema,
        rank: z.number().int().min(1).max(RESULT_LIMITS.priorities),
        reason: text(RESULT_LIMITS.text),
      }).strict(),
    )
    .max(RESULT_LIMITS.priorities),
  // Нула находки е допустимо: изправен документ не се украсява с находки.
  findings: z.array(findingSchema).max(RESULT_LIMITS.findings),
  obligations: z
    .array(
      z.object({
        id: idSchema,
        party: z.enum(RESULT_PARTIES),
        summary: text(RESULT_LIMITS.text),
        deadline: nullableText(RESULT_LIMITS.shortText),
        span: sourceSpanSchema,
      }).strict(),
    )
    .max(RESULT_LIMITS.obligations),
  economic_terms: z
    .array(
      z.object({
        id: idSchema,
        kind: z.enum(ECONOMIC_TERM_KINDS),
        label: text(RESULT_LIMITS.shortText),
        value_text: text(RESULT_LIMITS.shortText),
        span: sourceSpanSchema,
      }).strict(),
    )
    .max(RESULT_LIMITS.economicTerms),
  termination: z.object({
    summary: text(RESULT_LIMITS.text),
    spans: z.array(sourceSpanSchema).max(RESULT_LIMITS.spansPerItem),
  }).strict(),
  disputes: z.object({
    summary: text(RESULT_LIMITS.text),
    spans: z.array(sourceSpanSchema).max(RESULT_LIMITS.spansPerItem),
  }).strict(),
  contradictions: z
    .array(
      z.object({
        id: idSchema,
        summary: text(RESULT_LIMITS.text),
        spans: z
          .array(sourceSpanSchema)
          .min(2, "противоречието изисква поне две места")
          .max(RESULT_LIMITS.spansPerItem),
      }).strict(),
    )
    .max(RESULT_LIMITS.contradictions),
  absence_checks: z
    .array(
      z
        .object({
          id: idSchema,
          concept: text(RESULT_LIMITS.shortText),
          searched_terms: z
            .array(text(RESULT_LIMITS.shortText))
            .min(1, "проверката за отсъствие изисква търсени изрази")
            .max(RESULT_LIMITS.searchedTerms),
          coverage: z.literal(ABSENCE_COVERAGE),
          found: z.boolean(),
          spans: z.array(sourceSpanSchema).max(RESULT_LIMITS.spansPerItem),
          note: nullableText(RESULT_LIMITS.text),
        })
        .strict()
        .refine((a) => (a.found ? a.spans.length >= 1 : a.spans.length === 0),
          "намереното изисква място, ненамереното не сочи място"),
    )
    .max(RESULT_LIMITS.absenceChecks),
  // Човешките твърдения за липса — само върху проверка с `found: false`.
  missing_protections: z
    .array(missingProtectionSchema)
    .max(RESULT_LIMITS.missingProtections),
  questions: z
    .array(
      z.object({
        id: idSchema,
        question: text(RESULT_LIMITS.text),
        why: text(RESULT_LIMITS.text),
      }).strict(),
    )
    .max(RESULT_LIMITS.questions),
};

const priorityRefsValid = (raw: unknown) => {
  const payload = raw as {
    findings: { id: string }[];
    priority_summary: { finding_id: string; rank: number }[];
  };
  const ids = new Set(payload.findings.map((f) => f.id));
  const ranks = new Set<number>();
  for (const p of payload.priority_summary) {
    if (!ids.has(p.finding_id)) return false;
    if (ranks.has(p.rank)) return false;
    ranks.add(p.rank);
  }
  return new Set(payload.findings.map((f) => f.id)).size === payload.findings.length;
};

/**
 * Всяко твърдение за липса сочи проверка върху ЦЕЛИЯ документ с `found: false`.
 * Иначе е недоказано твърдение и резултатът не е валиден.
 */
const missingProtectionRefsValid = (raw: unknown) => {
  const payload = raw as {
    absence_checks: { id: string; found: boolean }[];
    missing_protections: { id: string; absence_check_id: string }[];
  };
  const notFound = new Set(payload.absence_checks.filter((a) => !a.found).map((a) => a.id));
  const ids = new Set<string>();
  for (const m of payload.missing_protections) {
    if (!notFound.has(m.absence_check_id)) return false;
    if (ids.has(m.id)) return false;
    ids.add(m.id);
  }
  return new Set(payload.absence_checks.map((a) => a.id)).size === payload.absence_checks.length;
};

/**
 * Стабилните идентификатори са уникални във всяка сбирка. Празна сбирка е
 * валидна. Списъкът е един и същ като в каноничния Edge валидатор.
 */
const ID_COLLECTIONS = [
  "findings",
  "obligations",
  "economic_terms",
  "contradictions",
  "absence_checks",
  "missing_protections",
  "questions",
  "corrections",
  "actions",
] as const;

const uniqueIdsValid = (raw: unknown) => {
  const payload = raw as Record<string, unknown>;
  for (const key of ID_COLLECTIONS) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    const ids = list
      .map((item) => (item as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === "string");
    if (new Set(ids).size !== ids.length) return false;
  }
  return true;
};

const UNIQUE_IDS_MESSAGE = "идентификаторите в една сбирка не може да се повтарят";

export const reviewPayloadSchema = z
  .object(reviewShape)
  .strict()
  .refine(priorityRefsValid, "приоритетите сочат само към съществуващи находки")
  .refine(missingProtectionRefsValid, "твърдението за липса изисква проверка с found: false")
  .refine(uniqueIdsValid, UNIQUE_IDS_MESSAGE);


const correctionSchema = z
  .object({
    id: idSchema,
    title: text(RESULT_LIMITS.shortText),
    mode: z.enum(CORRECTION_MODES),
    span: sourceSpanSchema,
    original_text: text(RESULT_LIMITS.excerpt),
    rationale: text(RESULT_LIMITS.text),
    options: z
      .array(
        z.object({
          stance: z.enum(CORRECTION_STRATEGIES),
          replacement_text: text(RESULT_LIMITS.text),
          trade_off: text(RESULT_LIMITS.text),
        }).strict(),
      )
      .length(3, "очакват се точно три варианта"),
    legal_basis: legalBasisList,
  })
  .strict()
  .refine((c) => c.original_text === c.span.excerpt,
    "оригиналният текст трябва да е точно извадката от мястото")
  .refine(
    (c) => CORRECTION_STRATEGIES.every((s) => c.options.some((o) => o.stance === s)),
    "вариантите трябва да са консервативен, балансиран и по-настъпателен",
  )
  .refine(
    (c) => new Set(c.options.map((o) => o.replacement_text.trim())).size === c.options.length,
    "вариантите трябва да са наистина различни",
  );

const noOverlap = (raw: readonly unknown[]) => {
  const corrections = raw as readonly { id: string; span: { start: number; end: number } }[];
  if (new Set(corrections.map((c) => c.id)).size !== corrections.length) return false;
  const sorted = [...corrections].sort((a, b) => a.span.start - b.span.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].span.start < sorted[i - 1].span.end) return false;
  }
  return true;
};

export const correctionPayloadSchema = z
  .object({ ...reviewShape, corrections: z.array(correctionSchema).max(RESULT_LIMITS.corrections) })
  .strict()
  .refine(priorityRefsValid, "приоритетите сочат само към съществуващи находки")
  .refine(missingProtectionRefsValid, "твърдението за липса изисква проверка с found: false")
  .refine((p) => noOverlap(p.corrections as readonly unknown[]), "поправките не може да се застъпват");

const stringList = z.array(text(RESULT_LIMITS.text)).max(RESULT_LIMITS.listItems);

export const negotiationPayloadSchema = z
  .object({
    ...reviewShape,
    corrections: z.array(correctionSchema).max(RESULT_LIMITS.corrections),
    objectives: stringList,
    red_lines: stringList,
    acceptable_concessions: stringList,
    fallbacks: stringList,
    negotiation_questions: stringList,
    actions: z
      .array(
        z.object({
          id: idSchema,
          action: text(RESULT_LIMITS.text),
          owner: text(RESULT_LIMITS.shortText),
          due: nullableText(RESULT_LIMITS.shortText),
          priority: z.enum(RESULT_SEVERITIES),
        }).strict(),
      )
      .max(RESULT_LIMITS.actions),
    messages: z
      .array(
        z.object({
          tone: z.enum(MESSAGE_TONES),
          subject: text(RESULT_LIMITS.shortText),
          body: text(RESULT_LIMITS.longText),
        }).strict(),
      )
      .length(2, "очакват се точно две писма")
      .refine((m) => MESSAGE_TONES.every((t) => m.some((x) => x.tone === t)),
        "писмата трябва да са неутрално и твърдо"),
    refinement: z.object({
      included: z.literal(MAX_REFINEMENTS),
      used: z.number().int().min(0).max(MAX_REFINEMENTS),
    }).strict(),
  })
  .strict()
  .refine(priorityRefsValid, "приоритетите сочат само към съществуващи находки")
  .refine(missingProtectionRefsValid, "твърдението за липса изисква проверка с found: false")
  .refine((p) => noOverlap(p.corrections as readonly unknown[]), "поправките не може да се застъпват");

const envelope = {
  schema_version: z.literal(PRODUCT_RESULT_SCHEMA_VERSION),
  source: sourceBindingSchema,
  generated_at: isoSchema,
};

const productShapes = z.discriminatedUnion("product_id", [
  z.object({ ...envelope, product_id: z.literal("contract_check"), payload: reviewPayloadSchema })
    .strict(),
  z.object({
    ...envelope,
    product_id: z.literal("contract_improve"),
    payload: correctionPayloadSchema,
  }).strict(),
  z.object({
    ...envelope,
    product_id: z.literal("negotiation_package"),
    payload: negotiationPayloadSchema,
  }).strict(),
]);

/**
 * ЕДНА семантика за валиден резултат.
 *
 * Формата се описва тук с `zod` (точни ключове, без непознати полета), а
 * смисловите проверки срещу обвързването — начало/край в приетия източник,
 * страница само когато страниците са измерени, връзки между елементите — идват
 * от каноничния Edge валидатор. Така браузърът и сървърът не могат да се
 * разминат: нито един път не ползва по-слабата проверка.
 */
export const productResultSchema = productShapes.superRefine((value, ctx) => {
  const canonical = validateProductResult(value);
  if (canonical.ok) return;
  const failed = canonical as { readonly errors: readonly string[] };
  for (const message of failed.errors) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

export type ProductResultParsed = z.infer<typeof productShapes>;

/** Кратък извод: валиден ли е резултатът според каноничната семантика. */
export function isValidProductResult(raw: unknown): boolean {
  return productResultSchema.safeParse(raw).success;
}

/**
 * Готов за показване резултат: пълна схема + точно обвързване с източника и
 * закупения продукт. Всичко останало не се показва като готов резултат.
 */
export function parseReadyProductResult(
  raw: unknown,
  expected: ProductSourceBinding,
  expectedProductId: ProductResultId,
):
  | { ok: true; result: ReadyProductResult }
  | { ok: false; errors: string[] } {
  const parsed = productResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const ready = readyProductResult(raw, expected, expectedProductId);
  if (ready.ok) return { ok: true, result: ready.result };
  const failed = ready as { readonly errors: readonly string[] };
  return { ok: false, errors: [...failed.errors] };
}

/** Човешките български етикети за интерфейса. Технически ключове — английски. */
export const SEVERITY_LABELS_BG: Record<ResultSeverity, string> = {
  critical: "Критично",
  high: "Високо",
  medium: "Средно",
  low: "Ниско",
  info: "За сведение",
};

export const STRATEGY_LABELS_BG: Record<CorrectionStrategy, string> = {
  conservative: "Консервативен",
  balanced: "Балансиран",
  assertive: "По-настъпателен",
};
