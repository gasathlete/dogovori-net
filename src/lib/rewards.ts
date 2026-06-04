// Loyalty rewards for performed operations.
// Tiers are computed purely from the user's lifetime op count; unlocked tiers
// stay unlocked. Add new tiers here — UI and checkout pick them up automatically.

import { Crown, Gem, Trophy, Sparkles, type LucideIcon } from "lucide-react";

export type RewardTier = {
  id: string;
  /** Stable Stripe coupon id created on demand by the checkout function. */
  couponId: string;
  name: string;
  /** Threshold of lifetime operations required to unlock. */
  threshold: number;
  /** Percent discount on recurring subscriptions. */
  discountPercent: number;
  description: string;
  icon: LucideIcon;
  /** Tailwind color token (without `text-`/`bg-` prefix). */
  accent: string;
};

export const REWARD_TIERS: RewardTier[] = [
  {
    id: "gold_entrepreneur",
    couponId: "loyalty_gold_5",
    name: "Златен предприемач",
    threshold: 1000,
    discountPercent: 5,
    description: "5% отстъпка от абонамента доживот.",
    icon: Crown,
    accent: "gold",
  },
  {
    id: "platinum_entrepreneur",
    couponId: "loyalty_platinum_10",
    name: "Платинен предприемач",
    threshold: 5000,
    discountPercent: 10,
    description: "10% отстъпка от абонамента доживот.",
    icon: Gem,
    accent: "primary",
  },
  {
    id: "diamond_entrepreneur",
    couponId: "loyalty_diamond_15",
    name: "Диамантен предприемач",
    threshold: 15000,
    discountPercent: 15,
    description: "15% отстъпка от абонамента доживот.",
    icon: Trophy,
    accent: "accent",
  },
];

export function getUnlockedTiers(totalOps: number): RewardTier[] {
  return REWARD_TIERS.filter((t) => totalOps >= t.threshold);
}

export function getNextTier(totalOps: number): RewardTier | null {
  return REWARD_TIERS.find((t) => totalOps < t.threshold) ?? null;
}

/** Highest unlocked tier — used for the active subscription discount. */
export function getActiveTier(totalOps: number): RewardTier | null {
  const unlocked = getUnlockedTiers(totalOps);
  return unlocked.length ? unlocked[unlocked.length - 1] : null;
}

export { Sparkles };

// ---------------------------------------------------------------------------
// Team loyalty tiers — based on total team operations (lifetime).
// Shown on the team dashboard only; no per-seat discount is applied here.
// ---------------------------------------------------------------------------
export type TeamRewardTier = {
  id: string;
  name: string;
  threshold: number;
  description: string;
  icon: LucideIcon;
  accent: string;
};

export const TEAM_REWARD_TIERS: TeamRewardTier[] = [
  {
    id: "gold_team",
    name: "Златен екип",
    threshold: 5000,
    description: "Първото ниво за активни екипи.",
    icon: Crown,
    accent: "gold",
  },
  {
    id: "platinum_team",
    name: "Платинен екип",
    threshold: 15000,
    description: "За екипи с устойчиво ползване.",
    icon: Gem,
    accent: "primary",
  },
  {
    id: "diamond_team",
    name: "Диамантен екип",
    threshold: 25000,
    description: "За най-активните екипи на платформата.",
    icon: Trophy,
    accent: "accent",
  },
];

export function getUnlockedTeamTiers(totalOps: number): TeamRewardTier[] {
  return TEAM_REWARD_TIERS.filter((t) => totalOps >= t.threshold);
}

export function getNextTeamTier(totalOps: number): TeamRewardTier | null {
  return TEAM_REWARD_TIERS.find((t) => totalOps < t.threshold) ?? null;
}

export function getActiveTeamTier(totalOps: number): TeamRewardTier | null {
  const unlocked = getUnlockedTeamTiers(totalOps);
  return unlocked.length ? unlocked[unlocked.length - 1] : null;
}

