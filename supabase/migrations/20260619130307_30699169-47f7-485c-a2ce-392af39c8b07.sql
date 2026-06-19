-- AI Self-training simulation tables
CREATE TABLE public.ai_simulation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  function_name text NOT NULL DEFAULT 'assistant-chat',
  prompt_version_id uuid REFERENCES public.ai_prompts(id) ON DELETE SET NULL,
  scenario text,
  lawyer_model text NOT NULL,
  max_turns integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','aborted')),
  avg_score numeric(4,2),
  turn_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_simulation_sessions TO authenticated;
GRANT ALL ON public.ai_simulation_sessions TO service_role;

ALTER TABLE public.ai_simulation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_sim_sessions" ON public.ai_simulation_sessions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_sim_sessions" ON public.ai_simulation_sessions
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_sim_sessions" ON public.ai_simulation_sessions
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_sim_sessions" ON public.ai_simulation_sessions
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TABLE public.ai_simulation_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_simulation_sessions(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  user_message text NOT NULL,
  dogovary_response text NOT NULL DEFAULT '',
  dogovary_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  lawyer_verdict text NOT NULL DEFAULT '',
  score integer CHECK (score BETWEEN 1 AND 10),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_simulation_turns_session_idx ON public.ai_simulation_turns(session_id, turn_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_simulation_turns TO authenticated;
GRANT ALL ON public.ai_simulation_turns TO service_role;

ALTER TABLE public.ai_simulation_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_sim_turns" ON public.ai_simulation_turns
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_sim_turns" ON public.ai_simulation_turns
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE TABLE public.ai_simulation_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_simulation_sessions(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  section_title text,
  patch_description text NOT NULL,
  patch_content text NOT NULL,
  current_content text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected')),
  applied_prompt_id uuid REFERENCES public.ai_prompts(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_simulation_patches_session_idx ON public.ai_simulation_patches(session_id);
CREATE INDEX ai_simulation_patches_status_idx ON public.ai_simulation_patches(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_simulation_patches TO authenticated;
GRANT ALL ON public.ai_simulation_patches TO service_role;

ALTER TABLE public.ai_simulation_patches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_select_sim_patches" ON public.ai_simulation_patches
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_sim_patches" ON public.ai_simulation_patches
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_sim_patches" ON public.ai_simulation_patches
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()));