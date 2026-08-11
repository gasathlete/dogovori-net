// Real-data monthly audit (revenue vs cost) + margin simulation.
// Data source: public.admin_financial_audit(_months) RPC (staff-only).

import { STRIPE_FEE_FIXED_EUR, STRIPE_FEE_PCT, VAT_RATE } from "./assumptions";

export type AuditRow = {
  month: string;
  new_signups: number;
  active_paid: number;
  active_teams: number;
  team_seats: number;
  ops_total: number;
  ops_template: number;
  ops_contract: number;
  ops_analysis: number;
  ops_corrections: number;
  ai_calls: number;
  ai_tokens_in: number;
  ai_tokens_out: number;
  ai_cost_eur: number;
};

/** Editable knobs for the monthly audit + simulation. */
export type AuditAssumptions = {
  /** Average gross price per individual paying subscriber (VAT incl.). */
  arpu_gross_eur: number;
  /** Gross price per team seat / month (VAT incl.). */
  seat_gross_eur: number;
  /** Fixed monthly infrastructure + tooling cost. */
  fixed_costs_eur: number;
  /** Marketing spend per month. */
  marketing_eur: number;
  /** Fallback AI cost per op when ai_usage has no logged cost. */
  fallback_cost_per_op_eur: number;
  /** Target number of paying users (individual subscribers + seats). */
  target_paid_users: number;
  /** Simulation: multiplier on paying users (1 = as-is). */
  sim_paid_multiplier: number;
  /** Simulation: multiplier on price. */
  sim_price_multiplier: number;
  /** Simulation: multiplier on ops per paying user (drives AI cost). */
  sim_usage_multiplier: number;
};

export const DEFAULT_AUDIT_ASSUMPTIONS: AuditAssumptions = {
  arpu_gross_eur: 14.9,
  seat_gross_eur: 10.9,
  fixed_costs_eur: 280,
  marketing_eur: 150,
  fallback_cost_per_op_eur: 0.02,
  target_paid_users: 90,
  sim_paid_multiplier: 1,
  sim_price_multiplier: 1,
  sim_usage_multiplier: 1,
};

export type AuditComputed = {
  row: AuditRow;
  paid_units: number; // individual subs + team seats
  gross_revenue: number;
  net_revenue: number;
  ai_cost: number;
  stripe_fees: number;
  variable_cost: number;
  gross_profit: number;
  gross_margin_pct: number;
  net_profit: number;
  net_margin_pct: number;
  cost_per_op: number;
  revenue_per_op: number;
  ops_per_paid_user: number;
  contribution_per_paid_user: number;
  breakeven_paid_units: number;
};

export function computeAuditMonth(
  row: AuditRow,
  a: AuditAssumptions,
  simulate = false,
): AuditComputed {
  const paidMul = simulate ? Math.max(0, a.sim_paid_multiplier) : 1;
  const priceMul = simulate ? Math.max(0, a.sim_price_multiplier) : 1;
  const usageMul = simulate ? Math.max(0, a.sim_usage_multiplier) : 1;

  const subs = row.active_paid * paidMul;
  const seats = row.team_seats * paidMul;
  const paid_units = subs + seats;

  const gross_revenue =
    (subs * a.arpu_gross_eur + seats * a.seat_gross_eur) * priceMul;
  const net_revenue = gross_revenue / (1 + VAT_RATE);

  const ops = row.ops_total * paidMul * usageMul;
  const loggedCostPerOp =
    row.ops_total > 0 && row.ai_cost_eur > 0 ? row.ai_cost_eur / row.ops_total : 0;
  const cost_per_op = Math.max(loggedCostPerOp, a.fallback_cost_per_op_eur);
  const ai_cost = ops * cost_per_op;

  const charges = subs + row.active_teams * paidMul;
  const stripe_fees = gross_revenue * STRIPE_FEE_PCT + charges * STRIPE_FEE_FIXED_EUR;

  const variable_cost = ai_cost + stripe_fees;
  const gross_profit = net_revenue - variable_cost;
  const net_profit = gross_profit - a.fixed_costs_eur - a.marketing_eur;

  const contribution_per_paid_user = paid_units > 0 ? gross_profit / paid_units : 0;

  return {
    row,
    paid_units,
    gross_revenue,
    net_revenue,
    ai_cost,
    stripe_fees,
    variable_cost,
    gross_profit,
    gross_margin_pct: net_revenue > 0 ? (gross_profit / net_revenue) * 100 : 0,
    net_profit,
    net_margin_pct: net_revenue > 0 ? (net_profit / net_revenue) * 100 : 0,
    cost_per_op,
    revenue_per_op: ops > 0 ? net_revenue / ops : 0,
    ops_per_paid_user: paid_units > 0 ? ops / paid_units : 0,
    contribution_per_paid_user,
    breakeven_paid_units:
      contribution_per_paid_user > 0
        ? Math.ceil((a.fixed_costs_eur + a.marketing_eur) / contribution_per_paid_user)
        : Infinity,
  };
}

/** Projection to the target number of paying users, using current unit economics. */
export function projectToTarget(latest: AuditComputed, a: AuditAssumptions) {
  const unitNet =
    latest.paid_units > 0 ? latest.net_revenue / latest.paid_units : a.arpu_gross_eur / (1 + VAT_RATE);
  const unitVar = latest.paid_units > 0 ? latest.variable_cost / latest.paid_units : 0;
  const target = Math.max(0, a.target_paid_users);
  const net_revenue = unitNet * target;
  const variable_cost = unitVar * target;
  const gross_profit = net_revenue - variable_cost;
  const net_profit = gross_profit - a.fixed_costs_eur - a.marketing_eur;
  return {
    target,
    gap: Math.max(0, target - Math.round(latest.paid_units)),
    net_revenue,
    variable_cost,
    gross_profit,
    net_profit,
    arr_net: net_revenue * 12,
    net_margin_pct: net_revenue > 0 ? (net_profit / net_revenue) * 100 : 0,
  };
}

export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("bg-BG", { month: "short", year: "2-digit" });
}
