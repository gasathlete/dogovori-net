-- stage_storage_raw_ingress_gate (proposed id 0046_storage_raw_ingress_gate)
--
-- SOURCE ONLY. NOT APPLIED. Reviewed copy; apply only with the procedure in
-- docs/operations/prelaunch-gate9-10-runbook.md (single atomic transaction).
--
-- Finding (metadata only): user_contracts_insert_own / user_contracts_update_own
--   still let any authenticated user write raw files into their own folder of
--   bucket user-contracts through the direct Storage API. RAW_FILE_INGRESS_ALLOWED
--   = false protects the UI only.
-- Policy: direct client raw file writes are NOT allowed while no independent
--   raw ingress exists. This is a bucket-scoped RESTRICTIVE deny; it is not a
--   MIME/size rule (future ingress file limits are a separate release dependency).
-- Preserved: SELECT/download and DELETE of own files, team SELECT from 0045,
--   every other bucket, and service_role (BYPASSRLS) server paths.
-- Rollback: DROP the two policies below (no data is touched).
BEGIN;

DROP POLICY IF EXISTS user_contracts_no_client_insert ON storage.objects;
CREATE POLICY user_contracts_no_client_insert ON storage.objects
  AS RESTRICTIVE
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id IS DISTINCT FROM 'user-contracts');

DROP POLICY IF EXISTS user_contracts_no_client_update ON storage.objects;
CREATE POLICY user_contracts_no_client_update ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (bucket_id IS DISTINCT FROM 'user-contracts')
  WITH CHECK (bucket_id IS DISTINCT FROM 'user-contracts');

COMMIT;
