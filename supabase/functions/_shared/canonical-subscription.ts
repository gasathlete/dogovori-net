import { EntryPriceError, type MinimalPrice } from "./oneoff-credit.ts";

/** New checkout only; never rewrites or revokes grandfathered subscriptions. */
export const SUBSCRIPTION_PRICES: Readonly<Record<string, { amount: number; interval: string }>> = {
  professional_monthly: { amount: 1290, interval: "month" },
  professional_yearly: { amount: 12900, interval: "year" },
  entrepreneur_monthly: { amount: 1990, interval: "month" },
  entrepreneur_yearly: { amount: 19900, interval: "year" },
  pro_monthly: { amount: 1290, interval: "month" },
  pro_yearly: { amount: 12900, interval: "year" },
};
export function requireSubscriptionPrice(prices: MinimalPrice[], key: string, quantity: unknown = 1): MinimalPrice {
  const spec = SUBSCRIPTION_PRICES[key];
  if (!spec) throw new EntryPriceError("unsupported_price");
  const matches = prices.filter(p => p.active === true && p.lookup_key === key);
  if (matches.length !== 1) throw new EntryPriceError("price_not_found");
  const price = matches[0];
  const recurring = price.recurring as { interval?: string; interval_count?: number; usage_type?: string } | null;
  if (quantity !== 1 || price.currency !== "eur" || price.unit_amount !== spec.amount || price.type !== "recurring"
    || recurring?.interval !== spec.interval || recurring.interval_count !== 1 || recurring.usage_type === "metered") {
    throw new EntryPriceError("price_mismatch");
  }
  return price;
}