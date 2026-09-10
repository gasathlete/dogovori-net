/**
 * СЪРВЪРНА конфигурация за политиката на изпълнение на еднократните продукти:
 * версия на политиката, цени на маршрутите и горни граници на разхода.
 *
 * Модулът е ЧИСТ: без Deno API, без мрежа, без база, без Stripe. Заради това
 * едни и същи числа могат да се проверят и преди плащане, и в задачата.
 *
 * ВАЖНО: тези числа са ВЪТРЕШНИ. Не влизат в клиентски интерфейс, в маркетинг,
 * в аналитика, в Stripe metadata и в лог със съдържание.
 */
import type { Classification } from "./classify.ts";
import { routeModel, type AIOperation, type RouteDecision } from "./model-router.ts";
import {
  PRODUCT_CHUNK_MAX_CHARS,
  PRODUCT_CHUNK_OVERLAP_CHARS,
} from "./product-source-chunks.ts";
import { PRODUCT_MAX_SOURCE_CHARS } from "./product-source.ts";
import type { ProductPurchaseId } from "./product-purchase.ts";

/**
 * Версия на политиката за изпълнение. Влиза в заявката и в задачата: повторен
 * опит не може ТИХО да смени политиката.
 */
export const PRODUCT_GENERATION_POLICY_VERSION = "2b1b1.1" as const;
export type ProductGenerationPolicyVersion = typeof PRODUCT_GENERATION_POLICY_VERSION;

/**
 * Мерна единица за вътрешния разход: „милисентове“ (1000 = 1 евроцент).
 * Цените са КОНФИГУРИРАНИ в тази единица. Няма курсово преобразуване.
 */
export const COST_UNIT = "milli_eurocents" as const;

/** Цена на 1000 токена, в милисентове. Непознат модел = отказ. */
export const MODEL_UNIT_COSTS: Readonly<
  Record<string, { readonly inputPer1kTokens: number; readonly outputPer1kTokens: number }>
> = Object.freeze({
  "google/gemini-2.5-flash-lite": Object.freeze({ inputPer1kTokens: 10, outputPer1kTokens: 40 }),
  "google/gemini-2.5-flash": Object.freeze({ inputPer1kTokens: 30, outputPer1kTokens: 250 }),
  "google/gemini-2.5-pro": Object.freeze({ inputPer1kTokens: 125, outputPer1kTokens: 1000 }),
});

/**
 * Консервативни допускания за токените. Български текст е „по-скъп“ на знак,
 * затова допускаме 400 токена на 1000 кодови точки (≈2,5 знака за токен).
 */
export const TOKENS_PER_1K_CHARS = 400;
/** Постоянни разходи за инструкции/схема на всяко извикване. */
export const PROMPT_OVERHEAD_TOKENS = 1200;
/** Максимални изходни токени на извикване (твърд предел на заявката). */
export const MAX_OUTPUT_TOKENS_PER_CALL = 4000;

/** Най-малкото ядро на част, което допускаме при изчисление на горна граница. */
export const MIN_CHUNK_CORE_CHARS = Math.floor(PRODUCT_CHUNK_MAX_CHARS / 2);
/** Твърди предели на обема — над тях се отказва (fail closed). */
export const MAX_CHUNKS = 30;
export const CHUNKS_PER_BATCH = 3;
export const MAX_BATCHES = 10;
export const MAX_MODEL_CALLS = 40;
export const MAX_TOTAL_TOKENS = 900_000;

/** Етапите, които консумират модел, по продукт. */
interface ProductPlan {
  /** Извиквания, независими от обема (паспорт, синтез, писма и т.н.). */
  readonly fixedCalls: readonly { readonly operation: AIOperation; readonly label: string }[];
  /** Етапи, които минават по партиди върху целия източник. */
  readonly batchedStages: readonly { readonly operation: AIOperation; readonly label: string }[];
  /** Отделно заделен бюджет за премиум уточнението (0 = няма). */
  readonly reservedRefinementCalls: number;
}

const PLANS: Readonly<Record<ProductPurchaseId, ProductPlan>> = Object.freeze({
  contract_check: Object.freeze({
    fixedCalls: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "passport" },
      { operation: "analyze-contract" as AIOperation, label: "synthesis" },
    ]),
    batchedStages: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "review" },
    ]),
    reservedRefinementCalls: 0,
  }),
  contract_improve: Object.freeze({
    fixedCalls: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "passport" },
      { operation: "analyze-contract" as AIOperation, label: "synthesis" },
    ]),
    batchedStages: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "review" },
      { operation: "apply-corrections" as AIOperation, label: "corrections" },
    ]),
    reservedRefinementCalls: 0,
  }),
  negotiation_package: Object.freeze({
    fixedCalls: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "passport" },
      { operation: "analyze-contract" as AIOperation, label: "synthesis" },
      { operation: "apply-corrections" as AIOperation, label: "negotiation" },
      { operation: "apply-corrections" as AIOperation, label: "messages" },
    ]),
    batchedStages: Object.freeze([
      { operation: "analyze-contract" as AIOperation, label: "review" },
      { operation: "apply-corrections" as AIOperation, label: "corrections" },
    ]),
    reservedRefinementCalls: 1,
  }),
});

/** Цели и твърди тавани на разхода за продукт, в милисентове. */
export const PRODUCT_COST_CEILINGS: Readonly<
  Record<ProductPurchaseId, { readonly target: number; readonly hard: number; readonly reservedRefinement: number }>
> = Object.freeze({
  contract_check: Object.freeze({ target: 20_000, hard: 45_000, reservedRefinement: 0 }),
  contract_improve: Object.freeze({ target: 28_000, hard: 60_000, reservedRefinement: 0 }),
  negotiation_package: Object.freeze({ target: 70_000, hard: 140_000, reservedRefinement: 30_000 }),
});

export type ProductBudgetProblem =
  | "unknown_model_price"
  | "source_too_long_for_budget"
  | "chunk_limit_exceeded"
  | "batch_limit_exceeded"
  | "call_limit_exceeded"
  | "token_limit_exceeded"
  | "budget_exceeded";

export class ProductBudgetError extends Error {
  readonly reason: ProductBudgetProblem;
  constructor(reason: ProductBudgetProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductBudgetError";
  }
}

export interface ProductCostBounds {
  readonly policyVersion: ProductGenerationPolicyVersion;
  readonly costUnit: typeof COST_UNIT;
  readonly charCount: number;
  readonly maxChunks: number;
  readonly maxBatches: number;
  /** Включва по едно поправящо извикване на партида и заделеното уточнение. */
  readonly maxModelCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxCostMilliCents: number;
  readonly reservedRefinementCostMilliCents: number;
  readonly targetCostMilliCents: number;
  readonly hardCostMilliCents: number;
  readonly withinTarget: boolean;
  /** Най-скъпият допустим модел по маршрута — тук се смята най-лошият случай. */
  readonly worstModel: string;
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

function unitCost(model: string) {
  const price = MODEL_UNIT_COSTS[model];
  if (!price) throw new ProductBudgetError("unknown_model_price");
  return price;
}

/** Най-скъпият модел, който политиката РАЗРЕШАВА за този етап. */
function worstAllowedModel(decision: RouteDecision): string {
  const candidates = [decision.model, ...(decision.allowFallback ? decision.fallbackChain : [])]
    .filter((m) => typeof m === "string" && m.length > 0);
  if (candidates.length === 0) throw new ProductBudgetError("unknown_model_price");
  let worst = candidates[0];
  let worstPrice = -1;
  for (const model of candidates) {
    const price = unitCost(model);
    const combined = price.inputPer1kTokens + price.outputPer1kTokens;
    if (combined > worstPrice) {
      worstPrice = combined;
      worst = model;
    }
  }
  return worst;
}

/**
 * Консервативна ГОРНА граница за части, партиди, извиквания и цена — само от
 * продукта, точната канонична дължина на източника и прегледаните лимити на
 * разделянето. Изчислението е целочислено и се проваля затворено.
 */
export function computeProductCostBounds(
  productId: ProductPurchaseId,
  charCount: number,
  classification: Classification,
): ProductCostBounds {
  if (!Number.isSafeInteger(charCount) || charCount <= 0) {
    throw new ProductBudgetError("source_too_long_for_budget");
  }
  if (charCount > PRODUCT_MAX_SOURCE_CHARS) {
    throw new ProductBudgetError("source_too_long_for_budget");
  }
  const plan = PLANS[productId];
  const ceilings = PRODUCT_COST_CEILINGS[productId];

  const maxChunks = ceilDiv(charCount, MIN_CHUNK_CORE_CHARS);
  if (maxChunks > MAX_CHUNKS) throw new ProductBudgetError("chunk_limit_exceeded");
  const maxBatches = ceilDiv(maxChunks, CHUNKS_PER_BATCH);
  if (maxBatches > MAX_BATCHES) throw new ProductBudgetError("batch_limit_exceeded");

  // Най-много едно поправящо извикване (evidence repair) на пропаднала партида.
  const repairCalls = maxBatches;
  const batchedCallsPerStage = maxBatches;
  const batchedCalls = plan.batchedStages.length * batchedCallsPerStage;
  const maxModelCalls =
    plan.fixedCalls.length + batchedCalls + repairCalls + plan.reservedRefinementCalls;
  if (maxModelCalls > MAX_MODEL_CALLS) throw new ProductBudgetError("call_limit_exceeded");

  // Входът: целият източник плюс застъпването на всяка част, за всеки етап по
  // партиди; фиксираните извиквания получават целия източник веднъж.
  const overlapChars = PRODUCT_CHUNK_OVERLAP_CHARS * Math.max(0, maxChunks - 1);
  const sourceTokens = ceilDiv((charCount + overlapChars) * TOKENS_PER_1K_CHARS, 1000);
  const perCallOverhead = PROMPT_OVERHEAD_TOKENS;

  const stagePasses = plan.batchedStages.length + plan.fixedCalls.length + plan.reservedRefinementCalls;
  const maxInputTokens = sourceTokens * stagePasses + perCallOverhead * maxModelCalls;
  const maxOutputTokens = MAX_OUTPUT_TOKENS_PER_CALL * maxModelCalls;
  const maxTotalTokens = maxInputTokens + maxOutputTokens;
  if (maxTotalTokens > MAX_TOTAL_TOKENS) throw new ProductBudgetError("token_limit_exceeded");

  // Най-лошият допустим маршрут за всеки етап; цената се смята по него.
  const operations = new Set<AIOperation>([
    ...plan.fixedCalls.map((c) => c.operation),
    ...plan.batchedStages.map((c) => c.operation),
  ]);
  let worstModel = "";
  let worstCombined = -1;
  for (const operation of operations) {
    // Съгласието за AI е дадено изрично в заявката — то е потвърждението.
    const decision = routeModel(operation, classification, {
      userConfirmed: true,
      promptLength: charCount,
    });
    if (!decision.allowed) throw new ProductBudgetError("budget_exceeded");
    const model = worstAllowedModel(decision);
    const price = unitCost(model);
    const combined = price.inputPer1kTokens + price.outputPer1kTokens;
    if (combined > worstCombined) {
      worstCombined = combined;
      worstModel = model;
    }
  }
  const price = unitCost(worstModel);
  const maxCostMilliCents =
    ceilDiv(maxInputTokens * price.inputPer1kTokens, 1000) +
    ceilDiv(maxOutputTokens * price.outputPer1kTokens, 1000);
  const reserved = ceilings.reservedRefinement;
  if (maxCostMilliCents + reserved > ceilings.hard) {
    throw new ProductBudgetError("budget_exceeded");
  }

  return {
    policyVersion: PRODUCT_GENERATION_POLICY_VERSION,
    costUnit: COST_UNIT,
    charCount,
    maxChunks,
    maxBatches,
    maxModelCalls,
    maxInputTokens,
    maxOutputTokens,
    maxTotalTokens,
    maxCostMilliCents,
    reservedRefinementCostMilliCents: reserved,
    targetCostMilliCents: ceilings.target,
    hardCostMilliCents: ceilings.hard,
    withinTarget: maxCostMilliCents + reserved <= ceilings.target,
    worstModel,
  };
}
