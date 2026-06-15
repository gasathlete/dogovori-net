/**
 * Single source of truth for plan/pricing data — fetched from the
 * `plans`, `plan_features`, and `plan_comparison_rows` tables.
 *
 * Any change to plans in the database also automatically rewrites the
 * "АКТУАЛНИ ПЛАНОВЕ И ЦЕНИ (auto)" section in every active AI prompt
 * via the `sync_plans_into_prompts` trigger, so frontend + AI stay in sync.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlanId = "free" | "professional" | "entrepreneur" | "team";
export type Billing = "monthly" | "yearly";

export interface PlanRow {
  id: PlanId;
  name: string;
  tagline: string | null;
  monthly_price: number | null;
  yearly_price: number | null;
  monthly_suffix: string | null;
  yearly_suffix: string | null;
  yearly_note: string | null;
  ops_cap_monthly: number | null;
  seat_min: number | null;
  highlight: boolean;
  badge: string | null;
  sort_order: number;
  active: boolean;
}

export interface PlanFeatureRow {
  id: string;
  plan_id: PlanId;
  feature: string;
  sort_order: number;
  active: boolean;
}

export interface PlanComparisonRow {
  id: string;
  label: string;
  free_value: string;
  professional_value: string;
  entrepreneur_value: string;
  team_value: string;
  sort_order: number;
  active: boolean;
}

export interface PlanView {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: { price: number; suffix: string; note?: string } | null;
  yearly: { price: number; suffix: string; note?: string } | null;
  features: string[];
  highlight: boolean;
  badge?: string;
  ops_cap_monthly: number | null;
  seat_min: number | null;
}

function buildView(row: PlanRow, features: PlanFeatureRow[]): PlanView {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline ?? "",
    monthly:
      row.monthly_price !== null
        ? {
            price: Number(row.monthly_price),
            suffix: row.monthly_suffix ?? "€/мес",
          }
        : null,
    yearly:
      row.yearly_price !== null
        ? {
            price: Number(row.yearly_price),
            suffix: row.yearly_suffix ?? "€/год",
            note: row.yearly_note ?? undefined,
          }
        : null,
    features: features
      .filter((f) => f.plan_id === row.id && f.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => f.feature),
    highlight: row.highlight,
    badge: row.badge ?? undefined,
    ops_cap_monthly: row.ops_cap_monthly,
    seat_min: row.seat_min,
  };
}

export function usePlans() {
  return useQuery({
    queryKey: ["plans", "active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: plans, error: e1 }, { data: features, error: e2 }, { data: cmp, error: e3 }] =
        await Promise.all([
          supabase.from("plans").select("*").eq("active", true).order("sort_order"),
          supabase.from("plan_features").select("*").eq("active", true).order("sort_order"),
          supabase
            .from("plan_comparison_rows")
            .select("*")
            .eq("active", true)
            .order("sort_order"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      const rows = (plans ?? []) as unknown as PlanRow[];
      const feats = (features ?? []) as unknown as PlanFeatureRow[];
      const views = rows.map((r) => buildView(r, feats));
      return {
        plans: views,
        comparison: ((cmp ?? []) as unknown as PlanComparisonRow[]),
      };
    },
  });
}

/** Admin-only fetcher that includes inactive rows. */
export function usePlansAdmin() {
  return useQuery({
    queryKey: ["plans", "admin"],
    staleTime: 0,
    queryFn: async () => {
      const [{ data: plans, error: e1 }, { data: features, error: e2 }, { data: cmp, error: e3 }] =
        await Promise.all([
          supabase.from("plans").select("*").order("sort_order"),
          supabase.from("plan_features").select("*").order("sort_order"),
          supabase.from("plan_comparison_rows").select("*").order("sort_order"),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      return {
        plans: (plans ?? []) as unknown as PlanRow[],
        features: (features ?? []) as unknown as PlanFeatureRow[],
        comparison: (cmp ?? []) as unknown as PlanComparisonRow[],
      };
    },
  });
}
