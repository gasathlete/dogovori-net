/**
 * Капиталова аритметика за ЕООД (кандидат 05). Сметките са в евроценти, за да
 * няма грешки от плаваща запетая. Праговете (1 EUR капитал, 0,01 EUR дял) са
 * взети от доклада 01 и подлежат на сверка с актуалния текст на чл. 117 ТЗ.
 */
export const MIN_CAPITAL_CENTS = 100;
export const MIN_SHARE_CENTS = 1;

export type CapitalIssue =
  | "capital_not_cent_precise"
  | "share_not_cent_precise"
  | "capital_below_minimum"
  | "share_below_minimum"
  | "shares_count_invalid"
  | "product_mismatch";

function toCents(eur: number): number | null {
  if (!Number.isFinite(eur)) return null;
  const cents = Math.round(eur * 100);
  return Math.abs(cents - eur * 100) < 1e-6 ? cents : null;
}

export function validateCapital(input: { capitalEur: number; sharesCount: number; shareNominalEur: number }): CapitalIssue[] {
  const issues: CapitalIssue[] = [];
  const cap = toCents(input.capitalEur);
  const share = toCents(input.shareNominalEur);
  if (cap === null) issues.push("capital_not_cent_precise");
  if (share === null) issues.push("share_not_cent_precise");
  if (!Number.isInteger(input.sharesCount) || input.sharesCount < 1) issues.push("shares_count_invalid");
  if (cap !== null && cap < MIN_CAPITAL_CENTS) issues.push("capital_below_minimum");
  if (share !== null && share < MIN_SHARE_CENTS) issues.push("share_below_minimum");
  if (cap !== null && share !== null && Number.isInteger(input.sharesCount) && input.sharesCount * share !== cap) {
    issues.push("product_mismatch");
  }
  return issues;
}
