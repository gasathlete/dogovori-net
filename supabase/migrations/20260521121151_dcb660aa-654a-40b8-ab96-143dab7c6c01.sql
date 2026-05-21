-- AI training tables
CREATE TABLE public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  version integer NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (function_name, version)
);
CREATE INDEX idx_ai_prompts_active ON public.ai_prompts (function_name) WHERE is_active = true;

ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_prompts_service_role ON public.ai_prompts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ai_prompts_staff_select ON public.ai_prompts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY ai_prompts_staff_insert ON public.ai_prompts FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY ai_prompts_staff_update ON public.ai_prompts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.ai_training_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  input_context text NOT NULL,
  expected_output text NOT NULL,
  weight integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_examples_fn_cat ON public.ai_training_examples (function_name, category) WHERE active = true;

ALTER TABLE public.ai_training_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_examples_service_role ON public.ai_training_examples FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ai_examples_staff_all ON public.ai_training_examples FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.ai_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  rule_text text NOT NULL,
  severity text NOT NULL DEFAULT 'should' CHECK (severity IN ('must','should')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_rules_fn ON public.ai_rules (function_name) WHERE active = true;

ALTER TABLE public.ai_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_rules_service_role ON public.ai_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY ai_rules_staff_all ON public.ai_rules FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.contract_question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id text,
  contract_type text,
  trigger_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_text text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','select','boolean','date')),
  options jsonb,
  importance integer NOT NULL DEFAULT 5,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qb_sector_type ON public.contract_question_bank (sector_id, contract_type) WHERE active = true;

ALTER TABLE public.contract_question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY qb_service_role ON public.contract_question_bank FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY qb_staff_all ON public.contract_question_bank FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY qb_public_select_active ON public.contract_question_bank FOR SELECT TO authenticated USING (active = true);

-- updated_at triggers
CREATE TRIGGER trg_ai_examples_updated BEFORE UPDATE ON public.ai_training_examples
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_qb_updated BEFORE UPDATE ON public.contract_question_bank
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper to fetch active prompt
CREATE OR REPLACE FUNCTION public.get_active_prompt(_function_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT content FROM public.ai_prompts
   WHERE function_name = _function_name AND is_active = true
   ORDER BY version DESC LIMIT 1
$$;