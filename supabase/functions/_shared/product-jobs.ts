/**
 * Състоянието на една платена продуктова задача: етапи, детерминистичен курсор,
 * наем (lease) и границата към генерацията.
 *
 * Модулът е чист: типове и решения, без база и без модел. В този етап
 * адаптерът за генерация е НАРОЧНО недостъпен — Stage 2B1B2 го реализира.
 */
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import type { ProductCostBounds } from "./product-generation-policy.ts";
import type { ProductPurchaseId } from "./product-purchase.ts";
import type { ProductResult } from "./product-result-contract.ts";
import type { ProductSourceBinding } from "./product-result-contract.ts";

/** Затворен списък на етапите. Нищо извън него не е валидно състояние. */
export const PRODUCT_JOB_STAGES = Object.freeze([
  "queued",
  "awaiting_generation",
  "passport",
  "review",
  "corrections",
  "negotiation",
  "messages",
  "synthesis",
  "completed",
  "failed",
] as const);
export type ProductJobStage = (typeof PRODUCT_JOB_STAGES)[number];

export const TERMINAL_JOB_STAGES: readonly ProductJobStage[] = Object.freeze([
  "completed",
  "failed",
]);

/** Наемът е кратък: изоставена задача се възстановява, без да се дублира. */
export const PRODUCT_JOB_LEASE_SECONDS = 600;
export const PRODUCT_JOB_MAX_ATTEMPTS = 20;

export type ProductJobErrorClass = "retryable" | "permanent";

export interface ProductJobCursor {
  readonly stage: ProductJobStage;
  /** Индекс на следващата партида в етапа. Никога не намалява. */
  readonly batch_index: number;
  /** Индекс на следващата част в източника. Никога не намалява. */
  readonly chunk_index: number;
}

export const INITIAL_CURSOR: ProductJobCursor = Object.freeze({
  stage: "queued",
  batch_index: 0,
  chunk_index: 0,
});

export function isProductJobStage(raw: unknown): raw is ProductJobStage {
  return typeof raw === "string" && (PRODUCT_JOB_STAGES as readonly string[]).includes(raw);
}

/** Приема курсор от базата и се проваля затворено при повреден запис. */
export function parseJobCursor(raw: unknown): ProductJobCursor | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (!isProductJobStage(src.stage)) return null;
  const batch = src.batch_index;
  const chunk = src.chunk_index;
  if (!Number.isSafeInteger(batch) || (batch as number) < 0) return null;
  if (!Number.isSafeInteger(chunk) || (chunk as number) < 0) return null;
  return { stage: src.stage, batch_index: batch as number, chunk_index: chunk as number };
}

const STAGE_ORDER: Readonly<Record<ProductJobStage, number>> = Object.freeze({
  queued: 0,
  awaiting_generation: 1,
  passport: 2,
  review: 3,
  corrections: 4,
  negotiation: 5,
  messages: 6,
  synthesis: 7,
  completed: 8,
  failed: 8,
});

/** Курсорът може само да напредва: същият завършен етап не се повтаря. */
export function cursorAdvances(prev: ProductJobCursor, next: ProductJobCursor): boolean {
  const prevRank = STAGE_ORDER[prev.stage];
  const nextRank = STAGE_ORDER[next.stage];
  if (nextRank > prevRank) return true;
  if (nextRank < prevRank) return false;
  if (next.batch_index > prev.batch_index) return true;
  if (next.batch_index < prev.batch_index) return false;
  return next.chunk_index > prev.chunk_index;
}

/** Стабилен ключ на една стъпка — една завършена стъпка не се записва два пъти. */
export function cursorKey(cursor: ProductJobCursor): string {
  return `${cursor.stage}:${cursor.batch_index}:${cursor.chunk_index}`;
}

/**
 * Ключ за идемпотентност на заявяването. Повторен опит със СЪЩИЯ курсор и
 * същата политика дава същия ключ.
 */
export function jobIdempotencyKey(
  entitlementId: string,
  cursor: ProductJobCursor,
  policyVersion: string = PRODUCT_GENERATION_POLICY_VERSION,
): string {
  return `${entitlementId}:${policyVersion}:${cursorKey(cursor)}`;
}

export function isLeaseActive(
  leaseExpiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!leaseExpiresAt) return false;
  const expires = Date.parse(leaseExpiresAt);
  if (!Number.isFinite(expires)) return false;
  return expires > now.getTime();
}

export function isLeaseStale(
  leaseExpiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return !isLeaseActive(leaseExpiresAt, now);
}

/** Съдържанието НЕ влиза тук: само брой извиквания и токени. */
export interface ProductJobUsage {
  readonly calls: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_milli_cents: number;
}

export const ZERO_USAGE: ProductJobUsage = Object.freeze({
  calls: 0,
  input_tokens: 0,
  output_tokens: 0,
  cost_milli_cents: 0,
});

/** Проверява, че натрупаният разход остава в изчислените граници. */
export function usageWithinBounds(usage: ProductJobUsage, bounds: ProductCostBounds): boolean {
  return (
    usage.calls <= bounds.maxModelCalls &&
    usage.input_tokens + usage.output_tokens <= bounds.maxTotalTokens &&
    usage.cost_milli_cents <= bounds.hardCostMilliCents
  );
}

/** Входът за една ОГРАНИЧЕНА стъпка на генерацията. */
export interface ProductGenerationStep {
  readonly productId: ProductPurchaseId;
  readonly binding: ProductSourceBinding;
  readonly cursor: ProductJobCursor;
  readonly bounds: ProductCostBounds;
}

export interface ProductGenerationStepResult {
  readonly nextCursor: ProductJobCursor;
  readonly usage: ProductJobUsage;
  /** Пълен резултат само когато етапът е приключил целия продукт. */
  readonly result?: ProductResult;
}

/**
 * Типизираната граница, която Stage 2B1B2 ще реализира. Тук НЯМА реализация:
 * задачата записва контролна точка `awaiting_generation` и връща „обработва се“.
 */
export interface ProductGenerationAdapter {
  readonly policyVersion: string;
  runStep(step: ProductGenerationStep): Promise<ProductGenerationStepResult>;
}

/** В този етап адаптер НЯМА. Никога не връща подставен/частичен резултат. */
export function resolveProductGenerationAdapter(): ProductGenerationAdapter | null {
  return null;
}

export const AWAITING_GENERATION_CURSOR: ProductJobCursor = Object.freeze({
  stage: "awaiting_generation",
  batch_index: 0,
  chunk_index: 0,
});
