/**
 * Канoничната СЪРВЪРНА конфигурация за покупка на точно един еднократен
 * продукт, обвързан с точно един документ.
 *
 * Модулът е чист (без Stripe SDK, без DB, без Deno API), за да е напълно
 * покрит с детерминистични тестове и да може да се използва и от frontend
 * parity тест.
 *
 * ВАЖНО: продуктите НЕ дават операции/кредити. Ключовете тук НИКОГА не влизат
 * в `ONE_OFF_OPS_PER_UNIT` и никога не водят до `credit_topup_ops`.
 */

export type ProductPurchaseId =
  | "contract_check"
  | "contract_improve"
  | "negotiation_package";

export type ProductLookupKey =
  | "contract_check_299"
  | "contract_improve_399"
  | "negotiation_package_799";

export const PRODUCT_CURRENCY = "eur" as const;

export interface ProductPurchaseSpec {
  readonly id: ProductPurchaseId;
  readonly lookupKey: ProductLookupKey;
  /** Точна сума в евроцентове с включен ДДС. */
  readonly amountCents: number;
  readonly currency: typeof PRODUCT_CURRENCY;
  readonly priceType: "one_time";
  /** Точното човешко име — ползва се в разписката. */
  readonly name: string;
  /** Колко премиум уточнения включва (0/0/1). */
  readonly refinementsIncluded: 0 | 1;
}

/** Затворено съпоставяне продукт → цена. Нищо извън него не е валидно. */
export const PRODUCT_PURCHASES: Readonly<Record<ProductPurchaseId, ProductPurchaseSpec>> =
  Object.freeze({
    contract_check: Object.freeze({
      id: "contract_check",
      lookupKey: "contract_check_299",
      amountCents: 299,
      currency: PRODUCT_CURRENCY,
      priceType: "one_time",
      name: "Подробна проверка преди подпис",
      refinementsIncluded: 0,
    }) as ProductPurchaseSpec,
    contract_improve: Object.freeze({
      id: "contract_improve",
      lookupKey: "contract_improve_399",
      amountCents: 399,
      currency: PRODUCT_CURRENCY,
      priceType: "one_time",
      name: "Подробна поправка на документа",
      refinementsIncluded: 0,
    }) as ProductPurchaseSpec,

    negotiation_package: Object.freeze({
      id: "negotiation_package",
      lookupKey: "negotiation_package_799",
      amountCents: 799,
      currency: PRODUCT_CURRENCY,
      priceType: "one_time",
      name: "Пълен пакет за преговори",
      refinementsIncluded: 1,
    }) as ProductPurchaseSpec,
  });

export const PRODUCT_PURCHASE_IDS: readonly ProductPurchaseId[] = Object.freeze([
  "contract_check",
  "contract_improve",
  "negotiation_package",
]);

export const PRODUCT_LOOKUP_KEYS: readonly ProductLookupKey[] = Object.freeze(
  PRODUCT_PURCHASE_IDS.map((id) => PRODUCT_PURCHASES[id].lookupKey),
);

export type ProductPurchaseProblem =
  | "unknown_product"
  | "price_not_found"
  | "price_ambiguous"
  | "price_mismatch"
  | "line_item_mismatch"
  | "amount_mismatch"
  | "tax_behavior_mismatch"
  | "environment_mismatch"
  | "metadata_conflict";


export class ProductPurchaseError extends Error {
  readonly reason: ProductPurchaseProblem;
  constructor(reason: ProductPurchaseProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductPurchaseError";
  }
}

export function isProductPurchaseId(raw: unknown): raw is ProductPurchaseId {
  return typeof raw === "string" && (PRODUCT_PURCHASE_IDS as readonly string[]).includes(raw);
}

export function isProductLookupKey(raw: unknown): raw is ProductLookupKey {
  return typeof raw === "string" && (PRODUCT_LOOKUP_KEYS as readonly string[]).includes(raw);
}

/** Fail-closed: непознат продукт никога не продължава напред. */
export function requireProductSpec(raw: unknown): ProductPurchaseSpec {
  if (!isProductPurchaseId(raw)) throw new ProductPurchaseError("unknown_product");
  return PRODUCT_PURCHASES[raw];
}

export function productIdForLookupKey(raw: unknown): ProductPurchaseId | null {
  if (!isProductLookupKey(raw)) return null;
  for (const id of PRODUCT_PURCHASE_IDS) {
    if (PRODUCT_PURCHASES[id].lookupKey === raw) return id;
  }
  return null;
}

export interface MinimalProductPrice {
  id?: string;
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
  lookup_key?: string | null;
  recurring?: unknown;
  /** Рекламираме брутна цена „с включен ДДС“ — затова тук се допуска само `inclusive`. */
  tax_behavior?: string | null;
  /** Трябва да съвпада с избраното окръжение: live ↔ true, sandbox ↔ false. */
  livemode?: boolean | null;
}

export type StripeEnvironment = "live" | "sandbox";

/**
 * Единственото допустимо данъчно поведение за микропродуктите: цената е бруто.
 * `exclusive` или `unspecified` биха позволили по-късно автоматичният данък да
 * вдигне видимата сума над 2,99/3,99/7,99 €.
 */
export const PRODUCT_TAX_BEHAVIOR = "inclusive" as const;

export function livemodeForEnvironment(environment: StripeEnvironment): boolean {
  return environment === "live";
}

/**
 * Приема резултата от `prices.list({ lookup_keys: [<product key>] })` и връща
 * ЕДИНСТВЕНАТА използваема цена.
 *
 * Изисква строго: точно едно съвпадение, непразен id, active === true, точен
 * lookup_key, `one_time` без `recurring`, EUR, точната сума в центове,
 * `tax_behavior = inclusive` и livemode, съответстващ на окръжението.
 */
export function requireProductPrice(
  prices: MinimalProductPrice[] | null | undefined,
  productId: ProductPurchaseId,
  environment: StripeEnvironment,
): MinimalProductPrice & { id: string } {
  const spec = requireProductSpec(productId);
  if (environment !== "live" && environment !== "sandbox") {
    throw new ProductPurchaseError("environment_mismatch");
  }
  const list = prices ?? [];
  const matching = list.filter((p) =>
    p.active === true && p.lookup_key === spec.lookupKey
  );
  if (matching.length === 0) throw new ProductPurchaseError("price_not_found");
  // Две активни цени с един и същ lookup key са двусмислие, не избор.
  if (matching.length !== 1) throw new ProductPurchaseError("price_ambiguous");
  const price = matching[0];
  if (typeof price.id !== "string" || price.id.trim().length === 0) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if (price.type !== "one_time" || price.recurring) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if ((price.currency ?? "").toLowerCase() !== spec.currency) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if (price.unit_amount !== spec.amountCents) throw new ProductPurchaseError("price_mismatch");
  // Рекламата казва „с включен ДДС“ — само `inclusive` пази точната бруто сума.
  if ((price.tax_behavior ?? "") !== PRODUCT_TAX_BEHAVIOR) {
    throw new ProductPurchaseError("tax_behavior_mismatch");
  }
  if (price.livemode !== livemodeForEnvironment(environment)) {
    throw new ProductPurchaseError("environment_mismatch");
  }
  return price as MinimalProductPrice & { id: string };
}

export interface MinimalProductLineItem {
  quantity?: number | null;
  amount_total?: number | null;
  currency?: string | null;
  price?: {
    id?: string | null;
    active?: boolean | null;
    lookup_key?: string | null;
    currency?: string | null;
    unit_amount?: number | null;
    type?: string | null;
    recurring?: unknown;
    tax_behavior?: string | null;
    livemode?: boolean | null;
    metadata?: Record<string, string> | null;
  } | null;
}

export interface VerifiedProductPurchase {
  readonly productId: ProductPurchaseId;
  readonly lookupKey: ProductLookupKey;
  readonly priceId: string;
  readonly amountCents: number;
  readonly currency: typeof PRODUCT_CURRENCY;
  readonly productName: string;
  readonly refinementsIncluded: 0 | 1;
}

/**
 * Проверява, че платената сесия съдържа ТОЧНО един ред, точно този продукт,
 * количество точно 1, EUR и точната обща сума. Разширената цена е
 * ЗАДЪЛЖИТЕЛНА: без id, тип, active, livemode и данъчно поведение няма покупка.
 */
export function verifyProductLineItems(
  items: MinimalProductLineItem[] | null | undefined,
  expectedProductId: unknown,
  environment: StripeEnvironment,
  expectedPriceId?: string | null,
): VerifiedProductPurchase {
  const spec = requireProductSpec(expectedProductId);
  if (environment !== "live" && environment !== "sandbox") {
    throw new ProductPurchaseError("environment_mismatch");
  }
  const list = items ?? [];
  if (list.length !== 1) throw new ProductPurchaseError("line_item_mismatch");
  const li = list[0];
  const price = li.price;
  if (!price) throw new ProductPurchaseError("line_item_mismatch");
  if (typeof price.id !== "string" || price.id.trim().length === 0) {
    throw new ProductPurchaseError("line_item_mismatch");
  }
  if (price.lookup_key !== spec.lookupKey) throw new ProductPurchaseError("line_item_mismatch");
  if (li.quantity !== 1) throw new ProductPurchaseError("line_item_mismatch");
  if (price.active !== true) throw new ProductPurchaseError("price_mismatch");
  if (price.type !== "one_time" || price.recurring) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if ((price.tax_behavior ?? "") !== PRODUCT_TAX_BEHAVIOR) {
    throw new ProductPurchaseError("tax_behavior_mismatch");
  }
  if (price.livemode !== livemodeForEnvironment(environment)) {
    throw new ProductPurchaseError("environment_mismatch");
  }
  if (price.unit_amount !== spec.amountCents) throw new ProductPurchaseError("amount_mismatch");
  // И валутата на цената, и валутата на реда трябва да са точно EUR.
  const priceCurrency = (price.currency ?? "").toLowerCase();
  if (priceCurrency !== spec.currency) throw new ProductPurchaseError("price_mismatch");
  if (li.currency !== undefined && (li.currency ?? "").toLowerCase() !== spec.currency) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if (li.amount_total !== spec.amountCents) throw new ProductPurchaseError("amount_mismatch");
  if (expectedPriceId && price.id !== expectedPriceId) {
    throw new ProductPurchaseError("price_mismatch");
  }
  return {
    productId: spec.id,
    lookupKey: spec.lookupKey,
    priceId: price.id,
    amountCents: spec.amountCents,
    currency: spec.currency,
    productName: spec.name,
    refinementsIncluded: spec.refinementsIncluded,
  };
}

/**
 * Пълната сума на сесията също трябва да съвпада точно с продукта — иначе
 * купонът/промоцията или чужд ред са променили покупката.
 */
export function assertSessionAmount(
  sessionAmountTotal: unknown,
  sessionCurrency: unknown,
  productId: unknown,
): void {
  const spec = requireProductSpec(productId);
  if (sessionAmountTotal !== spec.amountCents) throw new ProductPurchaseError("amount_mismatch");
  if (typeof sessionCurrency !== "string" || sessionCurrency.toLowerCase() !== spec.currency) {
    throw new ProductPurchaseError("price_mismatch");
  }
}

/**
 * Метаданните на Stripe сесията носят САМО непрозрачни идентификатори и
 * затворени изброявания. Хешове, съгласия, файлови имена и суров контекст не
 * влизат в Stripe — истината се чете от заявката в базата.
 */
export function readProductSessionMetadata(meta: Record<string, unknown> | null | undefined): {
  productId: ProductPurchaseId;
  userId: string;
  intakeId: string;
  sourceDocumentId: string;
  environment: StripeEnvironment;
} | null {
  const m = meta ?? {};
  if (m.purchase_kind !== "product" && m.type !== "product") return null;
  const productId = m.productId;
  if (!isProductPurchaseId(productId)) throw new ProductPurchaseError("unknown_product");
  const userId = typeof m.userId === "string" ? m.userId : "";
  const intakeId = typeof m.intakeId === "string" ? m.intakeId : "";
  const sourceDocumentId = typeof m.sourceDocumentId === "string" ? m.sourceDocumentId : "";
  if (!userId || !intakeId || !sourceDocumentId) {
    throw new ProductPurchaseError("metadata_conflict");
  }
  const environment = m.environment;
  if (environment !== "live" && environment !== "sandbox") {
    throw new ProductPurchaseError("metadata_conflict");
  }
  return { productId, userId, intakeId, sourceDocumentId, environment };
}

