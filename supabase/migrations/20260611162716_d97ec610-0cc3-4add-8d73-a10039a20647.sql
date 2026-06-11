ALTER TABLE public.legal_sources DROP CONSTRAINT legal_sources_source_type_check;
ALTER TABLE public.legal_sources ADD CONSTRAINT legal_sources_source_type_check
  CHECK (source_type = ANY (ARRAY['law','code','act','regulation','directive','ordinance','case_law','constitution','eu_regulation','eu_directive','eu_decision','treaty']));