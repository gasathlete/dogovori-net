-- The generation runtime and record_product_generation_artifact both accept
-- array payloads for the review/corrections stages; the table check only
-- allowed objects, so every review artifact failed with SQLSTATE 23514.
ALTER TABLE public.product_generation_artifacts
  DROP CONSTRAINT IF EXISTS product_generation_artifacts_payload_check;

ALTER TABLE public.product_generation_artifacts
  ADD CONSTRAINT product_generation_artifacts_payload_check
  CHECK (jsonb_typeof(payload) IN ('object', 'array'));
