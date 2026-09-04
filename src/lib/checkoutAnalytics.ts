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
  if (priceId === "team_seat_yearly") return { plan: "team", billing: "yearly" };
  const m = /^(.*)_(monthly|yearly)$/.exec(priceId);
  if (m) return { plan: m[1], billing: m[2] };
  if (priceId.startsWith("topup_")) return { plan: priceId, billing: "one_time" };
  if (priceId === "five_operations") return { plan: "five_operations", billing: "one_time" };
  if (priceId === "single_contract") return { plan: "single_contract", billing: "one_time" };
  if (priceId === "strict_doc_unlock") return { plan: "strict_unlock", billing: "one_time" };
  if (priceId.startsWith("branding")) return { plan: "branding", billing: "one_time" };
  return { plan: priceId.slice(0, 40), billing: "unknown" };
}

/** Еднократни продукти без "_monthly/_yearly" суфикс. */
const ONE_TIME_PRICE_IDS: Record<string, string> = {
  five_operations: "five_operations",
  single_contract: "single_contract",
  strict_doc_unlock: "strict_unlock",
};

/**
 * Ограничена таксономия на причините за неуспешен checkout.
 * Никога не изпращаме суровото съобщение за грешка — само една от тези стойности.
 */
export type CheckoutFailureCategory =
  | "price_not_found"
  | "price_mismatch"
  | "unauthorized"
  | "network"
  | "stripe"
  | "unknown";

export const CHECKOUT_FAILURE_CATEGORIES: readonly CheckoutFailureCategory[] = [
  "price_not_found",
  "price_mismatch",
  "unauthorized",
  "network",
  "stripe",
  "unknown",
] as const;

/**
 * Свежда произволна грешка (вкл. текст от сървър) до ограничена категория.
 * Резултатът е винаги един от `CHECKOUT_FAILURE_CATEGORIES` — така в метриките
 * не може да изтече свободен текст, имейл или идентификатор.
 */
export function categorizeCheckoutError(err: unknown): CheckoutFailureCategory {
  const raw = (() => {
    if (!err) return "";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message ?? "";
    const m = (err as { message?: unknown }).message;
    return typeof m === "string" ? m : "";
  })().toLowerCase();

  if (!raw) return "unknown";
  if (/(not configured|price not found|липсва цена|not_configured)/.test(raw)) return "price_not_found";
  if (/(mismatch|unexpected amount|различна цена|не съвпада)/.test(raw)) return "price_mismatch";
  if (/(unauthorized|401|403|forbidden|не сте влезли)/.test(raw)) return "unauthorized";
  if (/(failed to fetch|networkerror|network error|timeout|econn|offline|load failed)/.test(raw)) return "network";
  if (/(stripe|checkout session|client secret|clientsecret)/.test(raw)) return "stripe";
  return "unknown";
}
