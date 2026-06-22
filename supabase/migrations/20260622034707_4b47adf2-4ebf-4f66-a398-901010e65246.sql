
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS tokens_in integer,
  ADD COLUMN IF NOT EXISTS tokens_out integer,
  ADD COLUMN IF NOT EXISTS cost_eur numeric(10,6);

CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created ON public.ai_usage(model, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_simulation_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  rubric_min_uplift_pct numeric NOT NULL DEFAULT 15,
  max_cost_multiplier numeric NOT NULL DEFAULT 2.0,
  router_long_turns_threshold integer NOT NULL DEFAULT 6,
  router_enabled boolean NOT NULL DEFAULT true,
  model_prices jsonb NOT NULL DEFAULT '{
    "google/gemini-3-flash-preview": {"in": 0.000075, "out": 0.0003},
    "google/gemini-2.5-flash-lite":  {"in": 0.000075, "out": 0.0003},
    "google/gemini-2.5-flash":       {"in": 0.000150, "out": 0.0006},
    "google/gemini-2.5-pro":         {"in": 0.001250, "out": 0.005},
    "google/gemini-3.1-pro-preview": {"in": 0.001250, "out": 0.005},
    "openai/gpt-5.2":                {"in": 0.001500, "out": 0.006},
    "openai/gpt-5.4":                {"in": 0.002500, "out": 0.010},
    "openai/gpt-5.4-pro":            {"in": 0.005000, "out": 0.020}
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.ai_simulation_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.ai_simulation_settings TO authenticated;
GRANT ALL ON public.ai_simulation_settings TO service_role;
ALTER TABLE public.ai_simulation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_sim_settings_staff_read ON public.ai_simulation_settings;
CREATE POLICY ai_sim_settings_staff_read ON public.ai_simulation_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS ai_sim_settings_staff_write ON public.ai_simulation_settings;
CREATE POLICY ai_sim_settings_staff_write ON public.ai_simulation_settings
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
