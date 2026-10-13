-- staging_product_source_attestations_2026_10_14
--
-- SOURCE ONLY. NOT APPLIED. Apply ONLY in an isolated staging database,
-- after 0047 (saved_documents/document_versions client payload gate).
-- Never in the single shared production instance.
--
-- Server receipt of a server-owned DOCX attestation (psa-v1). Contains hashes,
-- counts and revision only — NEVER document text. Written only by service-role
-- Edge code (create-product-checkout / fulfill-product / refine-product via
-- _shared/product-source-binding.ts). Clients have no access at all.
--
-- Rollback: DROP TABLE public.product_source_attestations; (no other objects touched)
BEGIN;

CREATE TABLE IF NOT EXISTS public.product_source_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  uploaded_contract_id uuid NOT NULL,
  intake_id uuid NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'live')),
  attestation_version text NOT NULL CHECK (attestation_version = 'psa-v1'),
  source_kind text NOT NULL CHECK (source_kind = 'docx'),
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  char_count integer NOT NULL CHECK (char_count BETWEEN 80 AND 60000),
  source_revision text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digest, intake_id)
);
CREATE INDEX IF NOT EXISTS product_source_attestations_doc_idx
  ON public.product_source_attestations (uploaded_contract_id, environment);

REVOKE ALL ON public.product_source_attestations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_source_attestations TO service_role;
ALTER TABLE public.product_source_attestations ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: locked. service_role bypasses RLS.

COMMIT;

-- Validation (staging):
--   SELECT has_table_privilege('authenticated','public.product_source_attestations','SELECT'); -- false
--   SELECT has_table_privilege('anon','public.product_source_attestations','INSERT');          -- false
--   SELECT has_table_privilege('service_role','public.product_source_attestations','INSERT');  -- true
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_name='product_source_attestations' AND column_name ILIKE '%text' AND column_name <> 'text_sha256'; -- 0
