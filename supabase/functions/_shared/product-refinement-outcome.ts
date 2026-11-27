/**
 * Кой изход е ВЕРЕН след опит за уточнение.
 *
 * Разграничението е трайно, а не „тази заявка извика ли fetch“: ако базата
 * пази ПРИКЛЮЧЕНО извикване, доставчикът е бил платен — дори когато точно тази
 * заявка не е докосвала мрежата (повторение след загубен отговор). Тогава
 * провалът НЕ освобождава включеното уточнение; състоянието става неизяснено.
 *
 * Тук не влиза текст на документ, изход на модел или тяло на доставчик.
 */
import { ProductRefinementError } from "./product-refinement.ts";
import { ProductRedactionError } from "./product-secure-redaction.ts";
import { ProductModelGatewayError } from "./product-model-gateway.ts";
import type { ProductReconciliationCode } from "./product-reconciliation.ts";

export interface StoredRefinementResponse {
  readonly output: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly elapsedMs: number;
}

/** Записаният отговор не е с очакваната форма: затворена, безопасна грешка. */
export class StoredRefinementResponseError extends Error {
  constructor(reason = "stored_response_unusable") {
    super(reason);
    this.name = "StoredRefinementResponseError";
  }
}

/**
 * Записаният отговор се ПРОВЕРЯВА, преди да бъде използван. Липсващ изход или
 * нечислов разход не е успех, а неизяснено състояние.
 */
export function validateStoredRefinementResponse(value: unknown): StoredRefinementResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new StoredRefinementResponseError();
  }
  const row = value as Record<string, unknown>;
  if (!("output" in row) || row.output === null || row.output === undefined) {
    throw new StoredRefinementResponseError();
  }
  const input = row.inputTokens;
  const output = row.outputTokens;
  if (
    typeof input !== "number" || !Number.isFinite(input) || input < 0 ||
    typeof output !== "number" || !Number.isFinite(output) || output < 0
  ) {
    throw new StoredRefinementResponseError();
  }
  const elapsed = typeof row.elapsedMs === "number" && Number.isFinite(row.elapsedMs)
    ? row.elapsedMs
    : 0;
  return Object.freeze({
    output: row.output,
    inputTokens: input,
    outputTokens: output,
    elapsedMs: elapsed,
  });
}

export type RefinementOutcome =
  | { readonly action: "reconcile"; readonly code: ProductReconciliationCode }
  | { readonly action: "fail"; readonly code: string };

/**
 * ЕДИНСТВЕНОТО място, което решава дали включеното уточнение може да бъде
 * освободено. При трайно доказателство за извикване отговорът е винаги
 * „неизяснено“.
 */
export function decideRefinementOutcome(input: {
  readonly providerEvidence: boolean;
  readonly error: unknown;
}): RefinementOutcome {
  const { providerEvidence, error } = input;
  if (providerEvidence) {
    const unusable = error instanceof ProductRefinementError ||
      error instanceof StoredRefinementResponseError;
    return { action: "reconcile", code: unusable ? "output_unusable" : "provider_outcome_unknown" };
  }
  if (error instanceof ProductRefinementError) return { action: "fail", code: error.reason };
  if (error instanceof ProductRedactionError) return { action: "fail", code: "redaction_failed" };
  if (error instanceof ProductModelGatewayError) return { action: "fail", code: error.reason };
  return { action: "fail", code: "refinement_failed" };
}
