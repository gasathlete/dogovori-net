/**
 * Точно ЕДНО премиум уточнение на пакета за преговори.
 *
 * Чист модул: проверява указанието на потребителя и уточнения резултат срещу
 * ТОЧНО оригинала. Оригиналният платен резултат никога не се заменя — той
 * остава наличен, а уточнението е отделен, неизменен запис.
 */
import { detectIllegalContent } from "./illegal-content-detector.ts";
import { normalizeProductSourceText } from "./product-source.ts";
import {
  MAX_REFINEMENTS,
  readyProductResult,
  type NegotiationPackageResult,
  type ProductSourceBinding,
  type ReadyProductResult,
} from "./product-result-contract.ts";

export const REFINEMENT_MIN_INSTRUCTION_CHARS = 12;
export const REFINEMENT_MAX_INSTRUCTION_CHARS = 1200;
export const REFINEMENT_LEASE_SECONDS = 180;
export const REFINEMENT_IDEMPOTENCY_MAX_CHARS = 200;

export type RefinementProblem =
  | "not_refinable"
  | "refinement_used"
  | "instruction_too_short"
  | "instruction_too_long"
  | "instruction_not_allowed"
  | "invalid_idempotency_key"
  | "lease_active"
  | "refined_invalid"
  | "refined_source_mismatch"
  | "refined_corrections_changed"
  | "refined_refinement_meta"
  | "refined_placeholder_left";

export class ProductRefinementError extends Error {
  readonly reason: RefinementProblem;
  constructor(reason: RefinementProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductRefinementError";
  }
}

const MESSAGES: Readonly<Record<RefinementProblem, string>> = Object.freeze({
  not_refinable: "Уточнение е включено само в пълния пакет за преговори.",
  refinement_used: "Включеното уточнение вече е използвано.",
  instruction_too_short: "Опишете с едно-две изречения какво да уточним.",
  instruction_too_long: "Съкратете указанието.",
  instruction_not_allowed: "Не можем да работим по такова указание.",
  invalid_idempotency_key: "Уточнението не е заявено. Опитайте отново.",
  lease_active: "Уточнението се изготвя в момента.",
  refined_invalid: "Уточнението не премина проверката. Оригиналният резултат остава наличен.",
  refined_source_mismatch:
    "Уточнението не е обвързано с платения документ. Оригиналният резултат остава наличен.",
  refined_corrections_changed:
    "Уточнението промени поправките извън обхвата. Оригиналният резултат остава наличен.",
  refined_refinement_meta: "Уточнението не премина проверката. Оригиналният резултат остава наличен.",
  refined_placeholder_left:
    "Уточнението не премина проверката за безопасност. Оригиналният резултат остава наличен.",
});

export function refinementMessage(reason: RefinementProblem): string {
  return MESSAGES[reason];
}

/** Указанието е текст на потребителя: нормализира се и се проверява статично. */
export function validateRefinementInstruction(raw: unknown): string {
  if (typeof raw !== "string") throw new ProductRefinementError("instruction_too_short");
  const instruction = normalizeProductSourceText(raw).trim();
  if (Array.from(instruction).length < REFINEMENT_MIN_INSTRUCTION_CHARS) {
    throw new ProductRefinementError("instruction_too_short");
  }
  if (Array.from(instruction).length > REFINEMENT_MAX_INSTRUCTION_CHARS) {
    throw new ProductRefinementError("instruction_too_long");
  }
  if (detectIllegalContent(instruction).blocked) {
    throw new ProductRefinementError("instruction_not_allowed");
  }
  return instruction;
}

export function validateRefinementIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string") throw new ProductRefinementError("invalid_idempotency_key");
  const key = raw.trim();
  if (key.length === 0 || key.length > REFINEMENT_IDEMPOTENCY_MAX_CHARS) {
    throw new ProductRefinementError("invalid_idempotency_key");
  }
  return key;
}

/** Броят уточнения е политика, не пожелание: точно едно включено. */
export function refinementRemaining(succeededCount: number): 0 | 1 {
  return succeededCount >= MAX_REFINEMENTS ? 0 : 1;
}

/**
 * Уточненият резултат минава ПЪЛНАТА валидация на v2 и допълнително се сверява
 * с оригинала: същият източник, същите поправки (без измислени нови) и точно
 * отчетено използвано уточнение.
 */
export function validateRefinedNegotiation(
  candidate: unknown,
  base: NegotiationPackageResult,
  binding: ProductSourceBinding,
  placeholders: readonly string[] = [],
): ReadyProductResult {
  const validated = readyProductResult(candidate, binding, "negotiation_package");
  if (!validated.ok) throw new ProductRefinementError("refined_invalid");
  const refined = validated.result as unknown as NegotiationPackageResult;

  if (
    refined.source.document_id !== base.source.document_id ||
    refined.source.source_hash.toLowerCase() !== base.source.source_hash.toLowerCase() ||
    refined.source.char_count !== base.source.char_count ||
    refined.source.char_unit !== base.source.char_unit ||
    refined.source.source_kind !== base.source.source_kind ||
    String(refined.source.source_updated_at) !== String(base.source.source_updated_at) ||
    (refined.source.page_count ?? null) !== (base.source.page_count ?? null)
  ) {
    throw new ProductRefinementError("refined_source_mismatch");
  }

  // Поправките остават същите места в същия документ: уточнението пише текст,
  // а не нови находки върху източника.
  const baseById = new Map(base.payload.corrections.map((c) => [c.id, c]));
  if (refined.payload.corrections.length !== base.payload.corrections.length) {
    throw new ProductRefinementError("refined_corrections_changed");
  }
  for (const correction of refined.payload.corrections) {
    const original = baseById.get(correction.id);
    if (
      !original ||
      original.mode !== correction.mode ||
      original.span.start !== correction.span.start ||
      original.span.end !== correction.span.end ||
      original.original_text !== correction.original_text
    ) {
      throw new ProductRefinementError("refined_corrections_changed");
    }
  }

  if (refined.payload.refinement.included !== 1 || refined.payload.refinement.used !== 1) {
    throw new ProductRefinementError("refined_refinement_meta");
  }

  if (placeholders.length > 0) {
    const serialized = JSON.stringify(refined);
    for (const placeholder of placeholders) {
      if (serialized.includes(placeholder)) {
        throw new ProductRefinementError("refined_placeholder_left");
      }
    }
  }
  return validated.result;
}
