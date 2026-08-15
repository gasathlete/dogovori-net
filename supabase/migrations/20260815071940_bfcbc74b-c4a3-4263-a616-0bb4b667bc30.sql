-- ============ QA БОТОВЕ ============

CREATE TABLE public.qa_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  safe_mode boolean NOT NULL DEFAULT true,
  max_ops_per_day integer NOT NULL DEFAULT 4,
  consecutive_failures integer NOT NULL DEFAULT 0,
  paused_until timestamptz,
  paused_reason text,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qa_bots TO authenticated;
GRANT ALL ON public.qa_bots TO service_role;
ALTER TABLE public.qa_bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_bots_staff_read" ON public.qa_bots
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "qa_bots_service_all" ON public.qa_bots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.qa_bot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.qa_bots(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  ops_planned integer NOT NULL DEFAULT 0,
  ops_done integer NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  trigger text NOT NULL DEFAULT 'cron',
  correlation_id text,
  notes text
);

GRANT SELECT ON public.qa_bot_runs TO authenticated;
GRANT ALL ON public.qa_bot_runs TO service_role;
ALTER TABLE public.qa_bot_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_bot_runs_staff_read" ON public.qa_bot_runs
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "qa_bot_runs_service_all" ON public.qa_bot_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX qa_bot_runs_bot_started_idx ON public.qa_bot_runs (bot_id, started_at DESC);

CREATE TABLE public.qa_bot_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.qa_bot_runs(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.qa_bots(id) ON DELETE CASCADE,
  seq integer NOT NULL DEFAULT 1,
  action text NOT NULL,
  target text,
  status text NOT NULL DEFAULT 'pass',
  http_status integer,
  duration_ms integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  error_stack text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.qa_bot_actions TO authenticated;
GRANT ALL ON public.qa_bot_actions TO service_role;
ALTER TABLE public.qa_bot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_bot_actions_staff_read" ON public.qa_bot_actions
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "qa_bot_actions_service_all" ON public.qa_bot_actions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX qa_bot_actions_run_idx ON public.qa_bot_actions (run_id, seq);
CREATE INDEX qa_bot_actions_created_idx ON public.qa_bot_actions (created_at DESC);

-- Тримата бота
INSERT INTO public.qa_bots (slug, name, description, max_ops_per_day) VALUES
  ('catalog-scout', 'Каталог скаут', 'Проверява каталога, търсенето на шаблони и броячите.', 4),
  ('doc-smith', 'Документ ковач', 'Пробва генератора, AI асистента и качеството на изхода.', 3),
  ('guard-warden', 'Пазач на лимитите', 'Негативни тестове: достъп, лимити, изтекли връзки, RLS.', 4);

-- Ежедневен график: 3 стартирания дневно
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'qa-bots-runner';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'qa-bots-runner',
  '17 7,13,19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wkbxojefiovdczkwhved.supabase.co/functions/v1/qa-bot-runner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYnhvamVmaW92ZGN6a3dodmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTA4NTksImV4cCI6MjA5MzU4Njg1OX0.V8vOXm81XDKQyU9yDK2FFrsOd70585-Qj1wrVW92D1w"}'::jsonb,
    body := jsonb_build_object('trigger', 'cron', 'time', now())
  ) AS request_id;
  $$
);