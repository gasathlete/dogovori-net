import {
  DEFAULT_MODEL_PRICES,
  DEFAULT_OP_PROFILE,
  PLANS,
  STRIPE_FEE_FIXED_EUR,
  STRIPE_FEE_PCT,
  TOPUP_50_GROSS_EUR,
  VAT_RATE,
  type ModelPrice,
  type PlanKey,
  type ScenarioInput,
} from "./assumptions";

export type PerPlanRow = {
  key: PlanKey;
  label: string;
  users: number;
  gross_revenue: number;
  net_revenue: number;
  ops_used: number;
  ai_cost: number;
  cost_per_op: number;
};

export type ScenarioResult = {
  name: string;
  // Funnel
  monthly_visitors: number;
  new_signups: number;
  new_paid: number;
  churned_paid: number;
  total_free_users: number;
  total_paid_users: number;
  active_users: number;
  effective_paid_conversion_pct: number; // new_paid / new_signups
  visitor_to_paid_pct: number;           // new_paid / visitors
  // Per plan
  rows: PerPlanRow[];
  // Revenue
  topup_units: number;
  topup_net_revenue: number;
  mrr_gross: number;
  mrr_net: number;
  // Costs
  ai_cost: number;
  stripe_fees: number;
  marketing_spend: number;
  fixed_costs: number;
  // Profit
  gross_profit: number;
  net_profit: number;
  gross_margin_pct: number;
  // Unit economics
  arpu_all: number;
  arpu_paid: number;
  ltv_paid: number;
  ltv_cac_ratio: number;
  payback_months: number;
  arr_net: number;
};

function costPerOp(prices: Record<string, ModelPrice>, routing: { flash: number; pro: number; gpt5: number }): number {
  const { in_tokens, out_tokens, ocr_pages, ocr_per_page_eur, embeddings_per_op_eur } = DEFAULT_OP_PROFILE;
  const perModel = (p: ModelPrice) => (in_tokens / 1e6) * p.in_per_m + (out_tokens / 1e6) * p.out_per_m;
  const llm =
    routing.flash * perModel(prices["gemini-flash"]) +
    routing.pro * perModel(prices["gemini-pro"]) +
    routing.gpt5 * perModel(prices["gpt-5"]);
  return llm + ocr_pages * ocr_per_page_eur + embeddings_per_op_eur;
}

export function computeScenario(
  input: ScenarioInput,
  prices: Record<string, ModelPrice> = DEFAULT_MODEL_PRICES,
): ScenarioResult {
  // ---- Funnel ----
  const new_signups = Math.round(input.monthly_visitors * (input.visitor_to_signup_pct / 100));
  // Conversion lever applies to *new* signups becoming paid this month
  const new_paid = Math.round(new_signups * (input.signup_to_paid_pct / 100));
  const churned_paid = Math.round(input.existing_paid_users * (input.monthly_paid_churn_pct / 100));

  const total_paid_users = Math.max(0, input.existing_paid_users + new_paid - churned_paid);
  // Free base = existing free + (new signups that didn't convert this month)
  const total_free_users = input.existing_free_users + Math.max(0, new_signups - new_paid);
  const active_users = total_free_users + total_paid_users;

  // ---- Plan mix (paid users split by paid_mix) ----
  const users_by_plan: Record<PlanKey, number> = {
    free: total_free_users,
    prof: Math.round(total_paid_users * input.paid_mix.prof),
    entrepreneur: Math.round(total_paid_users * input.paid_mix.entrepreneur),
    team: Math.round(total_paid_users * input.paid_mix.team),
  };

  const rows: PerPlanRow[] = (Object.keys(PLANS) as PlanKey[]).map((key) => {
    const plan = PLANS[key];
    const users = users_by_plan[key];
    const gross = users * plan.gross_monthly_eur;
    const net = gross / (1 + VAT_RATE);
    const ops_used = users * plan.ops_quota * input.utilization;
    const cpo = costPerOp(prices, plan.routing);
    return { key, label: plan.label, users, gross_revenue: gross, net_revenue: net, ops_used, ai_cost: ops_used * cpo, cost_per_op: cpo };
  });

  // ---- Top-up ----
  const topup_units = total_paid_users * input.topup_attach;
  const topup_gross = topup_units * TOPUP_50_GROSS_EUR;
  const topup_net = topup_gross / (1 + VAT_RATE);
  const topup_ops = topup_units * 50;
  const topup_ai_cost = topup_ops * costPerOp(prices, PLANS.entrepreneur.routing);

  const mrr_gross = rows.reduce((a, r) => a + r.gross_revenue, 0) + topup_gross;
  const mrr_net = rows.reduce((a, r) => a + r.net_revenue, 0) + topup_net;
  const ai_cost = rows.reduce((a, r) => a + r.ai_cost, 0) + topup_ai_cost;

  const paying_charges = total_paid_users + topup_units;
  const stripe_fees = mrr_gross * STRIPE_FEE_PCT + paying_charges * STRIPE_FEE_FIXED_EUR;

  // ---- Marketing / CAC ----
  const marketing_spend = new_paid * input.cac_eur;

  const gross_profit = mrr_net - ai_cost - stripe_fees;
  const net_profit = gross_profit - input.fixed_costs_eur - marketing_spend;
  const gross_margin_pct = mrr_net > 0 ? (gross_profit / mrr_net) * 100 : 0;

  const paid_net_revenue = rows.filter((r) => r.key !== "free").reduce((a, r) => a + r.net_revenue, 0) + topup_net;
  const arpu_paid = total_paid_users > 0 ? paid_net_revenue / total_paid_users : 0;
  const arpu_all = active_users > 0 ? mrr_net / active_users : 0;
  const churn = input.monthly_paid_churn_pct / 100;
  const ltv_paid = churn > 0 ? (arpu_paid * (gross_margin_pct / 100)) / churn : arpu_paid * 24;
  const ltv_cac_ratio = input.cac_eur > 0 ? ltv_paid / input.cac_eur : 0;
  const monthly_contribution = arpu_paid * (gross_margin_pct / 100);
  const payback_months = monthly_contribution > 0 ? input.cac_eur / monthly_contribution : Infinity;

  return {
    name: input.name,
    monthly_visitors: input.monthly_visitors,
    new_signups,
    new_paid,
    churned_paid,
    total_free_users,
    total_paid_users,
    active_users,
    effective_paid_conversion_pct: new_signups > 0 ? (new_paid / new_signups) * 100 : 0,
    visitor_to_paid_pct: input.monthly_visitors > 0 ? (new_paid / input.monthly_visitors) * 100 : 0,
    rows,
    topup_units,
    topup_net_revenue: topup_net,
    mrr_gross,
    mrr_net,
    ai_cost,
    stripe_fees,
    marketing_spend,
    fixed_costs: input.fixed_costs_eur,
    gross_profit,
    net_profit,
    gross_margin_pct,
    arpu_all,
    arpu_paid,
    ltv_paid,
    ltv_cac_ratio,
    payback_months,
    arr_net: mrr_net * 12,
  };
}

export function fmtEur(n: number): string {
  return n.toLocaleString("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
export function fmtEur2(n: number): string {
  return n.toLocaleString("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}
export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}
