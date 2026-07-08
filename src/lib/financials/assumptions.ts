// Editable financial assumptions for /admin/financials.
// All EUR. Source pricing: Lovable AI Gateway list prices (USD ≈ EUR for planning).

export type ModelPrice = { in_per_m: number; out_per_m: number };

export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  "gemini-flash": { in_per_m: 0.3, out_per_m: 2.5 },
  "gemini-pro": { in_per_m: 1.25, out_per_m: 10 },
  "gpt-5": { in_per_m: 2.5, out_per_m: 10 },
};

// Average tokens per "1 op", blended across op types
// (template download 40% / draft 35% / analyze 20% / assistant 5%).
export const DEFAULT_OP_PROFILE = {
  in_tokens: 4600,
  out_tokens: 2040,
  ocr_pages: 0.2,
  ocr_per_page_eur: 0.0015,
  embeddings_per_op_eur: 0.0002,
};

export type PlanKey = "free" | "prof" | "entrepreneur" | "team";

export type PlanDef = {
  key: PlanKey;
  label: string;
  gross_monthly_eur: number;
  ops_quota: number;
  routing: { flash: number; pro: number; gpt5: number };
  seats?: number;
};

export const PLANS: Record<PlanKey, PlanDef> = {
  free: { key: "free", label: "Free", gross_monthly_eur: 0, ops_quota: 2, routing: { flash: 1, pro: 0, gpt5: 0 } },
  prof: { key: "prof", label: "Професионалист", gross_monthly_eur: 12.9, ops_quota: 50, routing: { flash: 1, pro: 0, gpt5: 0 } },
  entrepreneur: { key: "entrepreneur", label: "Предприемач", gross_monthly_eur: 19.9, ops_quota: 100, routing: { flash: 0, pro: 0.6, gpt5: 0.4 } },
  team: { key: "team", label: "Екип (3 места)", gross_monthly_eur: 327 / 12, ops_quota: 300, routing: { flash: 0, pro: 0.8, gpt5: 0.2 }, seats: 3 },
};

// New funnel-driven scenario inputs.
// Pipeline: visitors → signups (free) → paid conversions → plan mix → MRR.
export type ScenarioInput = {
  name: string;
  // Top-of-funnel
  monthly_visitors: number;
  visitor_to_signup_pct: number; // % visitors → free signup
  signup_to_paid_pct: number;    // % of signups (cumulative free base) → paid (primary CRO lever)
  // Stock
  existing_free_users: number;   // already-signed-up free base at start of month
  existing_paid_users: number;   // already-paying subscribers
  monthly_paid_churn_pct: number;
  // Mix of NEW paid conversions across paid plans (sum = 1)
  paid_mix: { prof: number; entrepreneur: number; team: number };
  // Engagement
  utilization: number;           // share of monthly ops actually consumed (0-1)
  topup_attach: number;          // share of paid users buying topup_50 once/month
  // Cost & acquisition
  fixed_costs_eur: number;
  cac_eur: number;               // marketing spend per new paid customer
};

export const DEFAULT_SCENARIOS: ScenarioInput[] = [
  {
    name: "Консервативен",
    monthly_visitors: 5000,
    visitor_to_signup_pct: 3,
    signup_to_paid_pct: 2,
    existing_free_users: 400,
    existing_paid_users: 25,
    monthly_paid_churn_pct: 8,
    paid_mix: { prof: 0.75, entrepreneur: 0.22, team: 0.03 },
    utilization: 0.35,
    topup_attach: 0.05,
    fixed_costs_eur: 280,
    cac_eur: 8,
  },
  {
    name: "Базов",
    monthly_visitors: 25000,
    visitor_to_signup_pct: 5,
    signup_to_paid_pct: 4,
    existing_free_users: 2000,
    existing_paid_users: 200,
    monthly_paid_churn_pct: 6,
    paid_mix: { prof: 0.7, entrepreneur: 0.25, team: 0.05 },
    utilization: 0.55,
    topup_attach: 0.12,
    fixed_costs_eur: 450,
    cac_eur: 15,
  },
  {
    name: "Оптимистичен",
    monthly_visitors: 90000,
    visitor_to_signup_pct: 7,
    signup_to_paid_pct: 6,
    existing_free_users: 6000,
    existing_paid_users: 900,
    monthly_paid_churn_pct: 4,
    paid_mix: { prof: 0.65, entrepreneur: 0.27, team: 0.08 },
    utilization: 0.7,
    topup_attach: 0.22,
    fixed_costs_eur: 1100,
    cac_eur: 25,
  },
];

export const STRIPE_FEE_PCT = 0.029;
export const STRIPE_FEE_FIXED_EUR = 0.3;
export const VAT_RATE = 0.2;
export const TOPUP_50_GROSS_EUR = 12.9;
