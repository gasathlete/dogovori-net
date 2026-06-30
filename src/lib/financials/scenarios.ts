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
  rows: PerPlanRow[];
  topup_units: number;
  topup_net_revenue: number;
  mrr_gross: number;
  mrr_net: number;
  ai_cost: number;
  stripe_fees: number;
  fixed_costs: number;
  gross_profit: number;
  net_profit: number;
  gross_margin_pct: number;
  arpu: number;
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
  const rows: PerPlanRow[] = (Object.keys(PLANS) as PlanKey[]).map((key) => {
    const plan = PLANS[key];
    const users = Math.round(input.active_users * (input.mix[key] ?? 0));
    const gross = users * plan.gross_monthly_eur;
    const net = gross / (1 + VAT_RATE);
    const ops_used = users * plan.ops_quota * input.utilization;
    const cpo = costPerOp(prices, plan.routing);
    return {
      key,
      label: plan.label,
      users,
      gross_revenue: gross,
      net_revenue: net,
      ops_used,
      ai_cost: ops_used * cpo,
      cost_per_op: cpo,
    };
  });

  const paid_users = rows.filter((r) => r.key !== "free").reduce((a, r) => a + r.users, 0);
  const topup_units = paid_users * input.topup_attach;
  const topup_gross = topup_units * TOPUP_50_GROSS_EUR;
  const topup_net = topup_gross / (1 + VAT_RATE);
  // Top-up adds 50 ops at Predprr-like blend → use entrepreneur cost/op as proxy
  const topup_ops = topup_units * 50;
  const topup_ai_cost = topup_ops * costPerOp(prices, PLANS.entrepreneur.routing);

  const mrr_gross = rows.reduce((a, r) => a + r.gross_revenue, 0) + topup_gross;
  const mrr_net = rows.reduce((a, r) => a + r.net_revenue, 0) + topup_net;
  const ai_cost = rows.reduce((a, r) => a + r.ai_cost, 0) + topup_ai_cost;

  const paying_charges = paid_users + topup_units;
  const stripe_fees = mrr_gross * STRIPE_FEE_PCT + paying_charges * STRIPE_FEE_FIXED_EUR;

  const gross_profit = mrr_net - ai_cost - stripe_fees;
  const net_profit = gross_profit - input.fixed_costs_eur;
  const gross_margin_pct = mrr_net > 0 ? (gross_profit / mrr_net) * 100 : 0;
  const arpu = input.active_users > 0 ? mrr_net / input.active_users : 0;

  return {
    name: input.name,
    rows,
    topup_units,
    topup_net_revenue: topup_net,
    mrr_gross,
    mrr_net,
    ai_cost,
    stripe_fees,
    fixed_costs: input.fixed_costs_eur,
    gross_profit,
    net_profit,
    gross_margin_pct,
    arpu,
    arr_net: mrr_net * 12,
  };
}

export function fmtEur(n: number): string {
  return n.toLocaleString("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function fmtEur2(n: number): string {
  return n.toLocaleString("bg-BG", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
}
