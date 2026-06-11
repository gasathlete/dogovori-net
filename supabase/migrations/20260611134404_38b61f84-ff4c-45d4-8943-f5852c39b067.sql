ALTER TABLE public.legal_sources DROP CONSTRAINT IF EXISTS legal_sources_source_type_check;
ALTER TABLE public.legal_sources ADD CONSTRAINT legal_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['law'::text,'code'::text,'act'::text,'regulation'::text,'directive'::text,'ordinance'::text,'case_law'::text,'constitution'::text]));