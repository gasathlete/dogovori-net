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

export type EntryPriceProblem = "price_not_found" | "price_mismatch";

export class EntryPriceError extends Error {
  readonly reason: EntryPriceProblem;
  constructor(reason: EntryPriceProblem) {
    super(reason === "price_not_found" ? "Entry pack price not configured" : "Entry pack price mismatch");
    this.reason = reason;
    this.name = "EntryPriceError";
  }
}

export interface MinimalPrice {
  id?: string;
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  type?: string | null;
  recurring?: unknown;
}

/**
 * Приема списъка цени от `prices.list({ lookup_keys: [five_operations] })` и
 * връща единствената използваема цена. Никога не създава и не променя цена —
 * при разминаване хвърля типизирана грешка, за да върнем безопасен код нагоре.
 */
export function requireEntryPackPrice(prices: MinimalPrice[] | null | undefined): MinimalPrice {
  const list = prices ?? [];
  const price = list.find((p) => p.active !== false);
  if (!price) throw new EntryPriceError("price_not_found");
  if ((price.currency ?? "").toLowerCase() !== ENTRY_PACK_CURRENCY) {
    throw new EntryPriceError("price_mismatch");
  }
  if (price.unit_amount !== ENTRY_PACK_AMOUNT_CENTS) throw new EntryPriceError("price_mismatch");
  if (price.recurring) throw new EntryPriceError("price_mismatch");
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
