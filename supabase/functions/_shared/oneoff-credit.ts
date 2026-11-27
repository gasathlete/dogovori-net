/**
 * Еднократни (non-subscription) продукти: канонични lookup keys, валидация на
 * живата Stripe цена и чисто изчисление колко операции трябва да се кредитират
 * за дадена checkout сесия.
 *
 * Всичко тук е чисто (без Stripe/DB), за да е покрито с детерминистични тестове.
 *
 * ИДЕМПОТЕНТНОСТ: кредитирането минава през `credit_topup_ops`, която вписва
 * ред в `topup_purchases` с UNIQUE(stripe_session_id) и вдига баланса само при
 * реално вписване. Затова изчисляваме ЕДНА агрегирана сума за цялата сесия и
 * правим ЕДНО RPC извикване — повторна доставка на `checkout.session.completed`
 * не може да кредитира втори път.
 */

/** Входен пакет без абонамент. */
export const ENTRY_PACK_LOOKUP_KEY = "five_operations" as const;
export const ENTRY_PACK_OPS = 5;
/** Точната стойност в евроцентове, която живата цена трябва да има. */
export const ENTRY_PACK_AMOUNT_CENTS = 290;
export const ENTRY_PACK_CURRENCY = "eur" as const;

/** Колко операции дава един брой от даден еднократен lookup key. */
export const ONE_OFF_OPS_PER_UNIT: Readonly<Record<string, number>> = Object.freeze({
  [ENTRY_PACK_LOOKUP_KEY]: ENTRY_PACK_OPS,
  single_contract: 1,
  topup_5: 5,
  topup_10: 10,
  topup_20: 20,
  topup_50: 50,
  topup_100: 100,
});

export type EntryPriceProblem = "price_not_found" | "price_mismatch" | "unsupported_price";

export class EntryPriceError extends Error {
  readonly reason: EntryPriceProblem;
  constructor(reason: EntryPriceProblem) {
    super(
      reason === "price_not_found"
        ? "Price not configured"
        : reason === "unsupported_price"
          ? "Price not allowed"
          : "Price mismatch",
    );
    this.reason = reason;
    this.name = "EntryPriceError";
  }
}

/**
 * Server-side allowlist на РЕАЛНО използваните lookup keys.
 * `team_seat_yearly` / `team_yearly` НЕ са тук — екипните места минават през
 * create-team. Legacy `pro_*` и branding/topup потоците се запазват.
 */
export const SUBSCRIPTION_LOOKUP_KEYS: readonly string[] = Object.freeze([
  "professional_monthly",
  "professional_yearly",
  "entrepreneur_monthly",
  "entrepreneur_yearly",
  // Legacy (все още активни абонаменти и стари линкове).
  "pro_monthly",
  "pro_yearly",
]);

export const ONE_OFF_LOOKUP_KEYS: readonly string[] = Object.freeze([
  ENTRY_PACK_LOOKUP_KEY,
  "single_contract",
  "branding_unlock_once",
  "topup_5",
  "topup_10",
  "topup_20",
  "topup_50",
  "topup_100",
]);

export const CHECKOUT_LOOKUP_KEYS: readonly string[] = Object.freeze([
  ...SUBSCRIPTION_LOOKUP_KEYS,
  ...ONE_OFF_LOOKUP_KEYS,
]);

/** Само точно съвпадение — regex „изглежда като lookup key“ не е достатъчен. */
export function isAllowedCheckoutLookupKey(key: unknown): key is string {
  return typeof key === "string" && CHECKOUT_LOOKUP_KEYS.includes(key);
}

export interface MinimalPrice {
  id?: string;
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
  lookup_key?: string | null;
  recurring?: unknown;
  /** Stripe връща id или разгънат обект; само типово поле, без runtime промяна. */
  product?: string | { id: string } | null;
}

/**
 * Приема списъка цени от `prices.list({ lookup_keys: [five_operations] })` и
 * връща единствената използваема цена. Никога не създава и не променя цена —
 * при разминаване хвърля типизирана грешка, за да върнем безопасен код нагоре.
 *
 * Изисква строго: active === true, lookup_key === five_operations,
 * type === "one_time" (без `recurring`), валута EUR, unit_amount === 290.
 */
export function requireEntryPackPrice(prices: MinimalPrice[] | null | undefined): MinimalPrice {
  const list = prices ?? [];
  const price = list.find((p) => p.active === true);
  if (!price) throw new EntryPriceError("price_not_found");
  if (price.lookup_key !== ENTRY_PACK_LOOKUP_KEY) throw new EntryPriceError("price_mismatch");
  if (price.type !== "one_time" || price.recurring) throw new EntryPriceError("price_mismatch");
  if ((price.currency ?? "").toLowerCase() !== ENTRY_PACK_CURRENCY) {
    throw new EntryPriceError("price_mismatch");
  }
  if (price.unit_amount !== ENTRY_PACK_AMOUNT_CENTS) throw new EntryPriceError("price_mismatch");
  return price;
}

export interface MinimalLineItem {
  quantity?: number | null;
  amount_total?: number | null;
  price?: {
    lookup_key?: string | null;
    metadata?: Record<string, string> | null;
  } | null;
}

export interface OneOffCredit {
  /** Представителен lookup key (за одит/история). */
  priceId: string;
  /** Общо операции за цялата сесия. */
  ops: number;
  /** Платена сума в EUR или null, ако Stripe не я е върнал. */
  amountEur: number | null;
}

export function lookupKeyOf(li: MinimalLineItem): string | null {
  const p = li.price;
  if (!p) return null;
  return p.lookup_key || p.metadata?.lovable_external_id || null;
}

/**
 * Сумира операциите за всички разпознати еднократни редове в сесията.
 * Връща `null`, когато няма нищо за кредитиране.
 */
export function planOneOffCredit(items: MinimalLineItem[] | null | undefined): OneOffCredit | null {
  let ops = 0;
  let amountCents = 0;
  let primary: string | null = null;
  for (const li of items ?? []) {
    const key = lookupKeyOf(li);
    if (!key) continue;
    const perUnit = ONE_OFF_OPS_PER_UNIT[key];
    if (!perUnit) continue;
    const qty = typeof li.quantity === "number" && li.quantity > 0 ? li.quantity : 1;
    ops += perUnit * qty;
    if (typeof li.amount_total === "number") amountCents += li.amount_total;
    if (!primary) primary = key;
  }
  if (!primary || ops <= 0) return null;
  return {
    priceId: primary,
    ops,
    amountEur: amountCents > 0 ? Math.round(amountCents) / 100 : null,
  };
}
