CREATE OR REPLACE FUNCTION public.enforce_no_client_saved_document_payload_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.payload IS NOT NULL AND NEW.payload <> '{}'::jsonb AND NOT (
      jsonb_typeof(NEW.payload) = 'object'
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(NEW.payload) AS k) = ARRAY['storage_path']
      AND jsonb_typeof(NEW.payload -> 'storage_path') = 'string'
    ) THEN RAISE EXCEPTION 'saved_documents: client content write not allowed' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    IF jsonb_typeof(NEW.payload) = 'object' AND jsonb_typeof(OLD.payload) = 'object'
      AND (NEW.payload - 'storage_path') = (OLD.payload - 'storage_path')
      AND COALESCE(jsonb_typeof(NEW.payload -> 'storage_path'), 'string') = 'string'
    THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.document_versions v WHERE v.saved_document_id = OLD.id AND v.user_id = OLD.user_id AND v.user_id = auth.uid() AND v.payload = NEW.payload)
    THEN RAISE EXCEPTION 'saved_documents: client content write not allowed' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_no_client_saved_document_payload_write() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS saved_documents_no_client_payload_write ON public.saved_documents;
CREATE TRIGGER saved_documents_no_client_payload_write BEFORE INSERT OR UPDATE ON public.saved_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_no_client_saved_document_payload_write();
REVOKE INSERT, UPDATE ON public.document_versions FROM anon, authenticated;
DROP POLICY IF EXISTS document_versions_no_client_insert ON public.document_versions;
CREATE POLICY document_versions_no_client_insert ON public.document_versions AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS document_versions_no_client_update ON public.document_versions;
CREATE POLICY document_versions_no_client_update ON public.document_versions AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);