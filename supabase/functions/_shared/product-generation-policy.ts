/**
 * СЪРВЪРНА политика за изпълнение на еднократните продукти: версия, собствен
 * маршрут на модели, датирана таблица с цени и ГОРНИ граници на разхода.
 *
 * Модулът е ЧИСТ: без Deno API, без мрежа, без база, без Stripe, без поща.
 * Затова едни и същи числа се проверяват и преди плащане, и в задачата.
 *
 * ВАЖНО: числата тук са ВЪТРЕШНИ. Не влизат в клиентски интерфейс, маркетинг,
 * аналитика, Stripe metadata или лог със съдържание.
 *
 * ГРАНИЦА ЗА МАРЖА (release gate): числата по-долу са ТЕХНИЧЕСКА горна граница
 * на разхода към доставчика в micro-USD. Маржът в евро — с ДДС, курс и такси на
 * платежния доставчик — се преглежда ОТДЕЛНО преди включване на изпълнението.
 * Тук НЯМА измислен курс и НЯМА преобразуване между валути.
 */
import type { Classification } from "./classify.ts";
import {
  PRODUCT_CONTEXT_MAX_LENGTHS,
  PRODUCT_CONTEXT_MAX_POSITION_CHARS,
} from "./product-intake-context.ts";
import {
  PRODUCT_CHUNK_MAX_CHARS,
  PRODUCT_CHUNK_OVERLAP_CHARS,
} from "./product-source-chunks.ts";
import { PRODUCT_MAX_SOURCE_CHARS } from "./product-source.ts";
import type { ProductPurchaseId } from "./product-purchase.ts";

/**
 * Версия на политиката за изпълнение. Влиза И в заявката, И в правото: повторен
 * опит не може ТИХО да смени маршрута, единицата или границите.
 */
export const PRODUCT_GENERATION_POLICY_VERSION = "2b1b1.3" as const;
export type ProductGenerationPolicyVersion = typeof PRODUCT_GENERATION_POLICY_VERSION;

/** Мерна единица за вътрешния разход: micro-USD (1 000 000 = 1 USD). */
export const COST_UNIT = "micro_usd" as const;
export const MICRO_USD_PER_USD = 1_000_000;

/**
 * Собствен маршрут на ПЛАТЕНИЯ продукт. Само поддържани модели на Lovable —
 * серията Gemini 2.5 е обявена за отпадаща за нови функции и НЕ се ползва тук.
 * Общото маршрутизиране на старите операции (model-router.ts) не се променя.
 */
export const PRODUCT_MODEL_FLASH_LITE = "google/gemini-3.1-flash-lite" as const;
export const PRODUCT_MODEL_FLASH = "google/gemini-3.8-flash" as const;

export const PRODUCT_ALLOWED_MODELS: readonly string[] = Object.freeze([
  PRODUCT_MODEL_FLASH_LITE,
  PRODUCT_MODEL_FLASH,
]);

/**
 * Датирана таблица с цени в ЦЕЛИ micro-USD за 1 000 000 токена.
 *
 * Основание (публични стандартни цени, към PRICE_TABLE_DATE):
 * - Gemini 3.1 Flash Lite: USD 0,25 вход / USD 1,50 изход за 1M токена.
 * - Gemini 3.8 Flash: промоционално USD 0,75 / USD 3,75 до 2026-12-31, след
 *   това USD 1,50 / USD 7,50. Бюджетът се смята по ПО-ВИСОКИТЕ цени след
 *   промоцията, за да остане границата консервативна и след 31.12.2026.
 */
export const PRICE_TABLE_VERSION = "2026-09-11-provider-standard" as const;
export const PRICE_TABLE_DATE = "2026-09-11" as const;

export interface ModelPrice {
  readonly inputMicroUsdPer1MTokens: number;
  readonly outputMicroUsdPer1MTokens: number;
  readonly basis: string;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = Object.freeze({
  [PRODUCT_MODEL_FLASH_LITE]: Object.freeze({
    inputMicroUsdPer1MTokens: 250_000,
    outputMicroUsdPer1MTokens: 1_500_000,
    basis: "standard USD 0.25 / 1.50 per 1M tokens",
  }),
  [PRODUCT_MODEL_FLASH]: Object.freeze({
    inputMicroUsdPer1MTokens: 1_500_000,
    outputMicroUsdPer1MTokens: 7_500_000,
    basis: "post-promotion USD 1.50 / 7.50 per 1M tokens (promo 0.75/3.75 until 2026-12-31)",
  }),
});

/**
 * ИСТИНСКА горна граница за входа: най-много 4 UTF-8 байта на кодова точка и
 * най-много 1 токен на байт. Това е граница за БЕЗОПАСНОСТ, а не прогноза.
 */
export const INPUT_TOKENS_PER_CODE_POINT = 4;
/** JSON ключове, кавички, запетаи и разделители около максималния контекст. */
export const CONTEXT_SERIALIZATION_OVERHEAD_TOKENS = 512;
/**
 * Изведен, а не ръчно предположен максимум: всички разрешени полета по техните
 * експортирани граници, максимумът на позицията и явен JSON overhead.
 */
export const MAX_CONTEXT_CODE_POINTS =
  Object.values(PRODUCT_CONTEXT_MAX_LENGTHS).reduce((sum, value) => sum + value, 0) +
  PRODUCT_CONTEXT_MAX_POSITION_CHARS;
export const MAX_CONTEXT_TOKENS =
  MAX_CONTEXT_CODE_POINTS * INPUT_TOKENS_PER_CODE_POINT +
  CONTEXT_SERIALIZATION_OVERHEAD_TOKENS;
/** Инструкции, схема и разделители на ВСЯКО извикване. */
export const PROMPT_SCHEMA_OVERHEAD_TOKENS = 2_500;
/** Допълнителни инструкции/схема при поправка на невалиден моделeн отговор. */
export const REPAIR_PROMPT_SCHEMA_OVERHEAD_TOKENS = 2_500;

/** Твърди изходни предели по вид извикване. */
export const OUTPUT_TOKENS_PASSPORT = 2_000;
export const OUTPUT_TOKENS_BATCH = 4_000;
export const OUTPUT_TOKENS_REPAIR = 4_000;
export const OUTPUT_TOKENS_LETTER = 4_000;
export const OUTPUT_TOKENS_SYNTHESIS = 6_000;
export const OUTPUT_TOKENS_REFINEMENT = 4_000;

/** Най-малкото ядро на част, което допускаме при изчисление на горна граница. */
export const MIN_CHUNK_CORE_CHARS = Math.floor(PRODUCT_CHUNK_MAX_CHARS / 2);
/** Твърди предели на обема — над тях се отказва (fail closed). */
export const MAX_CHUNKS = 30;
export const CHUNKS_PER_BATCH = 3;
export const MAX_BATCHES = 10;
export const MAX_MODEL_CALLS = 60;
export const MAX_TOTAL_TOKENS = 6_000_000;

export type ProductStageId =
  | "passport"
  | "review"
  | "review_repair"
  | "corrections"
  | "corrections_repair"
  | "negotiation"
  | "messages"
  | "synthesis"
  | "refinement";

interface BatchedStageDef {
  readonly stage: Extract<ProductStageId, "review" | "corrections">;
  readonly repairStage: Extract<ProductStageId, "review_repair" | "corrections_repair">;
  /** Изход от предходни етапи, който се подава на ВСЯКА партида. */
  readonly carryTokensPerBatch: number;
}

interface ProductPlanDef {
  readonly batched: readonly BatchedStageDef[];
  /** Извиквания върху натрупания изход (не върху целия източник). */
  readonly aggregate: readonly {
    readonly stage: Extract<ProductStageId, "negotiation" | "messages" | "synthesis">;
    readonly outputTokens: number;
  }[];
  /** Заделено премиум уточнение: истински извиквания и токени, не само пари. */
  readonly reservedRefinementCalls: number;
}

const REVIEW_STAGE: BatchedStageDef = {
  stage: "review",
  repairStage: "review_repair",
  carryTokensPerBatch: OUTPUT_TOKENS_PASSPORT,
};

const CORRECTIONS_STAGE: BatchedStageDef = {
  stage: "corrections",
  repairStage: "corrections_repair",
  carryTokensPerBatch: OUTPUT_TOKENS_PASSPORT + OUTPUT_TOKENS_BATCH + OUTPUT_TOKENS_REPAIR,
};

const PLANS: Readonly<Record<ProductPurchaseId, ProductPlanDef>> = Object.freeze({
  contract_check: Object.freeze({
    batched: Object.freeze([REVIEW_STAGE]),
    aggregate: Object.freeze([{ stage: "synthesis" as const, outputTokens: OUTPUT_TOKENS_SYNTHESIS }]),
    reservedRefinementCalls: 0,
  }),
  contract_improve: Object.freeze({
    batched: Object.freeze([REVIEW_STAGE, CORRECTIONS_STAGE]),
    aggregate: Object.freeze([{ stage: "synthesis" as const, outputTokens: OUTPUT_TOKENS_SYNTHESIS }]),
    reservedRefinementCalls: 0,
  }),
  negotiation_package: Object.freeze({
    batched: Object.freeze([REVIEW_STAGE, CORRECTIONS_STAGE]),
    aggregate: Object.freeze([
      { stage: "negotiation" as const, outputTokens: OUTPUT_TOKENS_LETTER },
      { stage: "messages" as const, outputTokens: OUTPUT_TOKENS_LETTER },
      { stage: "synthesis" as const, outputTokens: OUTPUT_TOKENS_SYNTHESIS },
    ]),
    reservedRefinementCalls: 1,
  }),
});

/**
 * Модел по етап. Сървърно решение — браузърът НИКОГА не избира модел.
 * Обемните структурни етапи и поправките им са Flash Lite. Flash е запазен за
 * ограничените финални/преговорни/съобщителни стъпки и уточнението.
 */
const STAGE_MODEL: Readonly<Record<ProductStageId, string>> = Object.freeze({
  passport: PRODUCT_MODEL_FLASH_LITE,
  review: PRODUCT_MODEL_FLASH_LITE,
  review_repair: PRODUCT_MODEL_FLASH_LITE,
  corrections: PRODUCT_MODEL_FLASH_LITE,
  corrections_repair: PRODUCT_MODEL_FLASH_LITE,
  negotiation: PRODUCT_MODEL_FLASH,
  messages: PRODUCT_MODEL_FLASH,
  synthesis: PRODUCT_MODEL_FLASH,
  refinement: PRODUCT_MODEL_FLASH,
});

/** Прегледани цели и ТВЪРДИ тавани на разхода за продукт, в micro-USD. */
export const PRODUCT_COST_CEILINGS: Readonly<
  Record<ProductPurchaseId, { readonly target: number; readonly hard: number }>
> = Object.freeze({
  contract_check: Object.freeze({ target: 1_500_000, hard: 3_000_000 }),
  contract_improve: Object.freeze({ target: 2_500_000, hard: 5_000_000 }),
  negotiation_package: Object.freeze({ target: 3_200_000, hard: 6_500_000 }),
});

export type ProductBudgetProblem =
  | "unknown_model_price"
  | "source_too_long_for_budget"
  | "chunk_limit_exceeded"
  | "batch_limit_exceeded"
  | "call_limit_exceeded"
  | "token_limit_exceeded"
  | "classification_not_allowed"
  | "arithmetic_unsafe"
  | "budget_exceeded";

export class ProductBudgetError extends Error {
  readonly reason: ProductBudgetProblem;
  constructor(reason: ProductBudgetProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductBudgetError";
  }
}

/** Точен план на едно извикване — 2B1B2 адаптерът е ОБВЪРЗАН с тези тавани. */
export interface ProductStageCallBound {
  readonly stage: ProductStageId;
  readonly model: string;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxCostMicroUsd: number;
  readonly reserved: boolean;
  /** Адаптерът няма право на модел, докато тези условия не са изпълнени. */
  readonly redactionRequired: boolean;
  readonly postRedactionReclassificationRequired: boolean;
  readonly userConfirmationRequired: boolean;
  readonly modelCallAllowed: boolean;
}

export interface ProductCostBounds {
  readonly policyVersion: ProductGenerationPolicyVersion;
  readonly costUnit: typeof COST_UNIT;
  readonly priceTableVersion: typeof PRICE_TABLE_VERSION;
  readonly priceTableDate: typeof PRICE_TABLE_DATE;
  readonly charCount: number;
  readonly maxChunks: number;
  readonly maxBatches: number;
  readonly baseModelCalls: number;
  readonly repairModelCalls: number;
  readonly reservedRefinementCalls: number;
  readonly maxModelCalls: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxTotalTokens: number;
  readonly maxCostMicroUsd: number;
  readonly reservedRefinementInputTokens: number;
  readonly reservedRefinementOutputTokens: number;
  readonly reservedRefinementCostMicroUsd: number;
  readonly targetCostMicroUsd: number;
  readonly hardCostMicroUsd: number;
  readonly withinTarget: boolean;
  /** Най-скъпият модел, който планът реално ползва. */
  readonly worstModel: string;
  readonly redactionRequired: boolean;
  readonly postRedactionReclassificationRequired: boolean;
  readonly userConfirmationRequired: boolean;
  readonly modelCallAllowed: boolean;
  /** Точните тавани по извикване, които изпълнението трябва да спазва. */
  readonly calls: readonly ProductStageCallBound[];
}

function ceilDiv(a: number, b: number): number {
  return Math.ceil(a / b);
}

function safe(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new ProductBudgetError("arithmetic_unsafe");
  return n;
}

export function modelPrice(model: string): ModelPrice {
  const price = MODEL_PRICES[model];
  if (!price || !PRODUCT_ALLOWED_MODELS.includes(model)) {
    throw new ProductBudgetError("unknown_model_price");
  }
  return price;
}

function callCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = modelPrice(model);
  return safe(
    ceilDiv(inputTokens * price.inputMicroUsdPer1MTokens, 1_000_000) +
      ceilDiv(outputTokens * price.outputMicroUsdPer1MTokens, 1_000_000),
  );
}

/**
 * Консервативна ГОРНА граница за части, партиди, извиквания, токени и цена —
 * само от продукта, точната канонична дължина на източника и прегледаните
 * лимити на разделянето. Целочислено, проваля се затворено.
 */
export function computeProductCostBounds(
  productId: ProductPurchaseId,
  charCount: number,
  classification: Classification,
  opts: { readonly expectedPolicyVersion?: string } = {},
): ProductCostBounds {
  if (opts.expectedPolicyVersion && opts.expectedPolicyVersion !== PRODUCT_GENERATION_POLICY_VERSION) {
    throw new ProductBudgetError("budget_exceeded");
  }
  if (!Number.isSafeInteger(charCount) || charCount <= 0) {
    throw new ProductBudgetError("source_too_long_for_budget");
  }
  if (charCount > PRODUCT_MAX_SOURCE_CHARS) {
    throw new ProductBudgetError("source_too_long_for_budget");
  }
  if (classification.risk_level === "blocked") {
    throw new ProductBudgetError("classification_not_allowed");
  }
  const plan = PLANS[productId];
  if (!plan) throw new ProductBudgetError("budget_exceeded");
  const ceilings = PRODUCT_COST_CEILINGS[productId];

  const maxChunks = ceilDiv(charCount, MIN_CHUNK_CORE_CHARS);
  if (maxChunks > MAX_CHUNKS) throw new ProductBudgetError("chunk_limit_exceeded");
  const maxBatches = ceilDiv(maxChunks, CHUNKS_PER_BATCH);
  if (maxBatches > MAX_BATCHES) throw new ProductBudgetError("batch_limit_exceeded");

  // Целият източник плюс ТОЧНОТО застъпване на частите.
  const overlapChars = PRODUCT_CHUNK_OVERLAP_CHARS * Math.max(0, maxChunks - 1);
  const sourceTokens = safe((charCount + overlapChars) * INPUT_TOKENS_PER_CODE_POINT);
  // Една партида може да съдържа максималния брой максимално дълги части.
  // Не осредняваме целия документ между партидите: това би подценило отделно
  // извикване при неравномерни реални части.
  const maxChunkContextChars = PRODUCT_CHUNK_MAX_CHARS + PRODUCT_CHUNK_OVERLAP_CHARS;
  const maxChunksInBatch = Math.min(CHUNKS_PER_BATCH, maxChunks);
  const batchSourceTokens = safe(
    maxChunksInBatch * maxChunkContextChars * INPUT_TOKENS_PER_CODE_POINT,
  );
  const perCallFixed = MAX_CONTEXT_TOKENS + PROMPT_SCHEMA_OVERHEAD_TOKENS;
  const redactionRequired = classification.redaction_required;
  const postRedactionReclassificationRequired = redactionRequired;
  const userConfirmationRequired = classification.user_confirmation_required;
  // 2B1B1 не реализира редакция. Бъдещият адаптер трябва първо да докаже
  // редакция и повторна класификация; типизираният договор започва затворен.
  const modelCallAllowed = !redactionRequired && !userConfirmationRequired;

  const calls: ProductStageCallBound[] = [];
  const push = (stage: ProductStageId, inputTokens: number, outputTokens: number, reserved = false) => {
    const model = STAGE_MODEL[stage];
    calls.push({
      stage,
      model,
      maxInputTokens: safe(inputTokens),
      maxOutputTokens: safe(outputTokens),
      maxCostMicroUsd: callCost(model, inputTokens, outputTokens),
      reserved,
      redactionRequired,
      postRedactionReclassificationRequired,
      userConfirmationRequired,
      modelCallAllowed,
    });
  };

  // 1) Паспорт на документа — целият източник веднъж.
  push("passport", sourceTokens + perCallFixed, OUTPUT_TOKENS_PASSPORT);
  let accumulatedOutputs = OUTPUT_TOKENS_PASSPORT;

  // 2) Етапи по партиди. По ЕДНО поправящо извикване на пропаднала партида,
  //    за ВСЕКИ етап поотделно (не общ набор поправки).
  for (const stageDef of plan.batched) {
    for (let batch = 0; batch < maxBatches; batch++) {
      const batchInput = batchSourceTokens + perCallFixed + stageDef.carryTokensPerBatch;
      push(stageDef.stage, batchInput, OUTPUT_TOKENS_BATCH);
      // Поправката вижда същата партида ПЛЮС отговора, който е бил отхвърлен.
      push(
        stageDef.repairStage,
        batchInput + OUTPUT_TOKENS_BATCH + REPAIR_PROMPT_SCHEMA_OVERHEAD_TOKENS,
        OUTPUT_TOKENS_REPAIR,
      );
      accumulatedOutputs = safe(accumulatedOutputs + OUTPUT_TOKENS_BATCH + OUTPUT_TOKENS_REPAIR);
    }
  }

  // 3) Обобщаващи извиквания — вход е натрупаният изход, не източникът.
  for (const agg of plan.aggregate) {
    push(agg.stage, perCallFixed + accumulatedOutputs, agg.outputTokens);
    accumulatedOutputs = safe(accumulatedOutputs + agg.outputTokens);
  }

  // 4) Заделеното премиум уточнение — истински токени и извиквания.
  for (let i = 0; i < plan.reservedRefinementCalls; i++) {
    push("refinement", perCallFixed + accumulatedOutputs, OUTPUT_TOKENS_REFINEMENT, true);
    accumulatedOutputs = safe(accumulatedOutputs + OUTPUT_TOKENS_REFINEMENT);
  }

  const repairModelCalls = calls.filter((c) => c.stage.endsWith("_repair")).length;
  const reservedCalls = calls.filter((c) => c.reserved);
  const baseModelCalls = calls.length - repairModelCalls - reservedCalls.length;
  if (calls.length > MAX_MODEL_CALLS) throw new ProductBudgetError("call_limit_exceeded");

  let maxInputTokens = 0;
  let maxOutputTokens = 0;
  let maxCostMicroUsd = 0;
  let worstModel: string = PRODUCT_MODEL_FLASH_LITE;
  let worstCombined = -1;
  for (const call of calls) {
    maxInputTokens = safe(maxInputTokens + call.maxInputTokens);
    maxOutputTokens = safe(maxOutputTokens + call.maxOutputTokens);
    maxCostMicroUsd = safe(maxCostMicroUsd + call.maxCostMicroUsd);
    const price = modelPrice(call.model);
    const combined = price.inputMicroUsdPer1MTokens + price.outputMicroUsdPer1MTokens;
    if (combined > worstCombined) {
      worstCombined = combined;
      worstModel = call.model;
    }
  }
  const maxTotalTokens = safe(maxInputTokens + maxOutputTokens);
  if (maxTotalTokens > MAX_TOTAL_TOKENS) throw new ProductBudgetError("token_limit_exceeded");
  if (maxCostMicroUsd > ceilings.hard) throw new ProductBudgetError("budget_exceeded");

  const reservedRefinementInputTokens = reservedCalls.reduce((a, c) => a + c.maxInputTokens, 0);
  const reservedRefinementOutputTokens = reservedCalls.reduce((a, c) => a + c.maxOutputTokens, 0);
  const reservedRefinementCostMicroUsd = reservedCalls.reduce((a, c) => a + c.maxCostMicroUsd, 0);

  return {
    policyVersion: PRODUCT_GENERATION_POLICY_VERSION,
    costUnit: COST_UNIT,
    priceTableVersion: PRICE_TABLE_VERSION,
    priceTableDate: PRICE_TABLE_DATE,
    charCount,
    maxChunks,
    maxBatches,
    baseModelCalls,
    repairModelCalls,
    reservedRefinementCalls: reservedCalls.length,
    maxModelCalls: calls.length,
    maxInputTokens,
    maxOutputTokens,
    maxTotalTokens,
    maxCostMicroUsd,
    reservedRefinementInputTokens,
    reservedRefinementOutputTokens,
    reservedRefinementCostMicroUsd,
    targetCostMicroUsd: ceilings.target,
    hardCostMicroUsd: ceilings.hard,
    withinTarget: maxCostMicroUsd <= ceilings.target,
    worstModel,
    redactionRequired,
    postRedactionReclassificationRequired,
    userConfirmationRequired,
    modelCallAllowed,
    calls: Object.freeze(calls),
  };
}
