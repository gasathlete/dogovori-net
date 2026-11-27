CREATE TABLE public.product_operator_observations (
  build_marker text PRIMARY KEY,
  observed_at timestamptz NOT NULL DEFAULT now(),
  config jsonb NOT NULL,
  migration_probe jsonb NOT NULL DEFAULT '{"state":"unknown"}'::jsonb,
  legal_probe jsonb NOT NULL DEFAULT '{"state":"unknown"}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_operator_observations TO service_role;
REVOKE ALL ON public.product_operator_observations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.product_operator_observations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.product_operator_observations IS 'Private service-written deployment observations only. Safe config presence flags and bounded probe states; never credentials, user text, consent or paid rights.';