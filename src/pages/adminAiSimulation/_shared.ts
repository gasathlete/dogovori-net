// Shared types & constants for AI simulation admin tabs.
// Kept tiny so importing it from a tab chunk doesn't bloat the entry bundle.

export const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (бърз/евтин)" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "openai/gpt-5.4", label: "GPT-5.4" },
  { value: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { value: "openai/gpt-5.5", label: "GPT-5.5" },
  { value: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro" },
];
export const LAWYER_MODELS = MODEL_OPTIONS;

export const RUBRIC = ["legal_accuracy", "tool_usage", "canon_compliance", "clarity", "usefulness"] as const;
export const RUBRIC_LABELS: Record<string, string> = {
  legal_accuracy: "Право",
  tool_usage: "Tools",
  canon_compliance: "Канон",
  clarity: "Език",
  usefulness: "Полза",
};

export type TurnEvent = {
  turn: number;
  userMessage?: string;
  dogovaryResponse?: string;
  tools?: Array<{ name: string; args: any }>;
  score?: number;
  verdict?: string;
  issues?: any[];
  phase?: string;
  breakdown?: Record<string, number>;
};

export type Session = {
  id: string;
  scenario: string | null;
  lawyer_model: string;
  dogovary_model: string | null;
  status: string;
  max_turns: number;
  turn_count: number;
  avg_score: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

export type Scenario = {
  id: string;
  title: string;
  category: string;
  scenario_text: string;
  expected_behavior: string | null;
  tags: string[];
  active: boolean;
};

export type Patch = {
  id: string;
  session_id: string;
  section_key: string;
  section_title: string | null;
  patch_description: string;
  patch_content: string;
  current_content: string | null;
  status: "pending" | "applied" | "rejected";
  applied_prompt_id: string | null;
  created_at: string;
};

export type Settings = {
  rubric_min_uplift_pct: number;
  max_cost_multiplier: number;
  router_long_turns_threshold: number;
  router_enabled: boolean;
  model_prices: Record<string, { in: number; out: number }>;
};

export type CostRow = {
  model: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_eur: number;
};
