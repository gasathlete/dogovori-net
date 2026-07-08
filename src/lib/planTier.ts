/**
 * Tier resolution from subscription price_id.
 * - Professional: pro_monthly, pro_yearly (legacy), professional_monthly, professional_yearly
 * - Entrepreneur: entrepreneur_monthly, entrepreneur_yearly
 * - Team:         team_yearly
 */
export type Tier = "free" | "professional" | "entrepreneur" | "team";

export const PROFESSIONAL_PRICE_IDS = new Set([
  "pro_monthly",
  "pro_yearly",
  "professional_monthly",
  "professional_yearly",
]);

export const ENTREPRENEUR_PRICE_IDS = new Set([
  "entrepreneur_monthly",
  "entrepreneur_yearly",
]);

export const TEAM_PRICE_IDS = new Set(["team_yearly"]);

export function tierFromPriceId(priceId: string | null | undefined): Tier {
  if (!priceId) return "free";
  if (ENTREPRENEUR_PRICE_IDS.has(priceId)) return "entrepreneur";
  if (PROFESSIONAL_PRICE_IDS.has(priceId)) return "professional";
  if (TEAM_PRICE_IDS.has(priceId)) return "team";
  return "free";
}

/** Default monthly ops cap per tier (can be overridden per-user via download_quota.plan_ops_cap). */
export const OPS_CAP: Record<Tier, number> = {
  free: 0, // Free has its own dynamic cap (5 first month, then 2)
  professional: 50,
  entrepreneur: 100,
  team: 100, // per seat
};

export function isPaidTier(t: Tier): boolean {
  return t !== "free";
}

export function isEntrepreneur(t: Tier): boolean {
  return t === "entrepreneur";
}

/** BG display name for a tier. */
export const TIER_NAME: Record<Tier, string> = {
  free: "Безплатен",
  professional: "Професионалист",
  entrepreneur: "Предприемач",
  team: "Екип",
};
