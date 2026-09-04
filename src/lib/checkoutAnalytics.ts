/**
 * Помощници за каноничното събитие `checkout_started`.
 *
 * Семантика: събитието означава реално създадена Stripe checkout сесия
 * (embedded checkout или strict unlock), а не клик върху карта с план.
 * Така /admin/metrics „checkout completion“ = completed / started е смислен.
 */

/**
 * Извлича { plan, billing } от логическия price id
 * ("professional_monthly" → professional/monthly, "topup_50" → topup_50/one_time).
 * Никога не връща PII — само технически етикети.
 */
export function describePriceId(priceId?: string): { plan: string; billing: string } {
  if (!priceId) return { plan: "unknown", billing: "unknown" };
  const m = /^(.*)_(monthly|yearly)$/.exec(priceId);
  if (m) return { plan: m[1], billing: m[2] };
  if (priceId.startsWith("topup_")) return { plan: priceId, billing: "one_time" };
  if (priceId.startsWith("branding")) return { plan: "branding", billing: "one_time" };
  return { plan: priceId.slice(0, 40), billing: "unknown" };
}
