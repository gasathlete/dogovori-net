/**
 * Строга схема на резултата от еднократните продукти (frontend слой).
 *
 * Типовете и константите идват от каноничния Edge-safe договор
 * `supabase/functions/_shared/product-result-contract.ts`; тук добавяме само
 * runtime валидация с вече наличния в проекта `zod` и човешките български
 * етикети за интерфейса. Технически ключове — на английски.
 */
import { z } from "zod";
import {
  CORRECTION_STRATEGIES,
  PRODUCT_RESULT_IDS,
  PRODUCT_RESULT_SCHEMA_VERSION,
  RESULT_SEVERITIES,
  RESULT_STATUSES,
  type CorrectionStrategy,
  type ProductResult,
  type ProductResultId,
  type ResultSeverity,
} from "../../supabase/functions/_shared/product-result-contract";

export {
  CORRECTION_STRATEGIES,
  PRODUCT_RESULT_IDS,
  PRODUCT_RESULT_SCHEMA_VERSION,
  RESULT_SEVERITIES,
  RESULT_STATUSES,
};
export type {
  CorrectionStrategy,
  ProductResult,
  ProductResultId,
  ResultSeverity,
};

const nonEmpty = z.string().trim().min(1);

/** Доказателство без извадка от източника е невалидно. */
export const sourceSpanSchema = z.object({
  page: z.number().int().positive().optional(),
  section: nonEmpty.optional(),
  paragraph: z.number().int().positive().optional(),
  excerpt: nonEmpty,
});

export const passportSchema = z.object({
  document_type: nonEmpty,
  purpose: nonEmpty,
  language: nonEmpty,
  parties: z.array(z.object({ role: nonEmpty, name: nonEmpty.optional() })),
  section_count: z.number().int().nonnegative().optional(),
  page_count: z.number().int().nonnegative().optional(),
});

export const reviewFindingSchema = z.object({
  id: nonEmpty,
  title: nonEmpty,
  severity: z.enum(RESULT_SEVERITIES),
  consequence: nonEmpty,
  next_step: nonEmpty,
  source: sourceSpanSchema,
  legal_reference: nonEmpty.optional(),
});

export const reviewPayloadSchema = z.object({
  passport: passportSchema,
  executive_summary: nonEmpty,
  // Без изкуствен минимален брой: документ без съществени въпроси е валиден.
  priority_summary: z.array(nonEmpty),
  findings: z.array(reviewFindingSchema),
  obligations: z.array(
    z.object({
      party: nonEmpty,
      obligation: nonEmpty,
      deadline: nonEmpty.optional(),
      source: sourceSpanSchema,
    }),
  ),
  money_and_dates: z.array(
    z.object({
      label: nonEmpty,
      amount: nonEmpty.optional(),
      date: nonEmpty.optional(),
      source: sourceSpanSchema,
    }),
  ),
  termination_and_disputes: z.array(
    z.object({ text: nonEmpty, source: sourceSpanSchema }),
  ),
  contradictions: z.array(
    z.object({ text: nonEmpty, sources: z.array(sourceSpanSchema).min(2) }),
  ),
  missing_protections: z.array(z.object({ text: nonEmpty, why: nonEmpty })),
  questions_to_clarify: z.array(nonEmpty),
  printable: z.literal(true),
});

export const correctionItemSchema = z.object({
  id: nonEmpty,
  clause_label: nonEmpty,
  problem: nonEmpty,
  rationale: nonEmpty,
  original_text: nonEmpty,
  source: sourceSpanSchema,
  options: z
    .array(
      z.object({
        strategy: z.enum(CORRECTION_STRATEGIES),
        replacement_text: nonEmpty,
        trade_off: nonEmpty,
      }),
    )
    .length(3)
    .refine(
      (opts) =>
        new Set(opts.map((o) => o.strategy)).size === CORRECTION_STRATEGIES.length,
      { message: "всяка поправка носи точно трите различни подхода" },
    ),
});

const outputsSchema = z.object({
  docx: z.literal(true),
  pdf: z.literal(true),
  change_report: z.literal(true),
});

export const correctionPayloadSchema = z.object({
  review: reviewPayloadSchema,
  default_strategy: z.enum(CORRECTION_STRATEGIES),
  corrections: z.array(correctionItemSchema),
  outputs: outputsSchema,
});

export const negotiationPayloadSchema = z.object({
  correction: correctionPayloadSchema,
  brief: z.object({
    objectives: z.array(nonEmpty).min(1),
    red_lines: z.array(nonEmpty).min(1),
    acceptable_concessions: z.array(nonEmpty).min(1),
    fallback_positions: z.array(nonEmpty).min(1),
    questions: z.array(nonEmpty).min(1),
  }),
  action_table: z
    .array(
      z.object({
        action: nonEmpty,
        owner: nonEmpty,
        due: nonEmpty.optional(),
        source: sourceSpanSchema.optional(),
      }),
    )
    .min(1),
  messages: z
    .array(
      z.object({ tone: z.enum(["neutral", "firm"]), body: nonEmpty }),
    )
    .length(2)
    .refine((m) => m[0].tone !== m[1].tone, {
      message: "двете писма са неутрално и твърдо",
    }),
  outputs: outputsSchema,
  included_refinements: z.literal(1),
  refinements_used: z.number().int().min(0).max(1),
});

const envelope = {
  schema_version: z.literal(PRODUCT_RESULT_SCHEMA_VERSION),
  source_document_id: nonEmpty,
  /** Обвързване с точната версия на качения файл. */
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source_revision: z.number().int().nonnegative(),
  generated_at: z.string().datetime(),
  status: z.enum(RESULT_STATUSES),
};

export const productResultSchema = z.discriminatedUnion("product_id", [
  z.object({
    ...envelope,
    product_id: z.literal("contract_check"),
    payload: reviewPayloadSchema,
  }),
  z.object({
    ...envelope,
    product_id: z.literal("contract_improve"),
    payload: correctionPayloadSchema,
  }),
  z.object({
    ...envelope,
    product_id: z.literal("negotiation_package"),
    payload: negotiationPayloadSchema,
  }),
]);

export type ProductResultParsed = z.infer<typeof productResultSchema>;

export function parseProductResult(value: unknown): ProductResultParsed {
  return productResultSchema.parse(value);
}

export function isProductResult(value: unknown): value is ProductResultParsed {
  return productResultSchema.safeParse(value).success;
}

/**
 * Резултатът важи само за версията, от която е роден. При различен hash или
 * ревизия нищо не се прилага безшумно.
 */
export function matchesSource(
  result: ProductResultParsed,
  source: { source_hash: string; source_revision: number },
): boolean {
  return (
    result.source_hash === source.source_hash &&
    result.source_revision === source.source_revision
  );
}

/* ---------------------- Човешки етикети за UI ---------------------- */

export const SEVERITY_LABELS: Readonly<Record<ResultSeverity, string>> =
  Object.freeze({
    high: "Висока",
    medium: "Средна",
    low: "Ниска",
  });

export const STRATEGY_LABELS: Readonly<Record<CorrectionStrategy, string>> =
  Object.freeze({
    conservative: "Консервативен",
    balanced: "Балансиран",
    assertive: "По-настъпателен",
  });

export const MESSAGE_TONE_LABELS: Readonly<Record<"neutral" | "firm", string>> =
  Object.freeze({ neutral: "Неутрално", firm: "Твърдо" });
