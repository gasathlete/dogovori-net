-- Apply after controlled saved-document-content callers and handler are deployed.
-- stage_saved_documents_client_payload_gate (proposed id 0047_saved_documents_client_payload_gate)
--
-- SOURCE ONLY. NOT APPLIED. Analogous to 0044 (uploaded_contracts text) for
-- public.saved_documents.payload. Apply after 0045 in one atomic transaction.
--
-- Client roles (anon/authenticated) may NOT write new raw content:
--   * INSERT with a non-empty payload is denied, EXCEPT a pointer-only payload
--     whose single key is "storage_path";
--   * UPDATE that changes payload is denied, EXCEPT
--       (a) restoring the exact payload of an existing own document_versions row
--           of the same document, or
--       (b) a pointer-only delta: everything except the "storage_path" key is
--           byte-identical, so no document text can ride along.
-- Allowed: every metadata-only update (title, folder_id, tags, contact_id,
--   team_id re-share from 0045), SELECT, DELETE, and all service_role writes.
--
-- Version-history bypass closed in the same migration: with only
-- document_versions_insert_own (WITH CHECK auth.uid() = user_id) a client could
-- INSERT an arbitrary own version row and then "restore" it into
-- saved_documents.payload, defeating the payload gate. Direct client
-- INSERT/UPDATE on public.document_versions is therefore revoked and blocked by
-- restrictive policies. public.snapshot_saved_document_version() is
-- SECURITY DEFINER owned by postgres, so automatic snapshots (on payload OR
-- title change) and the last-20 pruning keep working, and own SELECT/DELETE of
-- versions is untouched.
--
-- Rollback: DROP TRIGGER saved_documents_no_client_payload_write,
--   DROP POLICY document_versions_no_client_insert / _update,
--   re-GRANT INSERT ON public.document_versions TO authenticated.
--   No data is touched by this migration.
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
    IF NEW.payload IS NOT NULL
       AND NEW.payload <> '{}'::jsonb
       -- pointer-only insert: nothing but a storage_path reference
       AND NOT (
         jsonb_typeof(NEW.payload) = 'object'
         AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.payload) AS k)
             = ARRAY['storage_path']
         AND jsonb_typeof(NEW.payload -> 'storage_path') = 'string'
       )
    THEN
      RAISE EXCEPTION 'saved_documents: client content write not allowed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    -- (b) storage_path-only metadata delta (0045 file re-binding / team re-share).
    IF jsonb_typeof(NEW.payload) = 'object'
       AND jsonb_typeof(OLD.payload) = 'object'
       AND (NEW.payload - 'storage_path') = (OLD.payload - 'storage_path')
       AND COALESCE(jsonb_typeof(NEW.payload -> 'storage_path'), 'string') = 'string'
    THEN
      RETURN NEW;
    END IF;
    -- (a) exact restore of an own, trusted (definer-written) version snapshot.
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

-- Version history is written only by the SECURITY DEFINER snapshot trigger.
REVOKE INSERT, UPDATE ON public.document_versions FROM anon, authenticated;

DROP POLICY IF EXISTS document_versions_no_client_insert ON public.document_versions;
CREATE POLICY document_versions_no_client_insert ON public.document_versions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS document_versions_no_client_update ON public.document_versions;
CREATE POLICY document_versions_no_client_update ON public.document_versions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
