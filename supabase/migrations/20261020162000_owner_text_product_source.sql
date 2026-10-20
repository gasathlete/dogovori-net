-- Mirror of drizzle 0026_owner_text_product_source (APPLIED to MAIN 20.10.2026 via native migration tool).
ALTER TABLE public.uploaded_contracts DROP CONSTRAINT uploaded_contracts_product_source_kind_ck;
ALTER TABLE public.uploaded_contracts ADD CONSTRAINT uploaded_contracts_product_source_kind_ck CHECK (product_source_kind IS NULL OR product_source_kind = ANY (ARRAY['pdf','docx','owner_text']));
ALTER TABLE public.product_checkout_intakes DROP CONSTRAINT product_checkout_intakes_source_kind_ck;
ALTER TABLE public.product_checkout_intakes ADD CONSTRAINT product_checkout_intakes_source_kind_ck CHECK (source_kind = ANY (ARRAY['pdf','docx','owner_text']));
ALTER TABLE public.product_generation_artifacts DROP CONSTRAINT product_generation_artifacts_source_kind_check;
ALTER TABLE public.product_generation_artifacts ADD CONSTRAINT product_generation_artifacts_source_kind_check CHECK (source_kind = ANY (ARRAY['pdf','docx','owner_text']));
ALTER TABLE public.product_result_selections DROP CONSTRAINT product_result_selections_source_kind_check;
ALTER TABLE public.product_result_selections ADD CONSTRAINT product_result_selections_source_kind_check CHECK (source_kind = ANY (ARRAY['pdf','docx','owner_text']));
DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT conrelid::regclass AS t, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname IN ('product_entitlements_proof_ck','product_fulfillment_jobs_source_ck','order_snapshots_product_id_ck') LOOP
    d := replace(r.def, '''docx''::text]', '''docx''::text, ''owner_text''::text]');
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.t, r.conname, d);
  END LOOP;
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE proname='record_product_purchase' AND pronamespace='public'::regnamespace;
  d := replace(d, 'NOT IN (''pdf'', ''docx'')', 'NOT IN (''pdf'', ''docx'', ''owner_text'')');
  EXECUTE d;
END $$;

CREATE TABLE public.product_text_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  uploaded_contract_id uuid NOT NULL,
  attestation_version text NOT NULL CHECK (attestation_version = 'pta-v1'),
  text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  char_count integer NOT NULL CHECK (char_count BETWEEN 80 AND 60000),
  source_revision text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (uploaded_contract_id, source_revision)
);
REVOKE ALL ON public.product_text_attestations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_text_attestations TO service_role;
ALTER TABLE public.product_text_attestations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.product_text_attestations IS 'Service-only receipt: owner-supplied text accepted by uploaded-text-intake. Not a file extraction proof.';