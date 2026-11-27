/**
 * Решенията на потребителя по всяка предложена поправка.
 *
 * Чист модул: без мрежа, без база, без общи операции. Правилата са изрични —
 * няма подразбиращо се „приеми всичко“ и няма мълчаливо пропусната поправка.
 * Всяко решение сочи точно една поправка от ТОЧНО този платен резултат.
 */
import {
  CORRECTION_STRATEGIES,
  RESULT_LIMITS,
  type Correction,
  type CorrectionStrategy,
} from "./product-result-contract.ts";

export const SELECTION_DECISION_KINDS = ["accept", "reject"] as const;
export type SelectionDecisionKind = (typeof SELECTION_DECISION_KINDS)[number];

/** Само тези продукти имат поправки за избор. Проверката е с точен продукт. */
export const SELECTION_PRODUCTS = Object.freeze(["contract_improve", "negotiation_package"] as const);
export type SelectionProductId = (typeof SELECTION_PRODUCTS)[number];

export const SELECTION_MAX_DECISIONS = RESULT_LIMITS.corrections;
export const SELECTION_IDEMPOTENCY_MAX_CHARS = 200;

export interface CorrectionDecision {
  readonly correction_id: string;
  readonly decision: SelectionDecisionKind;
  /** Точно един от трите варианта при `accept`; при `reject` е винаги null. */
  readonly strategy: CorrectionStrategy | null;
}

export type SelectionProblem =
  | "product_not_selectable"
  | "decisions_not_array"
  | "too_many_decisions"
  | "invalid_decision"
  | "unknown_correction"
  | "duplicate_correction"
  | "incomplete_decisions"
  | "strategy_required"
  | "strategy_not_allowed"
  | "unknown_strategy"
  | "invalid_expected_version"
  | "invalid_idempotency_key";

export class ProductSelectionError extends Error {
  readonly reason: SelectionProblem;
  constructor(reason: SelectionProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductSelectionError";
  }
}

/** Кратки човешки съобщения на български. Без технически подробности. */
const MESSAGES: Readonly<Record<SelectionProblem, string>> = Object.freeze({
  product_not_selectable: "Този резултат не съдържа поправки за избор.",
  decisions_not_array: "Изборът не е записан. Опитайте отново.",
  too_many_decisions: "Изборът съдържа повече поправки от този резултат.",
  invalid_decision: "Изборът не е записан. Опитайте отново.",
  unknown_correction: "Една от поправките не е част от този резултат.",
  duplicate_correction: "Една поправка е избрана два пъти.",
  incomplete_decisions: "Отбележете за всяка поправка дали я приемате или я отказвате.",
  strategy_required: "Изберете вариант за приетата поправка.",
  strategy_not_allowed: "Отказаната поправка няма избран вариант.",
  unknown_strategy: "Този вариант не е част от поправката.",
  invalid_expected_version: "Изборът е променен в друг раздел. Презаредете и опитайте отново.",
  invalid_idempotency_key: "Изборът не е записан. Опитайте отново.",
});

export function selectionMessage(reason: SelectionProblem): string {
  return MESSAGES[reason];
}

export function isSelectionProduct(productId: string): productId is SelectionProductId {
  return (SELECTION_PRODUCTS as readonly string[]).includes(productId);
}

/**
 * Проверява решенията срещу точните поправки на резултата и връща каноничен,
 * подреден по идентификатор набор. Всяка поправка трябва да има ТОЧНО едно
 * изрично решение: липсващо решение е грешка, не „приемам“.
 */
export function validateSelectionDecisions(
  corrections: readonly Correction[],
  raw: unknown,
): readonly CorrectionDecision[] {
  if (!Array.isArray(raw)) throw new ProductSelectionError("decisions_not_array");
  if (raw.length > SELECTION_MAX_DECISIONS) throw new ProductSelectionError("too_many_decisions");

  const byId = new Map<string, Correction>();
  for (const correction of corrections) byId.set(correction.id, correction);

  const seen = new Set<string>();
  const decisions: CorrectionDecision[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ProductSelectionError("invalid_decision");
    }
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!["correction_id", "decision", "strategy"].includes(key)) {
        throw new ProductSelectionError("invalid_decision");
      }
    }
    const correctionId = record.correction_id;
    if (typeof correctionId !== "string" || correctionId.length === 0) {
      throw new ProductSelectionError("invalid_decision");
    }
    const correction = byId.get(correctionId);
    if (!correction) throw new ProductSelectionError("unknown_correction");
    if (seen.has(correctionId)) throw new ProductSelectionError("duplicate_correction");
    seen.add(correctionId);

    const decision = record.decision;
    if (
      typeof decision !== "string" ||
      !(SELECTION_DECISION_KINDS as readonly string[]).includes(decision)
    ) {
      throw new ProductSelectionError("invalid_decision");
    }
    const strategyRaw = record.strategy ?? null;
    if (decision === "reject") {
      if (strategyRaw !== null) throw new ProductSelectionError("strategy_not_allowed");
      decisions.push(Object.freeze({ correction_id: correctionId, decision, strategy: null }));
      continue;
    }
    if (typeof strategyRaw !== "string") throw new ProductSelectionError("strategy_required");
    if (!(CORRECTION_STRATEGIES as readonly string[]).includes(strategyRaw)) {
      throw new ProductSelectionError("unknown_strategy");
    }
    const strategy = strategyRaw as CorrectionStrategy;
    if (!correction.options.some((option) => option.stance === strategy)) {
      throw new ProductSelectionError("unknown_strategy");
    }
    decisions.push(
      Object.freeze({ correction_id: correctionId, decision: "accept" as const, strategy }),
    );
  }

  if (seen.size !== byId.size) throw new ProductSelectionError("incomplete_decisions");
  decisions.sort((a, b) => (a.correction_id < b.correction_id ? -1 : 1));
  return Object.freeze(decisions);
}

/** Очакваната версия е ЗАДЪЛЖИТЕЛНА: без нея няма оптимистична съгласуваност. */
export function validateExpectedVersion(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) {
    throw new ProductSelectionError("invalid_expected_version");
  }
  return raw;
}

/** Ключът за идемпотентност е задължителен: повторното записване е безопасно. */
export function validateIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string") throw new ProductSelectionError("invalid_idempotency_key");
  const key = raw.trim();
  if (key.length === 0 || key.length > SELECTION_IDEMPOTENCY_MAX_CHARS) {
    throw new ProductSelectionError("invalid_idempotency_key");
  }
  return key;
}

/** Приетите решения в каноничен ред — входът на детерминистичната поправка. */
export function acceptedDecisions(
  decisions: readonly CorrectionDecision[],
): readonly CorrectionDecision[] {
  return Object.freeze(decisions.filter((d) => d.decision === "accept"));
}
