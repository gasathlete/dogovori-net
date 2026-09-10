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
      name: "Поправки с готов текст",
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
  | "price_mismatch"
  | "line_item_mismatch"
  | "amount_mismatch"
  | "tax_behavior_mismatch"
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
}

/**
 * Единственото допустимо данъчно поведение за микропродуктите: цената е бруто.
 * `exclusive` или `unspecified` биха позволили по-късно автоматичният данък да
 * вдигне видимата сума над 2,99/3,99/7,99 €.
 */
export const PRODUCT_TAX_BEHAVIOR = "inclusive" as const;

/**
 * Приема резултата от `prices.list({ lookup_keys: [<product key>] })` и връща
 * единствената използваема цена. Никога не създава и не променя цена.
 *
 * Изисква строго: active === true, точен lookup_key, `one_time` без
 * `recurring`, валута EUR и точната сума в центове.
 */
export function requireProductPrice(
  prices: MinimalProductPrice[] | null | undefined,
  productId: ProductPurchaseId,
): MinimalProductPrice {
  const spec = requireProductSpec(productId);
  const active = (prices ?? []).find((p) => p.active === true);
  if (!active) throw new ProductPurchaseError("price_not_found");
  if (active.lookup_key !== spec.lookupKey) throw new ProductPurchaseError("price_mismatch");
  if (active.type !== "one_time" || active.recurring) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if ((active.currency ?? "").toLowerCase() !== spec.currency) {
    throw new ProductPurchaseError("price_mismatch");
  }
  if (active.unit_amount !== spec.amountCents) throw new ProductPurchaseError("price_mismatch");
  // Рекламата казва „с включен ДДС“ — само `inclusive` пази точната бруто сума.
  if ((active.tax_behavior ?? "") !== PRODUCT_TAX_BEHAVIOR) {
    throw new ProductPurchaseError("tax_behavior_mismatch");
  }
  return active;
}

export interface MinimalProductLineItem {
  quantity?: number | null;
  amount_total?: number | null;
  currency?: string | null;
  price?: {
    lookup_key?: string | null;
    currency?: string | null;
    unit_amount?: number | null;
    type?: string | null;
    recurring?: unknown;
    metadata?: Record<string, string> | null;
  } | null;
}

export interface VerifiedProductPurchase {
  readonly productId: ProductPurchaseId;
  readonly lookupKey: ProductLookupKey;
  readonly amountCents: number;
  readonly currency: typeof PRODUCT_CURRENCY;
  readonly productName: string;
  readonly refinementsIncluded: 0 | 1;
}

/**
 * Проверява, че платената сесия съдържа ТОЧНО един ред, точно този продукт,
 * количество точно 1, EUR и точната обща сума. Всичко друго е отказ.
 */
export function verifyProductLineItems(
  items: MinimalProductLineItem[] | null | undefined,
  expectedProductId: unknown,
): VerifiedProductPurchase {
  const spec = requireProductSpec(expectedProductId);
  const list = items ?? [];
  if (list.length !== 1) throw new ProductPurchaseError("line_item_mismatch");
  const li = list[0];
  const key = li.price?.lookup_key ?? li.price?.metadata?.lovable_external_id ?? null;
  if (key !== spec.lookupKey) throw new ProductPurchaseError("line_item_mismatch");
  if (li.quantity !== 1) throw new ProductPurchaseError("line_item_mismatch");
  if (li.price?.type && li.price.type !== "one_time") {
    throw new ProductPurchaseError("price_mismatch");
  }
  if (li.price?.recurring) throw new ProductPurchaseError("price_mismatch");
  const currency = (li.currency ?? li.price?.currency ?? "").toLowerCase();
  if (currency !== spec.currency) throw new ProductPurchaseError("price_mismatch");
  if (li.amount_total !== spec.amountCents) throw new ProductPurchaseError("amount_mismatch");
  return {
    productId: spec.id,
    lookupKey: spec.lookupKey,
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
 * Проверява, че метаданните на сесията не си противоречат: продуктът, ключът
 * и окръжението трябва да сочат едно и също. Непознатата стойност е отказ.
 */
export function readProductSessionMetadata(meta: Record<string, unknown> | null | undefined): {
  productId: ProductPurchaseId;
  intakeId: string;
  sourceHash: string;
  environment: "live" | "sandbox";
} | null {
  const m = meta ?? {};
  if (m.type !== "product") return null;
  const productId = m.productId;
  if (!isProductPurchaseId(productId)) throw new ProductPurchaseError("unknown_product");
  const spec = PRODUCT_PURCHASES[productId];
  if (typeof m.lookupKey === "string" && m.lookupKey !== spec.lookupKey) {
    throw new ProductPurchaseError("metadata_conflict");
  }
  const intakeId = typeof m.intakeId === "string" ? m.intakeId : "";
  const sourceHash = typeof m.sourceHash === "string" ? m.sourceHash : "";
  if (!intakeId || !sourceHash) throw new ProductPurchaseError("metadata_conflict");
  const environment = m.environment;
  if (environment !== "live" && environment !== "sandbox") {
    throw new ProductPurchaseError("metadata_conflict");
  }
  return { productId, intakeId, sourceHash, environment };
}
