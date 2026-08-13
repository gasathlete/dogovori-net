ALTER TABLE public.ai_parse_failures
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS attempts integer;

CREATE INDEX IF NOT EXISTS ai_parse_failures_correlation_idx ON public.ai_parse_failures (correlation_id);