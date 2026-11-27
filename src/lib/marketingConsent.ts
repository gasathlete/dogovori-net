/**
 * Tri-state marketing eligibility, derived from the LATEST recorded consent
 * event only. "No record" is never treated as consent.
 *
 * This mirrors the SQL used by `admin_list_users`,
 * `admin_list_marketing_recipients` and `admin_send_campaign_topic`; the
 * database stays authoritative, this helper exists so the rule is unit-tested
 * and the UI labels cannot drift from it.
 */

export type MarketingStatus = "opt_in" | "opt_out" | "unknown";

export interface MarketingConsentEvent {
  granted: boolean;
  granted_at?: string | null;
  created_at?: string | null;
  id?: string | null;
}

function orderKey(e: MarketingConsentEvent): string {
  return `${e.granted_at ?? ""}|${e.created_at ?? ""}|${e.id ?? ""}`;
}

/** Latest event wins; an empty history is `unknown`, never `opt_in`. */
export function marketingStatusFromEvents(
  events: readonly MarketingConsentEvent[] | null | undefined,
): MarketingStatus {
  if (!events || events.length === 0) return "unknown";
  const latest = [...events].sort((a, b) => (orderKey(a) < orderKey(b) ? 1 : -1))[0];
  return latest.granted === true ? "opt_in" : "opt_out";
}

/** Only an explicit opt-in may receive marketing. */
export function isMarketingEligible(status: MarketingStatus): boolean {
  return status === "opt_in";
}

export function marketingStatusLabel(status: MarketingStatus): "+" | "−" | "?" {
  if (status === "opt_in") return "+";
  if (status === "opt_out") return "−";
  return "?";
}

export function marketingStatusTitle(status: MarketingStatus): string {
  if (status === "opt_in") return "Изрично съгласие за имейл маркетинг";
  if (status === "opt_out") return "Изричен отказ от имейл маркетинг";
  return "Няма записан избор — не се включва в кампании";
}

export function normalizeMarketingStatus(value: unknown): MarketingStatus {
  return value === "opt_in" || value === "opt_out" ? value : "unknown";
}
