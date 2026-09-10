/**
 * ЕДИНСТВЕНАТА детерминистична проверка „можем ли да продадем и обработим точно
 * този източник с точно този продукт?“.
 *
 * Ползва се и от `create-product-checkout` ПРЕДИ да се създаде или преизползва
 * платима Stripe сесия, и от `fulfill-product` преди да се заяви задача. Няма
 * мрежа, няма модел, няма база: същите входове дават същия изход.
 */
import { classifyDocumentBeforeAI, type Classification } from "./classify.ts";
import { detectIllegalContent } from "./illegal-content.ts";
import {
  PRODUCT_GENERATION_POLICY_VERSION,
  ProductBudgetError,
  computeProductCostBounds,
  type ProductCostBounds,
} from "./product-generation-policy.ts";
import { requireStoredProductContext, type ProductContext } from "./product-intake-context.ts";
import { ProductContextError } from "./product-intake-context.ts";
import type { ProductPurchaseId } from "./product-purchase.ts";
import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_MIN_SOURCE_CHARS,
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
  type ProductSourceKind,
} from "./product-source.ts";

export type EligibilityCode =
  | "unsupported_product"
  | "source_not_usable"
  | "source_too_long"
  | "content_not_allowed"
  | "processing_not_allowed"
  | "context_incomplete"
  | "capacity_exceeded"
  | "policy_changed";

/** Кратки, човешки причини на български. Без технически подробности. */
const MESSAGES: Readonly<Record<EligibilityCode, string>> = Object.freeze({
  unsupported_product: "Този продукт не е достъпен.",
  source_not_usable:
    "Не можем да прочетем целия документ. Приемаме PDF с четим текст или DOCX файл.",
  source_too_long: `Документът е по-дълъг от ${PRODUCT_MAX_SOURCE_CHARS} знака. Изпратете по-кратък документ или отделна част.`,
  content_not_allowed: "Не обработваме документи с такова съдържание.",
  processing_not_allowed:
    "Документът съдържа особено чувствителни данни и не можем да го обработим с този продукт.",
  context_incomplete: "Моля, попълнете данните за Вашата роля и целта, преди да продължите.",
  capacity_exceeded:
    "Документът е твърде обемен за този продукт. Изпратете отделна част от него.",
  policy_changed:
    "Правилата за обработка са обновени. Започнете отначало, за да е ясно какво получавате.",
});

export function eligibilityMessage(code: EligibilityCode): string {
  return MESSAGES[code];
}

export interface EligibilitySource {
  readonly text: string;
  readonly charCount: number;
  readonly charUnit: typeof PRODUCT_SOURCE_CHAR_UNIT;
  readonly sourceKind: ProductSourceKind;
  readonly extractionStatus: "full" | "partial";
}

export interface EligibilityInput {
  readonly productId: ProductPurchaseId;
  readonly source: EligibilitySource;
  readonly context: unknown;
  /** Подава се само при повторна проверка (задача/повторен checkout). */
  readonly expectedPolicyVersion?: string | null;
}

export interface EligibilityPolicy {
  readonly version: typeof PRODUCT_GENERATION_POLICY_VERSION;
  readonly riskLevel: Classification["risk_level"];
  readonly containsPersonalData: boolean;
  readonly containsSpecialCategoryData: boolean;
  readonly redactionRequired: boolean;
  readonly bounds: ProductCostBounds;
}

export type EligibilityDecision =
  | { readonly ok: true; readonly policy: EligibilityPolicy; readonly context: ProductContext }
  | { readonly ok: false; readonly code: EligibilityCode; readonly message: string };

function reject(code: EligibilityCode): EligibilityDecision {
  return { ok: false, code, message: MESSAGES[code] };
}

const SUPPORTED: readonly ProductPurchaseId[] = [
  "contract_check",
  "contract_improve",
  "negotiation_package",
];

/**
 * Един ред от истината. Проваля се затворено: липсваща истина е отказ, не
 * „вероятно е добре“.
 */
export function evaluateProductEligibility(input: EligibilityInput): EligibilityDecision {
  const { productId, source } = input;
  if (!SUPPORTED.includes(productId)) return reject("unsupported_product");

  if (input.expectedPolicyVersion != null &&
      input.expectedPolicyVersion !== PRODUCT_GENERATION_POLICY_VERSION) {
    return reject("policy_changed");
  }

  // 1) Източникът трябва да е ЦЯЛ, четим и в каноничната мерна единица.
  if (source.extractionStatus !== "full") return reject("source_not_usable");
  if (source.charUnit !== PRODUCT_SOURCE_CHAR_UNIT) return reject("source_not_usable");
  if (source.sourceKind !== "pdf" && source.sourceKind !== "docx") {
    return reject("source_not_usable");
  }
  const measured = countProductSourceChars(source.text);
  if (measured !== source.charCount) return reject("source_not_usable");
  if (measured < PRODUCT_MIN_SOURCE_CHARS) return reject("source_not_usable");
  if (measured > PRODUCT_MAX_SOURCE_CHARS) return reject("source_too_long");

  // 2) Неизменният контекст, изискван от точно този продукт.
  let context: ProductContext;
  try {
    context = requireStoredProductContext(input.context, productId);
  } catch (e) {
    if (e instanceof ProductContextError) return reject("context_incomplete");
    throw e;
  }

  // 3) Забранено съдържание — детерминистично, без мрежа.
  if (detectIllegalContent(source.text).blocked) return reject("content_not_allowed");

  // 4) Класификация и маршрут по установената политика.
  const classification = classifyDocumentBeforeAI(source.text);
  if (classification.risk_level === "blocked") return reject("processing_not_allowed");
  if (classification.allowed_models.length === 0) return reject("processing_not_allowed");

  // 5) Обем и разход — най-лошият допустим път трябва да се вмести в тавана.
  let bounds: ProductCostBounds;
  try {
    bounds = computeProductCostBounds(productId, measured, classification);
  } catch (e) {
    if (e instanceof ProductBudgetError) {
      return reject(e.reason === "source_too_long_for_budget" ? "source_too_long" : "capacity_exceeded");
    }
    throw e;
  }

  return {
    ok: true,
    context,
    policy: {
      version: PRODUCT_GENERATION_POLICY_VERSION,
      riskLevel: classification.risk_level,
      containsPersonalData: classification.contains_personal_data,
      containsSpecialCategoryData: classification.contains_special_category_data,
      redactionRequired: classification.redaction_required,
      bounds,
    },
  };
}
