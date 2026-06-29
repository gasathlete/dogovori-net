
CREATE TABLE IF NOT EXISTS public.lead_magnet_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  magnet_slug TEXT NOT NULL,
  source TEXT,
  user_agent TEXT,
  marketing_consent BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, magnet_slug)
);

GRANT INSERT ON public.lead_magnet_subscribers TO anon, authenticated;
GRANT ALL ON public.lead_magnet_subscribers TO service_role;

ALTER TABLE public.lead_magnet_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to a lead magnet"
  ON public.lead_magnet_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND magnet_slug IS NOT NULL
    AND length(magnet_slug) BETWEEN 1 AND 80
  );

CREATE INDEX IF NOT EXISTS idx_lead_magnet_subscribers_created
  ON public.lead_magnet_subscribers (created_at DESC);
