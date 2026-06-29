
CREATE TABLE public.funnel_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  step SMALLINT,
  name TEXT NOT NULL,
  path TEXT,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX funnel_events_created_at_idx ON public.funnel_events (created_at DESC);
CREATE INDEX funnel_events_step_idx ON public.funnel_events (step);
CREATE INDEX funnel_events_name_idx ON public.funnel_events (name);
CREATE INDEX funnel_events_session_idx ON public.funnel_events (session_id);

GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (landing page is anonymous). Validate basic shape.
CREATE POLICY "Anyone can record funnel events"
ON public.funnel_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(session_id) BETWEEN 8 AND 128
  AND char_length(name) BETWEEN 1 AND 80
  AND (step IS NULL OR step BETWEEN 1 AND 4)
);

-- Only admins can read events for the dashboard.
CREATE POLICY "Admins can read funnel events"
ON public.funnel_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
