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
  gross_monthly_eur: number; // VAT-inclusive list price
  ops_quota: number; // ops per month included
  routing: { flash: number; pro: number; gpt5: number };
  seats?: number;
};

// Net = gross / 1.20 (VAT 20% inclusive)
export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: "free",
    label: "Free",
    gross_monthly_eur: 0,
    ops_quota: 2,
    routing: { flash: 1, pro: 0, gpt5: 0 },
  },
  prof: {
    key: "prof",
    label: "Професионалист",
    gross_monthly_eur: 12.9,
    ops_quota: 50,
    routing: { flash: 1, pro: 0, gpt5: 0 },
  },
  entrepreneur: {
    key: "entrepreneur",
    label: "Предприемач",
    gross_monthly_eur: 19.9,
    ops_quota: 120,
    routing: { flash: 0, pro: 0.6, gpt5: 0.4 },
  },
  team: {
    key: "team",
    label: "Екип (3 места, годишно)",
    gross_monthly_eur: 327 / 12, // 109 €/seat/year × 3 seats / 12
    ops_quota: 300, // 100/seat × 3
    routing: { flash: 0, pro: 0.8, gpt5: 0.2 },
    seats: 3,
  },
};

export type ScenarioInput = {
  name: string;
  active_users: number;
  mix: Record<PlanKey, number>; // share of active users; should sum to 1
  utilization: number; // share of monthly ops actually consumed (0-1)
  topup_attach: number; // share of paid users buying topup_50 once/month
  fixed_costs_eur: number; // hosting, domain, email, accounting, marketing, buffer
};

export const DEFAULT_FIXED = {
  conservative: 280,
  baseline: 450,
  optimistic: 1100,
};

export const DEFAULT_SCENARIOS: ScenarioInput[] = [
  {
    name: "Консервативен",
    active_users: 500,
    mix: { free: 0.88, prof: 0.09, entrepreneur: 0.025, team: 0.005 },
    utilization: 0.35,
    topup_attach: 0.05,
    fixed_costs_eur: DEFAULT_FIXED.conservative,
  },
  {
    name: "Базов",
    active_users: 2500,
    mix: { free: 0.8, prof: 0.14, entrepreneur: 0.05, team: 0.01 },
    utilization: 0.55,
    topup_attach: 0.12,
    fixed_costs_eur: DEFAULT_FIXED.baseline,
  },
  {
    name: "Оптимистичен",
    active_users: 8000,
    mix: { free: 0.7, prof: 0.2, entrepreneur: 0.08, team: 0.02 },
    utilization: 0.7,
    topup_attach: 0.22,
    fixed_costs_eur: DEFAULT_FIXED.optimistic,
  },
];

export const STRIPE_FEE_PCT = 0.029;
export const STRIPE_FEE_FIXED_EUR = 0.3;
export const VAT_RATE = 0.2;
export const TOPUP_50_GROSS_EUR = 12.9; // most-chosen top-up
