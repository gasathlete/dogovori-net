CREATE TABLE IF NOT EXISTS public.ai_parse_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  fn text NOT NULL,
  model text,
  stage text NOT NULL DEFAULT 'parse',
  error_message text,
  raw_length integer,
  break_offset integer,
  break_kind text,
  break_context text,
  suggestion text,
  missing_closers text,
  repair_attempted boolean NOT NULL DEFAULT false,
  raw_tail text
);

CREATE INDEX IF NOT EXISTS ai_parse_failures_created_idx ON public.ai_parse_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_parse_failures_fn_idx ON public.ai_parse_failures (fn);

GRANT SELECT, DELETE ON public.ai_parse_failures TO authenticated;
GRANT ALL ON public.ai_parse_failures TO service_role;

ALTER TABLE public.ai_parse_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read AI parse failures" ON public.ai_parse_failures;
CREATE POLICY "Staff can read AI parse failures"
ON public.ai_parse_failures FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete AI parse failures" ON public.ai_parse_failures;
CREATE POLICY "Staff can delete AI parse failures"
ON public.ai_parse_failures FOR DELETE TO authenticated
USING (public.is_staff(auth.uid()));