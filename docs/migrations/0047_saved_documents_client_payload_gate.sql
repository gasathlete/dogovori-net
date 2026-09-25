-- stage_saved_documents_client_payload_gate (proposed id 0047_saved_documents_client_payload_gate)
--
-- SOURCE ONLY. NOT APPLIED. Analogous to 0044 (uploaded_contracts text) for
-- public.saved_documents.payload. Apply after 0045 in one atomic transaction.
--
-- Client roles (anon/authenticated) may NOT write new raw content:
--   * INSERT with a non-empty payload is denied;
--   * UPDATE that changes payload is denied, EXCEPT restoring the exact payload
--     of an existing own document_versions row of the same document.
-- Allowed: every metadata-only update (title, folder_id, tags, contact_id,
--   team_id re-share from 0045), SELECT, DELETE, and all service_role writes.
-- Rollback: DROP TRIGGER saved_documents_no_client_payload_write (no data touched).
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_no_client_saved_document_payload_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY INVOKER (same convention as 0045): current_user is the caller.
  -- Only client roles are restricted; service_role/owner server paths pass.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.payload IS NOT NULL AND NEW.payload <> '{}'::jsonb THEN
      RAISE EXCEPTION 'saved_documents: client content write not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_versions v
       WHERE v.saved_document_id = OLD.id
         AND v.user_id = OLD.user_id
         AND v.user_id = auth.uid()
         AND v.payload = NEW.payload
    ) THEN
      RAISE EXCEPTION 'saved_documents: client content write not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_no_client_saved_document_payload_write() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS saved_documents_no_client_payload_write ON public.saved_documents;
CREATE TRIGGER saved_documents_no_client_payload_write
  BEFORE INSERT OR UPDATE ON public.saved_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_no_client_saved_document_payload_write();

COMMIT;
